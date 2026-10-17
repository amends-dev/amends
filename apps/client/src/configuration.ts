/** Resolve once at startup. Persistence uses the same URL to isolate credentials by host. */
export function resolveApiBaseUrl(value: string, applicationUrl: string): string {
  const url = new URL(value, applicationUrl)
  if (
    !value.trim() ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("The API URL must be an HTTP(S) URL without credentials, query, or fragment.")
  return url.href.replace(/\/$/, "")
}
