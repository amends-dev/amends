import { Router } from "@solidjs/router";
import { Application, createBrowserSessionStore, resolveApiBaseUrl } from "@amends/client";

export function App() {
  const apiBaseUrl = resolveApiBaseUrl(
    import.meta.env.VITE_AMENDS_API_URL ?? "/api",
    window.location.href,
  );
  return (
    <Application
      router={Router}
      apiBaseUrl={apiBaseUrl}
      sessionStore={createBrowserSessionStore(apiBaseUrl)}
    />
  );
}
