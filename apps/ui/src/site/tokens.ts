/**
 * The amends.dev site's type, beside the app's foundations. Instrument Serif sets the wordmark and
 * the headings that sell; everything else is the app's Figtree and Geist Mono, at the app's sizes
 * or at the larger reading sizes below. Sizes are rem at a 16px root, as in the app.
 */

import type { TypeStep } from "../foundations/typography/tokens.ts"

export const displayFamily = '"Instrument Serif", ui-serif, Georgia, "Times New Roman", serif'

const step = (size: number, line: number): TypeStep => ({
  fontSize: `${size / 16}rem`,
  lineHeight: `${line / 16}rem`
})

export const siteType = {
  /** 84/88: the home page's headline. */
  hero: step(84, 88),
  /** 64/70: a page's headline, such as Packages. */
  page: step(64, 70),
  /** 52/58: a section's title. */
  section: step(52, 58),
  /** 40/48: a heading within a page. */
  heading: step(40, 48),
  /** 30/34: the wordmark beside the mark. */
  wordmark: step(30, 34),
  /** 20/31: the lead under a headline. */
  lead: step(20, 31),
  /** 17/27: a section's introduction. */
  intro: step(17, 27)
} as const satisfies Record<string, TypeStep>

/** Headlines shrink on phones, where the larger sizes would break every word onto its own line. */
export const siteTypeMobile = {
  hero: step(48, 52),
  page: step(44, 50),
  section: step(36, 42),
  heading: step(30, 36),
  lead: step(18, 28)
} as const satisfies Partial<Record<keyof typeof siteType, TypeStep>>

/** The width the site's content lines up to, and the gutter around it. */
export const siteLayout = { width: "75rem", gutter: "1rem", gutterWide: "2rem" } as const
