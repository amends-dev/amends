import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";

export type AppearancePreference = "light" | "dark" | "system";
export type SystemAppearance = Exclude<AppearancePreference, "system">;
/** Platform adapters tolerate unavailable storage and own system/window listeners. */
export interface AppearanceSource {
  readonly read: () => AppearancePreference;
  readonly write: (preference: AppearancePreference) => void;
  readonly system: () => SystemAppearance;
  readonly subscribe: (changed: () => void) => () => void;
}
export interface AppearanceScope {
  readonly preference: Accessor<AppearancePreference>;
  readonly resolved: Accessor<SystemAppearance>;
  readonly setPreference: (value: AppearancePreference) => void;
}
const Context = createContext<AppearanceScope>();

/** Appearance is local to the application, independent of authenticated session lifetime. */
export function AppearanceProvider(props: ParentProps<{ source?: AppearanceSource }>) {
  const source = props.source;
  const [preference, setPreference] = createSignal<AppearancePreference>(
    source?.read() ?? "system",
  );
  const [system, setSystem] = createSignal<SystemAppearance>(source?.system() ?? "light");
  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  onMount(() => {
    if (!source) return;
    const update = () => {
      if (alive) {
        setPreference(source.read());
        setSystem(source.system());
      }
    };
    onCleanup(source.subscribe(update));
    update();
  });
  const resolved = createMemo(() => {
    const value = preference();
    return value === "system" ? system() : value;
  });
  return (
    <Context.Provider
      value={{
        preference,
        resolved,
        setPreference: (value) => {
          if (!alive) return;
          source?.write(value);
          setPreference(value);
        },
      }}
    >
      {props.children}
    </Context.Provider>
  );
}
export function useAppearance(): AppearanceScope {
  const scope = useContext(Context);
  if (!scope) throw new Error("Appearance operations require AppearanceProvider.");
  return scope;
}
