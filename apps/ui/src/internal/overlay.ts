/**
 * Where a floating layer attaches: inside an open modal dialog, so it shares the top layer, or
 * else inside the nearest Theme, so it inherits the mode's variables and fonts.
 */
export function overlayMount(anchor: Element | undefined): HTMLElement | undefined {
  return anchor?.closest<HTMLElement>("dialog[open]") ?? anchor?.closest<HTMLElement>("[data-mode]") ?? undefined
}
