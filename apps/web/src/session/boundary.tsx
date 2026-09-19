import type { SignIn } from "@amends/gateway/sign-in";
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
import { readSession, saveSession, sessionAtom } from "./session.ts";

interface SessionScope {
  readonly session: SignIn.Session | undefined;
  readonly replace: (session: SignIn.Session | undefined) => void;
  readonly isCurrent: () => boolean;
}
const SessionContext = createContext<SessionScope>();

/** Replacing credentials disposes the whole data registry and its owner tree. */
export function SessionBoundary(props: ParentProps) {
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const [scope, setScope] = createSignal({ session: readSession() });
  const replace = (session: SignIn.Session | undefined) => {
    saveSession(session);
    setScope({ session });
  };
  onMount(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === "amends.session" || event.key === null)
        setScope({ session: readSession() });
    };
    window.addEventListener("storage", changed);
    onCleanup(() => window.removeEventListener("storage", changed));
  });
  return (
    <Show when={scope()} keyed>
      {(current) => (
        <SessionContext.Provider
          value={{
            session: current.session,
            isCurrent: () => active && scope() === current,
            replace: (session) => {
              if (active && scope() === current) replace(session);
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

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Session components require SessionBoundary.");
  return session;
}
