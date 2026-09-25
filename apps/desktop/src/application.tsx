import { ClientProvider, type ClientProviderProps } from "@amends/client";
import { Shell } from "@amends/ui/compositions/shell";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { ErrorBoundary, type ParentProps } from "solid-js";
import { PlaceholderPage } from "./placeholder-page.tsx";

export type ApplicationProps = ParentProps<ClientProviderProps>;
export function Application(props: ApplicationProps) {
  return (
    <ThemeProvider theme="cotton">
      <Shell.Root>
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
            {props.children}
          </ClientProvider>
        </ErrorBoundary>
      </Shell.Root>
    </ThemeProvider>
  );
}
