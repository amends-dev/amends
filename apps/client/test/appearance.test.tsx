import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import {
  AppearanceProvider,
  useAppearance,
  type AppearancePreference,
  type AppearanceScope,
  type AppearanceSource,
  type SystemAppearance,
} from "../src/index.ts";
afterEach(cleanup);
it("follows system appearance only in system mode, responds to external changes, and disposes subscriptions", () => {
  let preference: AppearancePreference = "system";
  let system: SystemAppearance = "light";
  let changed = () => {};
  const unsubscribe = vi.fn();
  const write = vi.fn((value: AppearancePreference) => {
    preference = value;
  });
  const source: AppearanceSource = {
    read: () => preference,
    system: () => system,
    write,
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
  system = "dark";
  changed();
  expect(scope.resolved()).toBe("dark");
  scope.setPreference("light");
  expect(write).toHaveBeenLastCalledWith("light");
  changed();
  expect(scope.resolved()).toBe("light");
  preference = "system";
  changed();
  expect(scope.resolved()).toBe("dark");
  view.unmount();
  expect(unsubscribe).toHaveBeenCalledOnce();
  scope.setPreference("dark");
  expect(write).toHaveBeenCalledTimes(1);
});
