import {
  AppearanceProvider,
  useAppearance,
  ClientProvider,
  type AppearanceSource,
  type ClientProviderProps,
} from "@amends/client";
import { Theme } from "@amends/ui/foundations/theme";
import { CrashedScreen } from "@amends/ui/screens/standalone";
import { ErrorBoundary, type ParentProps } from "solid-js";

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
    <Theme mode={appearance.resolved()} palette={appearance.palette()}>
      <ErrorBoundary
        fallback={<CrashedScreen homeHref="/" onReload={() => window.location.reload()} />}
      >
        <ClientProvider
          apiBaseUrl={props.apiBaseUrl}
          sessionStore={props.sessionStore}
          transport={props.transport}
        >
          {props.children}
        </ClientProvider>
      </ErrorBoundary>
    </Theme>
  );
}
