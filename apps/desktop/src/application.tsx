import type { BaseRouterProps } from "@solidjs/router";
import { ClientProvider, type ClientProviderProps } from "@amends/client";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import { fontFamilies } from "@amends/ui/foundations/typography";
import { ErrorBoundary, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ApplicationRoutes } from "./routes.tsx";
import { PlaceholderPage } from "./placeholder-page.tsx";

export interface ApplicationProps extends ClientProviderProps {
  readonly router: Component<BaseRouterProps>;
}
export function Application(props: ApplicationProps) {
  return (
    <div
      class={colorThemes.cotton}
      style={{ "min-height": "100dvh", "font-family": fontFamilies.sans }}
    >
      <ErrorBoundary
        fallback={
          <PlaceholderPage title="Something went wrong" message="Reload the app to try again." />
        }
      >
        <ClientProvider
          apiBaseUrl={props.apiBaseUrl}
          sessionStore={props.sessionStore}
          transport={props.transport}
        >
          <Dynamic component={props.router}>
            <ApplicationRoutes />
          </Dynamic>
        </ClientProvider>
      </ErrorBoundary>
    </div>
  );
}
