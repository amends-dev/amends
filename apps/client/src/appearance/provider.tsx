import type { ColorPalette } from "@amends-dev/ui/foundations/theme"
import type { Appearance } from "@amends-dev/ui/screens/workspace-navigation"
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type ParentProps
} from "solid-js"

export type SystemAppearance = Exclude<Appearance, "system">
/** Platform adapters tolerate unavailable storage and own system/window listeners. */
export interface AppearanceSource {
  readonly read: () => Appearance
  readonly write: (preference: Appearance) => void
  readonly readPalette: () => ColorPalette
  readonly writePalette: (palette: ColorPalette) => void
  readonly system: () => SystemAppearance
  readonly subscribe: (changed: () => void) => () => void
}
export interface AppearanceScope {
  readonly preference: Accessor<Appearance>
  readonly resolved: Accessor<SystemAppearance>
  readonly setPreference: (value: Appearance) => void
  readonly palette: Accessor<ColorPalette>
  readonly setPalette: (value: ColorPalette) => void
}
const Context = createContext<AppearanceScope>()

/** Appearance is local to the application, independent of authenticated session lifetime. */
export function AppearanceProvider(props: ParentProps<{ source?: AppearanceSource }>) {
  const source = props.source
  const [preference, setPreference] = createSignal<Appearance>(source?.read() ?? "system")
  const [system, setSystem] = createSignal<SystemAppearance>(source?.system() ?? "light")
  const [palette, setPalette] = createSignal<ColorPalette>(source?.readPalette() ?? "neutral")
  let alive = true
  onCleanup(() => {
    alive = false
  })
  onMount(() => {
    if (!source) return
    const update = () => {
      if (alive) {
        setPreference(source.read())
        setSystem(source.system())
        setPalette(source.readPalette())
      }
    }
    onCleanup(source.subscribe(update))
    update()
  })
  const resolved = createMemo(() => {
    const value = preference()
    return value === "system" ? system() : value
  })
  return (
    <Context.Provider
      value={{
        preference,
        resolved,
        palette,
        setPalette: (value) => {
          if (!alive) return
          source?.writePalette(value)
          setPalette(value)
        },
        setPreference: (value) => {
          if (!alive) return
          source?.write(value)
          setPreference(value)
        }
      }}
    >
      {props.children}
    </Context.Provider>
  )
}
export function useAppearance(): AppearanceScope {
  const scope = useContext(Context)
  if (!scope) throw new Error("Appearance operations require AppearanceProvider.")
  return scope
}
