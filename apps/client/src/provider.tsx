import type { Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import type { ParentProps } from "solid-js";
import { createApiClient } from "./api/client.ts";
import { ApiProvider } from "./api/context.tsx";
import { SessionProvider } from "./session/provider.tsx";
import type { SessionStore } from "./session/store.ts";

export interface ClientProviderProps {
  readonly apiBaseUrl: string;
  readonly sessionStore: SessionStore;
  readonly transport?: Layer.Layer<HttpClient.HttpClient>;
}

/** Provides headless client state. The consumer owns routing and all rendered content. */
export function ClientProvider(props: ParentProps<ClientProviderProps>) {
  const client = createApiClient(props.apiBaseUrl, props.transport);
  return (
    <ApiProvider client={client}>
      <SessionProvider store={props.sessionStore}>{props.children}</SessionProvider>
    </ApiProvider>
  );
}
