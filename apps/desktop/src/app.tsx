import { HashRouter } from "@solidjs/router";
import { createBrowserSessionStore, resolveApiBaseUrl } from "@amends/client";
import { Application } from "./application.tsx";

export function App() {
  const apiBaseUrl = resolveApiBaseUrl(
    import.meta.env.VITE_AMENDS_API_URL ?? "http://127.0.0.1:8787",
    window.location.href,
  );
  return (
    <Application
      router={HashRouter}
      apiBaseUrl={apiBaseUrl}
      sessionStore={createBrowserSessionStore(apiBaseUrl)}
    />
  );
}
