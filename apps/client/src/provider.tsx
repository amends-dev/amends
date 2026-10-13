import { RegistryProvider } from "@effect/atom-solid/RegistryContext";
import * as Effect from "effect/Effect";
import type * as Layer from "effect/Layer";
import type * as HttpClient from "effect/http/HttpClient";
import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";
import { createApiClient, revokeSession, type ApiClient } from "./api/client.ts";
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
  /**
   * Clear the credential, so that the next sign-in starts afresh, and ask the host to stop
   * honoring it.
   */
  readonly signOut: () => void;
}
interface Scope {
  readonly session: SignIn.Session | undefined;
  readonly signedOut: boolean;
}
const SessionContext = createContext<SessionScope>();
const ApiContext = createContext<ApiClient>();
const WorkspaceClientsContext = createContext<(workspaceId: string) => ApiClient>();

/**
 * The credential, and the API clients and atom registry made for it: one client for the session,
 * and one for each workspace it acts in. Changing the credential remounts everything under the
 * provider, which interrupts the old credential's requests and discards what it read. The consumer
 * owns routing and all rendered content.
 */
export function ClientProvider(props: ParentProps<ClientProviderProps>) {
  const store = props.sessionStore;
  const [scope, setScope] = createSignal<Scope>({ session: store.read(), signedOut: false });
  onMount(() => {
    onCleanup(
      store.subscribe(() => {
        const next = store.read();
        const current = scope().session;
        if (next?.token !== current?.token || next?.account.id !== current?.account.id)
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
        const options = {
          baseUrl: props.apiBaseUrl,
          transport: props.transport,
          session: current.session,
          rejected,
        };
        const client = createApiClient(options);
        // A workspace's client is made when first used, and kept while the credential is.
        const workspaceClients = new Map<string, ApiClient>();
        const workspaceClient = (workspaceId: string) => {
          const existing = workspaceClients.get(workspaceId);
          if (existing) return existing;
          const made = createApiClient(options, workspaceId);
          workspaceClients.set(workspaceId, made);
          return made;
        };
        return (
          <SessionContext.Provider
            value={{
              session: current.session,
              signedOut: current.signedOut,
              signIn: (session) => change(session, false),
              signOut: () => {
                const signedIn = current.session;
                change(undefined, true);
                if (signedIn)
                  void Effect.runPromise(
                    revokeSession({
                      baseUrl: props.apiBaseUrl,
                      transport: props.transport,
                      session: signedIn,
                    }),
                  );
              },
            }}
          >
            <ApiContext.Provider value={client}>
              <WorkspaceClientsContext.Provider value={workspaceClient}>
                <RegistryProvider>{props.children}</RegistryProvider>
              </WorkspaceClientsContext.Provider>
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
/** The session's API client, which acts in no workspace. */
export function useApiClient(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("API operations require ClientProvider.");
  return client;
}
/** The API client acting in the workspace `workspaceId`, for the session's credential. */
export function useWorkspaceClient(workspaceId: string): ApiClient {
  const workspaceClient = useContext(WorkspaceClientsContext);
  if (!workspaceClient) throw new Error("API operations require ClientProvider.");
  return workspaceClient(workspaceId);
}
