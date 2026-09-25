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
import { PlaceholderPage } from "./placeholder-page.tsx";

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
