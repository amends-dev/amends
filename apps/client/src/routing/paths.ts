export const paths = {
  signIn: "/sign-in",
  workspaces: "/workspaces",
  workspace: (id: string) => `/workspaces/${encodeURIComponent(id)}`,
} as const;

/** Only internal protected destinations can be resumed after authentication. */
export function returnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\s]/.test(value))
    return paths.workspaces;
  const url = new URL(value, "https://amends.invalid");
  if (
    url.origin !== "https://amends.invalid" ||
    !(url.pathname === paths.workspaces || /^\/workspaces\/[^/]+$/.test(url.pathname))
  )
    return paths.workspaces;
  return `${url.pathname}${url.search}${url.hash}`;
}
export const signInPath = (destination: string) =>
  `${paths.signIn}?returnTo=${encodeURIComponent(returnPath(destination))}`;
