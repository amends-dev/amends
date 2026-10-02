import { RegistryProvider } from "@effect/atom-solid";
import type { Layer } from "effect";
import type { HttpClient } from "effect/unstable/http";
import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";
import { createApiClient, type ApiClient } from "./api/client.ts";
import type { SignIn } from "./api/contracts.ts";
import type { SessionStore } from "./session/store.ts";

export interface ClientProviderProps {
  readonly apiBaseUrl: string;
  readonly sessionStore: SessionStore;
  readonly transport?: Layer.Layer<HttpClient.HttpClient>;
}
export interface SessionScope {
  readonly session: SignIn.Session | undefined;
  /**
   * The last credential was cleared by signing out, here or in another window, rather than
   * rejected by the host: whoever signs in next starts afresh instead of returning to where the
   * previous person was.
   */
  readonly signedOut: boolean;
  /** Keep the credential sign-in returned; everything under the provider remounts for it. */
  readonly signIn: (session: SignIn.Session) => void;
  /** Clear the credential, so that the next sign-in starts afresh. */
  readonly signOut: () => void;
}
interface Scope {
  readonly session: SignIn.Session | undefined;
  readonly signedOut: boolean;
}
const SessionContext = createContext<SessionScope>();
const ApiContext = createContext<ApiClient>();

/**
 * The credential, and the API client and atom registry made for it. Changing the credential
 * remounts everything under the provider, which interrupts the old credential's requests and
 * discards what it read. The consumer owns routing and all rendered content.
 */
export function ClientProvider(props: ParentProps<ClientProviderProps>) {
  const store = props.sessionStore;
  const [scope, setScope] = createSignal<Scope>({ session: store.read(), signedOut: false });
  onMount(() => {
    onCleanup(
      store.subscribe(() => {
        const next = store.read();
        const current = scope().session;
        if (next?.token !== current?.token || next?.humanId !== current?.humanId)
          // Another window cleared the credential: its person signed out.
          setScope({ session: next, signedOut: next === undefined && current !== undefined });
      }),
    );
  });
  return (
    <Show when={scope()} keyed>
      {(current) => {
        // Only the scope on screen changes the credential; a replaced one's late calls do nothing.
        let shown = true;
        onCleanup(() => {
          shown = false;
        });
        const change = (session: SignIn.Session | undefined, signedOut: boolean) => {
          if (!shown) return;
          store.write(session);
          setScope({ session, signedOut });
        };
        // The host rejected this credential. Clear it only while storage still holds it: another
        // window may already have stored a newer one, which this window then adopts.
        const rejected = () => {
          if (!shown) return;
          const stored = store.read();
          if (stored && stored.token !== current.session?.token)
            setScope({ session: stored, signedOut: false });
          else change(undefined, false);
        };
        const client = createApiClient({
          baseUrl: props.apiBaseUrl,
          transport: props.transport,
          session: current.session,
          rejected,
        });
        return (
          <SessionContext.Provider
            value={{
              session: current.session,
              signedOut: current.signedOut,
              signIn: (session) => change(session, false),
              signOut: () => change(undefined, true),
            }}
          >
            <ApiContext.Provider value={client}>
              <RegistryProvider>{props.children}</RegistryProvider>
            </ApiContext.Provider>
          </SessionContext.Provider>
        );
      }}
    </Show>
  );
}
export function useSession(): SessionScope {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session operations require ClientProvider.");
  return session;
}
export function useApiClient(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("API operations require ClientProvider.");
  return client;
}
