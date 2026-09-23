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
import { sessionAtom } from "./state.ts";
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
  return (
    <Show when={scope()} keyed>
      {(current) => (
        <SessionContext.Provider
          value={{
            session: current.session,
            isCurrent: () => active && scope() === current,
            replace: (session) => {
              if (!active || scope() !== current) return;
              props.store.write(session);
              setScope({ session });
            },
          }}
        >
          <RegistryProvider initialValues={[[sessionAtom, current.session]]}>
            {props.children}
          </RegistryProvider>
        </SessionContext.Provider>
      )}
    </Show>
  );
}
export function useSession(): SessionScope {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session operations require ClientProvider.");
  return session;
}
