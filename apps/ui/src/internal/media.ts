import { createSignal, onCleanup, onMount, type Accessor } from "solid-js";

/** Whether a media query matches, updated as the viewport changes. False before mount. */
export function createMediaQuery(query: string): Accessor<boolean> {
  const [value, setValue] = createSignal(false);
  onMount(() => {
    const list = window.matchMedia(query);
    const update = () => setValue(list.matches);
    update();
    list.addEventListener("change", update);
    onCleanup(() => list.removeEventListener("change", update));
  });
  return value;
}
