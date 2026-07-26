import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  return {
    metadataBase: base,
    title: "Anime Cloud — Your anime, always in sync",
    description: "Discover, track and watch anime with the modern Anime Cloud web client.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Anime Cloud",
      description: "Your library. Your pace. Always in sync.",
      type: "website",
      images: [{ url: new URL("/og.png", base), width: 1200, height: 630, alt: "Anime Cloud — Your anime, always in sync." }],
    },
    twitter: { card: "summary_large_image", title: "Anime Cloud", description: "Your anime, always in sync.", images: [new URL("/og.png", base)] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
