import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import {
  AppearanceProvider,
  useAppearance,
  type AppearancePreference,
  type AppearanceScope,
  type AppearanceSource,
  type PalettePreference,
  type SystemAppearance,
} from "../src/index.ts";
afterEach(cleanup);
it("follows system appearance only in system mode, responds to external changes, and disposes subscriptions", () => {
  let preference: AppearancePreference = "system";
  let system: SystemAppearance = "light";
  let palette: PalettePreference = "linen";
  let changed = () => {};
  const unsubscribe = vi.fn();
  const write = vi.fn((value: AppearancePreference) => {
    preference = value;
  });
  const source: AppearanceSource = {
    read: () => preference,
    system: () => system,
    write,
    readPalette: () => palette,
    writePalette: vi.fn((value) => {
      palette = value;
    }),
    subscribe: (fn) => {
      changed = fn;
      return unsubscribe;
    },
  };
  let scope!: AppearanceScope;
  function Consumer() {
    scope = useAppearance();
    return null;
  }
  const view = render(() => (
    <AppearanceProvider source={source}>
      <Consumer />
    </AppearanceProvider>
  ));
  expect(scope.resolved()).toBe("light");
  expect(scope.palette()).toBe("linen");
  scope.setPalette("sage");
  expect(source.writePalette).toHaveBeenLastCalledWith("sage");
  system = "dark";
  changed();
  expect(scope.resolved()).toBe("dark");
  expect(scope.palette()).toBe("sage");
  scope.setPreference("light");
  expect(write).toHaveBeenLastCalledWith("light");
  changed();
  expect(scope.resolved()).toBe("light");
  preference = "system";
  palette = "slate";
  changed();
  expect(scope.resolved()).toBe("dark");
  expect(scope.palette()).toBe("slate");
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
  scope.setPreference("dark");
  scope.setPalette("neutral");
  expect(write).toHaveBeenCalledTimes(1);
  expect(source.writePalette).toHaveBeenCalledTimes(1);
});
