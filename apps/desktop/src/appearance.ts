import type { AppearancePreference, AppearanceSource } from "@amends/client";
const key = "amends.appearance";
const preference = (value: string | null): AppearancePreference =>
  value === "light" || value === "dark" ? value : "system";

/** One platform source per application. Blocked storage keeps the in-memory choice. */
export function createAppearanceSource(target: Window = window): AppearanceSource {
  const media = target.matchMedia("(prefers-color-scheme: dark)");
  let fallback: AppearancePreference = "system";
  return {
    read: () => {
      try {
        fallback = preference(target.localStorage.getItem(key));
      } catch {
        /* Retain the local choice. */
      }
      return fallback;
    },
    write: (value) => {
      fallback = value;
      try {
        target.localStorage.setItem(key, value);
      } catch {
        /* Appearance still works in memory. */
      }
    },
    system: () => (media.matches ? "dark" : "light"),
    subscribe: (changed) => {
      const storage = (event: StorageEvent) => {
        if (event.key !== null && event.key !== key) return;
        try {
          if (event.storageArea !== target.localStorage) return;
        } catch {
          return;
        }
        changed();
      };
      media.addEventListener("change", changed);
      target.addEventListener("storage", storage);
      return () => {
        media.removeEventListener("change", changed);
        target.removeEventListener("storage", storage);
      };
    },
  };
}
