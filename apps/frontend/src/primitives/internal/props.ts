import type { JSX } from "solid-js";

export function classes(
  base: string,
  name?: string,
  classList?: JSX.HTMLAttributes<HTMLElement>["classList"],
) {
  return [
    base,
    name,
    ...Object.entries(classList ?? {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => key),
  ]
    .filter(Boolean)
    .join(" ");
}
export function callHandler<T extends HTMLElement, E extends Event>(
  handler: JSX.EventHandlerUnion<T, E> | undefined,
  event: E & { currentTarget: T; target: Element },
) {
  if (typeof handler === "function") handler(event);
  else if (handler) handler[0](handler[1], event);
}
