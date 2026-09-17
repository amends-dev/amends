import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  useContext,
} from "solid-js";
import { colors, type ThemeName } from "@amends/ui/tokens";

type ThemePreference = ThemeName | "system";
const preferenceOf = (value: string | null | undefined): ThemePreference =>
  value === "cotton" || value === "soot" ? value : "system";

/** Application preference; token values and shared styles never read browser storage. */
export function createTheme() {
  const [preference, setPreference] = createSignal<ThemePreference>(
    preferenceOf(document.documentElement.dataset.themePreference),
  );
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const [systemDark, setSystemDark] = createSignal(media.matches);
  const resolved = (): ThemeName => {
    const current = preference();
    return current === "system" ? (systemDark() ? "soot" : "cotton") : current;
  };

  createEffect(() => {
    document.documentElement.dataset.theme = resolved();
    document.documentElement.dataset.themePreference = preference();
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", colors[resolved()].surface.canvas);
  });

  onMount(() => {
    const change = () => setSystemDark(media.matches);
    const storage = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === "amends.theme" || event.key === null)
      )
        setPreference(preferenceOf(event.newValue));
    };
    media.addEventListener("change", change);
    window.addEventListener("storage", storage);
    onCleanup(() => {
      media.removeEventListener("change", change);
      window.removeEventListener("storage", storage);
    });
  });

  const choose = (next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem("amends.theme", next);
    } catch {
      /* Appearance still works when browser storage is unavailable. */
    }
  };
  return { preference, resolved, choose };
}

export const ThemeContext = createContext<ReturnType<typeof createTheme>>();
export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("Theme controls require the application theme provider.");
  return theme;
}
