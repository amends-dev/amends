import { afterEach, expect, it, vi } from "@effect/vitest";
import { createAppearanceSource } from "../src/appearance.ts";
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
it("persists preference, follows media changes, and synchronizes external storage updates", () => {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  Object.defineProperty(media, "matches", { value: false, configurable: true });
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  const source = createAppearanceSource();
  expect(source.read()).toBe("system");
  expect(source.system()).toBe("light");
  source.write("dark");
  expect(localStorage.getItem("amends.appearance")).toBe("dark");
  expect(createAppearanceSource().read()).toBe("dark");
  const changed = vi.fn(),
    stop = source.subscribe(changed);
  Object.defineProperty(media, "matches", { value: true });
  media.dispatchEvent(new Event("change"));
  expect(source.system()).toBe("dark");
  expect(changed).toHaveBeenCalledTimes(1);
  localStorage.setItem("amends.appearance", "light");
  window.dispatchEvent(
    new StorageEvent("storage", { key: "amends.appearance", storageArea: localStorage }),
  );
  expect(changed).toHaveBeenCalledTimes(2);
  expect(source.read()).toBe("light");
  localStorage.setItem("amends.appearance", "invalid");
  expect(source.read()).toBe("system");
  stop();
  media.dispatchEvent(new Event("change"));
  expect(changed).toHaveBeenCalledTimes(2);
});
it("keeps appearance usable in memory when storage is blocked", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const source = createAppearanceSource();
  expect(source.read()).toBe("system");
  source.write("dark");
  expect(source.read()).toBe("dark");
});
