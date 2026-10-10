import { HashRouter } from "@solidjs/router";
import { createBrowserSessionStore, resolveApiBaseUrl } from "@amends-dev/client";
import { createAppearanceSource } from "./appearance.ts";
import { Application } from "./application.tsx";
import { ApplicationRoutes } from "./routes.tsx";

export function App() {
  const apiBaseUrl = resolveApiBaseUrl(
    import.meta.env.VITE_AMENDS_API_URL ?? "http://127.0.0.1:8787",
    window.location.href,
  );
  return (
    <Application
      appearanceSource={createAppearanceSource()}
      apiBaseUrl={apiBaseUrl}
      sessionStore={createBrowserSessionStore(apiBaseUrl)}
    >
      <HashRouter>
        <ApplicationRoutes />
      </HashRouter>
    </Application>
  );
}
