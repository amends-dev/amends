import type { BaseRouterProps } from "@solidjs/router";
import { Dynamic } from "solid-js/web";
import { ErrorBoundary, type Component } from "solid-js";
import type { Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import { createApiClient } from "./api/client.ts";
import { ApiProvider } from "./api/context.tsx";
import { SessionProvider } from "./session/provider.tsx";
import type { SessionStore } from "./session/store.ts";
import { ApplicationRoutes } from "./routing/routes.tsx";
import { FoundationPage } from "./page.tsx";
import * as styles from "./app.css.ts";

export interface ApplicationProps {
  readonly router: Component<BaseRouterProps>;
  readonly apiBaseUrl: string;
  readonly sessionStore: SessionStore;
  readonly transport?: Layer.Layer<HttpClient.HttpClient>;
}

/** Platform entry points supply routing, endpoint, and persistence once at startup. */
export function Application(props: ApplicationProps) {
  const client = createApiClient(props.apiBaseUrl, props.transport);
  return (
    <div class={`${colorThemes.cotton} ${styles.root}`}>
      <ErrorBoundary
        fallback={
          <FoundationPage title="Something went wrong" message="Reload the app to try again." />
        }
      >
        <ApiProvider client={client}>
          <SessionProvider store={props.sessionStore}>
            <Dynamic component={props.router}>
              <ApplicationRoutes />
            </Dynamic>
          </SessionProvider>
        </ApiProvider>
      </ErrorBoundary>
    </div>
  );
}
