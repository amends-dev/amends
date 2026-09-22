export const fontFamilies = {
  sans: '"IBM Plex Sans", system-ui, sans-serif',
  serif: '"Instrument Serif", Georgia, serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

/** Complete visual styles. Sizes scale with the root; line height is unitless. */
export interface TypographyStyle {
  readonly fontFamily: string;
  readonly fontSize: `${number}rem`;
  readonly fontWeight: number;
  readonly fontStyle: "normal";
  readonly lineHeight: number;
  readonly letterSpacing: `${number}em`;
}

export const typography = {
  body: {
    fontFamily: fontFamilies.sans,
    fontSize: "0.9375rem",
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 1.6,
    letterSpacing: "0em",
  },
  heading: {
    fontFamily: fontFamilies.serif,
    fontSize: "1.875rem",
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 1.1,
    letterSpacing: "-0.015em",
  },
  mono: {
    fontFamily: fontFamilies.mono,
    fontSize: "0.8125rem",
    fontWeight: 400,
    fontStyle: "normal",
    lineHeight: 1.5,
    letterSpacing: "0em",
  },
} as const satisfies Record<string, TypographyStyle>;

export type TypographyRole = keyof typeof typography;
