import { createEffect } from "solid-js";
/** Page-owned browser metadata; independent of the visual shell. */
export function DocumentTitle(props: { title: string }) {
  createEffect(() => {
    document.title = props.title + " · amends";
  });
  return null;
}
