import { RegistryProvider } from "@effect/atom-solid";
import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  Show,
  useContext,
  type ParentProps,
} from "solid-js";
import type { SignIn } from "../api/contracts.ts";
import { sessionAtom, signOutAtom } from "./state.ts";
import type { SessionStore } from "./store.ts";

export interface SessionScope {
  readonly session: SignIn.Session | undefined;
  /**
   * The last credential was cleared by signing out, here or in another window, rather than
   * rejected by the host: whoever signs in next starts afresh instead of returning to where the
   * previous person was.
   */
  readonly signedOut: boolean;
  readonly replace: (session: SignIn.Session | undefined) => void;
  /** Clear the credential, so that the next sign-in starts afresh. */
  readonly signOut: () => void;
  readonly isCurrent: () => boolean;
}
interface Scope {
  readonly session: SignIn.Session | undefined;
  readonly signedOut?: boolean;
}
const SessionContext = createContext<SessionScope>();

/** Credential replacement disposes requests, cached data, and the previous owner tree. */
export function SessionProvider(props: ParentProps<{ store: SessionStore }>) {
  const [scope, setScope] = createSignal<Scope>({ session: props.store.read() });
  let active = true;
  onCleanup(() => {
    active = false;
  });
  onMount(() => {
    onCleanup(
      props.store.subscribe(() => {
        const next = props.store.read();
        const current = scope().session;
        if (next?.token !== current?.token || next?.humanId !== current?.humanId)
          // Another window cleared the credential: its person signed out.
          setScope({ session: next, signedOut: next === undefined && current !== undefined });
      }),
    );
  });
  // The host rejected this scope's credential. Clear it only while storage still holds it: another
  // window may already have stored a newer one, which this window then adopts.
  const rejected = (current: Scope) => {
    if (!active || scope() !== current || !current.session) return;
    const stored = props.store.read();
    if (stored && stored.token !== current.session.token) {
      setScope({ session: stored });
      return;
    }
    props.store.write(undefined);
    setScope({ session: undefined });
  };
  return (
    <Show when={scope()} keyed>
      {(current) => {
        const replace = (session: SignIn.Session | undefined, signedOut = false) => {
          if (!active || scope() !== current) return;
          props.store.write(session);
          setScope({ session, signedOut });
        };
        return (
          <SessionContext.Provider
            value={{
              session: current.session,
              signedOut: current.signedOut === true,
              isCurrent: () => active && scope() === current,
              replace: (session) => replace(session),
              signOut: () => replace(undefined, true),
            }}
          >
            <RegistryProvider
              initialValues={[
                [sessionAtom, current.session],
                [signOutAtom, () => rejected(current)],
              ]}
            >
              {props.children}
            </RegistryProvider>
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
