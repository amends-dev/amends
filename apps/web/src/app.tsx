import { Router } from "@solidjs/router";
import { createBrowserSessionStore, resolveApiBaseUrl } from "@amends-dev/client";
import { createAppearanceSource } from "./appearance.ts";
import { Application } from "./application.tsx";
import { ApplicationRoutes } from "./routes.tsx";

export function App() {
  const apiBaseUrl = resolveApiBaseUrl(
    import.meta.env.VITE_AMENDS_API_URL ?? "/api",
    window.location.href,
  );
  return (
    <Application
      appearanceSource={createAppearanceSource()}
      apiBaseUrl={apiBaseUrl}
      sessionStore={createBrowserSessionStore(apiBaseUrl)}
    >
      <Router>
        <ApplicationRoutes />
      </Router>
    </Application>
  );
}
