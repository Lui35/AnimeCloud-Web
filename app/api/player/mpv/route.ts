import { constants } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { putProgress } from "../../_db";
import { corsJson } from "../../_legacy";
import { resolvePlaybackSource } from "../../_playback";
import { getSession } from "../../_session";

export const runtime = "nodejs";

const shaderSets = {
  A: ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Restore_CNN_VL.glsl", "Anime4K_Upscale_CNN_x2_VL.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
  B: ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Restore_CNN_Soft_VL.glsl", "Anime4K_Upscale_CNN_x2_VL.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
  C: ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
  "A+A": ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Restore_CNN_VL.glsl", "Anime4K_Upscale_CNN_x2_VL.glsl", "Anime4K_Restore_CNN_M.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
  "B+B": ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Restore_CNN_Soft_VL.glsl", "Anime4K_Upscale_CNN_x2_VL.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Restore_CNN_Soft_M.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
  "C+A": ["Anime4K_Clamp_Highlights.glsl", "Anime4K_Upscale_Denoise_CNN_x2_VL.glsl", "Anime4K_AutoDownscalePre_x2.glsl", "Anime4K_AutoDownscalePre_x4.glsl", "Anime4K_Restore_CNN_M.glsl", "Anime4K_Upscale_CNN_x2_M.glsl"],
} as const;

type MpvPlayback = {
  pid: number;
  episodeId: string;
  animeId: string;
  episodeNumber: number | null;
  position: number;
  duration: number;
  watched: boolean;
  active: boolean;
  updatedAt: number;
  userID?: string;
  lastSavedAt: number;
};

const processStore = globalThis as typeof globalThis & {
  animeCloudMpvProcesses?: Set<number>;
  animeCloudMpvPlayback?: MpvPlayback;
};
const activeMpvProcesses = processStore.animeCloudMpvProcesses ??= new Set<number>();

function runningMpvProcesses() {
  for (const pid of activeMpvProcesses) {
    try { process.kill(pid, 0); } catch { activeMpvProcesses.delete(pid); }
  }
  const playback = processStore.animeCloudMpvPlayback;
  if (playback?.active && !activeMpvProcesses.has(playback.pid)) {
    playback.active = false;
    playback.updatedAt = Date.now();
    savePlayback(playback, true);
  }
  return [...activeMpvProcesses];
}

function stopMpvProcesses() {
  const processes = runningMpvProcesses();
  for (const pid of processes) {
    try { process.kill(pid); } catch { /* the process already exited */ }
    activeMpvProcesses.delete(pid);
  }
  return processes.length;
}

function mpvCommand() { return process.env.MPV_PATH || "mpv"; }

function shaderDirectory() {
  if (process.env.ANIME4K_SHADER_DIR) return process.env.ANIME4K_SHADER_DIR;
  if (process.platform === "win32" && process.env.APPDATA) return path.join(process.env.APPDATA, "mpv", "shaders");
  if (process.platform === "darwin") return path.join(process.env.HOME || "", "Library", "Application Support", "mpv", "shaders");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || "", ".config"), "mpv", "shaders");
}

function tlsVerificationArgs() {
  return /^(0|false|no)$/i.test(String(process.env.MPV_TLS_VERIFY ?? "true")) ? ["--tls-verify=no"] : [];
}

function logFileArgs() {
  return process.env.MPV_LOG_FILE ? [`--log-file=${process.env.MPV_LOG_FILE}`] : [];
}

function powershellLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function windowsArgument(value: string) {
  if (!/[\s"]/.test(value)) return value;
  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/, "$1$1")}"`;
}

function stopConfiguredWindowsMpv() {
  return new Promise<number>((resolve, reject) => {
    const script = `$ErrorActionPreference = 'Stop'; $target = (Get-Command ${powershellLiteral(mpvCommand())}).Source; $name = [IO.Path]::GetFileNameWithoutExtension($target); $processes = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target }); $count = $processes.Count; $processes | Stop-Process -Force; Write-Output $count;`;
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let error = "";
    child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { error += chunk.toString(); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(Number(output.trim().match(/\d+$/)?.[0]) || 0) : reject(new Error(error.trim() || "MPV could not be stopped.")));
  });
}

async function stopAllMpvProcesses() {
  const stopped = process.platform === "win32" ? await stopConfiguredWindowsMpv() : stopMpvProcesses();
  activeMpvProcesses.clear();
  return stopped;
}

