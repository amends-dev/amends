import {
  AppearanceProvider,
  useAppearance,
  ClientProvider,
  type AppearanceSource,
  type ClientProviderProps,
} from "@amends/client";
import { Shell } from "@amends/ui/compositions/shell";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { ErrorBoundary, type ParentProps } from "solid-js";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { StandalonePage } from "./standalone-page.tsx";

export type ApplicationProps = ParentProps<
  ClientProviderProps & { appearanceSource?: AppearanceSource }
>;
export function Application(props: ApplicationProps) {
  return (
    <AppearanceProvider source={props.appearanceSource}>
      <ThemedApplication
        apiBaseUrl={props.apiBaseUrl}
        sessionStore={props.sessionStore}
        transport={props.transport}
      >
        {props.children}
      </ThemedApplication>
    </AppearanceProvider>
  );
}
function ThemedApplication(props: ApplicationProps) {
  const appearance = useAppearance();
  return (
    <ThemeProvider theme={appearance.resolved() === "dark" ? "soot" : "cotton"}>
      <Shell.Root>
        <ErrorBoundary
          fallback={
            <StandalonePage account={false}>
              <EmptyState.Root>
                <Drawing.Snapped />
                <EmptyState.Text>
                  <EmptyState.Title as="h1">Something went wrong</EmptyState.Title>
                  <EmptyState.Description>
                    amends stopped on an unexpected error. Reloading usually fixes it.
                  </EmptyState.Description>
                </EmptyState.Text>
                <EmptyState.Actions>
                  <Button onClick={() => window.location.reload()}>Reload</Button>
                </EmptyState.Actions>
              </EmptyState.Root>
            </StandalonePage>
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
