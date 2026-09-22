import { onCleanup, onMount, type ParentProps } from "solid-js";

/** Isolated story only: restore the root size when leaving the specimen. */
export function EnlargedText(props: ParentProps) {
  onMount(() => {
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("font-size"),
      priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%");
    onCleanup(() =>
      previous
        ? style.setProperty("font-size", previous, priority)
        : style.removeProperty("font-size"),
    );
  });
  return <>{props.children}</>;
}