function shaderPaths(selectedMode: keyof typeof shaderSets) {
  return shaderSets[selectedMode].map((file) => path.join(shaderDirectory(), file));
}

function allShaderPaths() {
  return [...new Set(Object.values(shaderSets).flat())].map((file) => path.join(shaderDirectory(), file));
}

async function shadersInstalled() {
  return (await Promise.all(allShaderPaths().map((file) => access(file, constants.F_OK).then(() => true).catch(() => false)))).every(Boolean);
}

function commandInstalled() {
  return new Promise<boolean>((resolve) => {
    const child = spawn(mpvCommand(), ["--version"], { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 2500);
    child.once("error", () => { clearTimeout(timer); resolve(false); });
    child.once("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}

function publicPlayback(playback = processStore.animeCloudMpvPlayback) {
  if (!playback) return undefined;
  const { episodeId, animeId, episodeNumber, position, duration, watched, active, updatedAt } = playback;
  return { episodeId, animeId, episodeNumber, position: watched ? 0 : position, duration, watched, active, updatedAt };
}

function savePlayback(playback: MpvPlayback, force = false) {
  const now = Date.now();
  playback.watched ||= playback.duration > 0 && playback.position / playback.duration >= .95;
  if (!playback.userID || (!force && now - playback.lastSavedAt < 5000) || (!playback.watched && playback.position < 3)) return;
  playback.lastSavedAt = now;
  try {
    putProgress(playback.userID, { episodeId: playback.episodeId, animeId: playback.animeId, episodeNumber: playback.episodeNumber, position: playback.position, duration: playback.duration, watched: playback.watched });
  } catch { /* browser-side progress still remains available */ }
}

function monitorMpv(pipeName: string, playback: MpvPlayback) {
  let attempts = 0;
  const connect = () => {
    const socket = createConnection(pipeName);
    let connected = false;
    let input = "";
    socket.once("connect", () => {
      connected = true;
      for (const [id, property] of [[1, "time-pos"], [2, "duration"]] as const) {
        socket.write(`${JSON.stringify({ command: ["observe_property", id, property] })}\n`);
      }
    });
    socket.on("data", (chunk) => {
      input += chunk.toString();
      const lines = input.split("\n");
      input = lines.pop() || "";
      for (const line of lines) {
        try {
          const message = JSON.parse(line) as { event?: string; name?: string; data?: unknown; reason?: string };
          if (message.event === "property-change" && message.name === "time-pos" && typeof message.data === "number") playback.position = Math.max(0, message.data);
          if (message.event === "property-change" && message.name === "duration" && typeof message.data === "number") playback.duration = Math.max(0, message.data);
          if (message.event === "end-file" && message.reason === "eof") playback.watched = true;
          playback.updatedAt = Date.now();
          savePlayback(playback);
        } catch { /* ignore non-JSON diagnostic output */ }
      }
    });
    socket.once("error", () => {
      socket.destroy();
      if (!connected && attempts++ < 50) setTimeout(connect, 100);
    });
    socket.once("close", () => {
      if (!connected) return;
      playback.active = false;
      playback.updatedAt = Date.now();
      activeMpvProcesses.delete(playback.pid);
      savePlayback(playback, true);
    });
  };
  connect();
}

async function inputConfig() {
  const lines = Object.entries(shaderSets).map(([label], index) => {
    const shaders = shaderPaths(label as keyof typeof shaderSets).map((file) => file.replace(/\\/g, "/")).join(";");
    return `CTRL+${index + 1} no-osd change-list glsl-shaders set "${shaders}"; show-text "Anime4K: Mode ${label} (HQ)"`;
  });
  lines.push('CTRL+0 no-osd change-list glsl-shaders clr ""; show-text "Anime4K: Disabled"');
  const filename = path.join(tmpdir(), `animecloud-mpv-input-${process.pid}.conf`);
  await writeFile(filename, `${lines.join("\n")}\n`, "utf8");
  return filename;
}

async function setupStatus() {
  const [mpv, anime4k] = await Promise.all([commandInstalled(), shadersInstalled()]);
  const active = runningMpvProcesses().length > 0;
  return { mpv, anime4k, mode: "Manual", active, playback: publicPlayback() };
}

export async function GET() {
  return corsJson(await setupStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  try {
    const stopped = await stopAllMpvProcesses();
    return corsJson({ ok: true, stopped, ...await setupStatus() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "MPV could not be stopped." }, { status: 502 });
  }
}

function launchMpv(args: string[]) {
  return new Promise<number>((resolve, reject) => {
    if (process.platform === "win32") {
      const commandLine = args.map(windowsArgument).join(" ");
      const script = `$ErrorActionPreference = 'Stop'; $target = (Get-Command ${powershellLiteral(mpvCommand())}).Source; $name = [IO.Path]::GetFileNameWithoutExtension($target); $before = @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { $_.Id }); $shell = New-Object -ComObject Shell.Application; $shell.ShellExecute($target, ${powershellLiteral(commandLine)}, '', 'open', 1); $process = $null; for ($attempt = 0; $attempt -lt 50 -and -not $process; $attempt++) { Start-Sleep -Milliseconds 100; $process = Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Select-Object -First 1 }; if (-not $process) { throw 'MPV process was not created.' }; Write-Output $process.Id;`;
      const encoded = Buffer.from(script, "utf16le").toString("base64");
      const child = spawn("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { stdio: ["ignore", "pipe", "pipe"], windowsHide: false });
      let output = "";
      let error = "";
      child.stdout?.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr?.on("data", (chunk) => { error += chunk.toString(); });
      child.once("error", reject);
      child.once("exit", (code) => {
        const pid = Number(output.trim().match(/\d+$/)?.[0]);
        if (code === 0 && Number.isInteger(pid) && pid > 0) resolve(pid);
        else reject(new Error(error.trim() || "MPV could not be started."));
      });
      return;
    }

    const child = spawn(mpvCommand(), args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("exit", () => { if (child.pid) activeMpvProcesses.delete(child.pid); });
    child.once("spawn", () => { if (!child.pid) return reject(new Error("MPV started without a process ID.")); child.unref(); resolve(child.pid); });
  });
}

export async function POST(request: Request) {
  const setup = await setupStatus();
  if (!setup.mpv) return corsJson({ message: "MPV is not installed or MPV_PATH is not configured." }, { status: 503 });
  if (!setup.anime4k) return corsJson({ message: "The complete Anime4K high-end shader set is not installed. Follow the MPV setup instructions in the project README." }, { status: 503 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const episodeId = typeof body.episodeId === "string" ? body.episodeId.trim() : "";
  const animeId = typeof body.animeId === "string" ? body.animeId.trim() : "";
  const episodeNumber = typeof body.episodeNumber === "number" && Number.isFinite(body.episodeNumber) ? Math.max(0, Math.floor(body.episodeNumber)) : null;
  const position = typeof body.position === "number" && Number.isFinite(body.position) ? Math.max(0, Math.min(body.position, 86400 * 7)) : 0;
  const title = typeof body.title === "string" ? body.title.replace(/[\r\n]/g, " ").slice(0, 160) : "Anime Cloud";
  if (!episodeId) return corsJson({ message: "episodeId is required." }, { status: 400 });

  try {
    const [source, conf, session] = await Promise.all([resolvePlaybackSource(episodeId), inputConfig(), getSession()]);
    await stopAllMpvProcesses();
    const pipeName = process.platform === "win32" ? `\\\\.\\pipe\\animecloud-mpv-${randomUUID()}` : path.join(tmpdir(), `animecloud-mpv-${randomUUID()}.sock`);
    const args = [
      "--no-config",
      `--input-conf=${conf}`,
      `--input-ipc-server=${pipeName}`,
      "--force-window=immediate",
      "--border=yes",
      "--osc=yes",
      "--osd-duration=3000",
      "--input-default-bindings=yes",
      "--vid=auto",
      ...tlsVerificationArgs(),
      ...logFileArgs(),
      `--title=AnimeCloud-${title.replace(/\s+/g, "_")}`,
      ...shaderPaths("A").map((file) => `--glsl-shader=${file}`),
      ...(position > 3 ? [`--start=${position}`] : []),
      source.url,
    ];
    const pid = await launchMpv(args);
    activeMpvProcesses.add(pid);
    const playback: MpvPlayback = { pid, episodeId, animeId, episodeNumber, position, duration: 0, watched: false, active: true, updatedAt: Date.now(), userID: session?.userID, lastSavedAt: 0 };
    processStore.animeCloudMpvPlayback = playback;
    monitorMpv(pipeName, playback);
    return corsJson({ ok: true, mode: "A", note: source.note });
  } catch (error) {
    return corsJson({ message: error instanceof Error ? error.message : "MPV could not be started." }, { status: 502 });
  }
}
