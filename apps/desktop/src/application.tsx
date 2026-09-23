import type { BaseRouterProps } from "@solidjs/router";
import { ClientProvider, type ClientProviderProps } from "@amends/client";
import { ApplicationFrame, ApplicationPage } from "@amends/ui/compositions/application";
import { ErrorBoundary, type Component } from "solid-js";
import { Dynamic } from "solid-js/web";
import { ApplicationRoutes } from "./routes.tsx";

export interface ApplicationProps extends ClientProviderProps {
  readonly router: Component<BaseRouterProps>;
}
export function Application(props: ApplicationProps) {
  return (
    <ApplicationFrame>
      <ErrorBoundary
        fallback={
          <ApplicationPage
            brand="Amends"
            title="Something went wrong"
            message="Reload the app to try again."
          />
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
    </ApplicationFrame>
  );
}
