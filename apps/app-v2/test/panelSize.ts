/**
 * The steps that say what size a dialog's panel is, which the design's `modal` gives it by its classes: its width, and
 * the height that only a regular modal has, the others being as tall as their content; and that, below 48rem, it fills
 * the window at any size.
 */

import { expect, selector } from "foldkit/scene"

const widths = {
  regular: "w-[min(40rem,calc(100%-2rem))]",
  compact: "w-[min(35rem,calc(100%-2rem))]",
  form: "w-[min(40rem,calc(100%-2rem))]"
}

const regularHeight = "h-[min(37.5rem,calc(100dvh-4rem))]"

/** The panel of the dialog whose `id` is `dialogId` is of `size`, the size `@amends-dev/ui` gives the same dialog. */
export const panelIs = (dialogId: string, size: keyof typeof widths) => {
  const panel = selector(`#${dialogId}-panel`)

  return [
    expect(panel).toHaveClass(widths[size]),
    expect(panel).toHaveClass("max-tablet:h-dvh"),
    expect(panel).toHaveClass("max-tablet:w-full"),
    size === "regular" ? expect(panel).toHaveClass(regularHeight) : expect(panel).not.toHaveClass(regularHeight)
  ] as const
}
