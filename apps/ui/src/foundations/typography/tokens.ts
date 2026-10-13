/**
 * Figtree at three weights and eight sizes. The mocks' half-pixel variants (10.5, 11.5, 12.5,
 * 13.5, 14.5) are rounded to the nearest step here, so the same role reads the same everywhere.
 * Sizes are rem at a 16px root so they follow the reader's text-size preference.
 */
export const fontFamily =
  '"Figtree", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

/**
 * Geist Mono, for code and values people copy exactly: code in messages, commands, environment
 * variables, and model IDs.
 */
export const monoFamily = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

export const fontWeight = { regular: 400, medium: 500, semibold: 600 } as const
export type FontWeight = keyof typeof fontWeight

export interface TypeStep {
  readonly fontSize: string
  readonly lineHeight: string
}

const step = (size: number, line: number): TypeStep => ({
  fontSize: `${size / 16}rem`,
  lineHeight: `${line / 16}rem`
})

export const typeScale = {
  /** 11/16: timestamps, counts, and uppercase section labels. */
  meta: step(11, 16),
  /** 12/18: help text, badges, and task references. */
  hint: step(12, 18),
  /** 13/20: buttons, compact rows, and pane subtitles. */
  control: step(13, 20),
  /** 14/21: navigation items, names, tabs, and form labels. */
  item: step(14, 21),
  /** 15/23: messages, field values, and other reading text. */
  body: step(15, 23),
  /** 16/24: messages and fields on phones, where smaller input text would zoom the page. */
  bodyTouch: step(16, 24),
  /** 17/24: pane titles on touch layouts. */
  titleTouch: step(17, 24),
  /** 18/27: the main content title. */
  title: step(18, 27),
  /** 20/28: the modal title. */
  heading: step(20, 28),
  /** 28/36: the centered screen title. */
  display: step(28, 36)
} as const satisfies Record<string, TypeStep>
export type TypeRole = keyof typeof typeScale
