export function PageLoading({ label }: { label: string }) {
  return <section className="route-loading" role="status" aria-live="polite"><span className="route-spinner" aria-hidden="true" /><strong>{label}</strong><small>Fetching the latest Anime Cloud data…</small></section>;
}
