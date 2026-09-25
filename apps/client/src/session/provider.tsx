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
  readonly replace: (session: SignIn.Session | undefined) => void;
  readonly isCurrent: () => boolean;
}
const SessionContext = createContext<SessionScope>();

/** Credential replacement disposes requests, cached data, and the previous owner tree. */
export function SessionProvider(props: ParentProps<{ store: SessionStore }>) {
  const [scope, setScope] = createSignal({ session: props.store.read() });
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
          setScope({ session: next });
      }),
    );
  });
  // The host rejected this scope's credential. Clear it only while storage still holds it: another
  // window may already have stored a newer one, which this window then adopts.
  const rejected = (current: { readonly session: SignIn.Session | undefined }) => {
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
        const replace = (session: SignIn.Session | undefined) => {
          if (!active || scope() !== current) return;
          props.store.write(session);
          setScope({ session });
        };
        return (
          <SessionContext.Provider
            value={{
              session: current.session,
              isCurrent: () => active && scope() === current,
              replace,
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
