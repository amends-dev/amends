export const font = {
  serif: '"Instrument Serif", Georgia, serif',
  sans: '"IBM Plex Sans", system-ui, sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, monospace',
} as const;

export interface TypeStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly compactSize?: number;
  readonly fontWeight: number;
  readonly lineHeight: number;
  readonly letterSpacing: number;
  readonly fontStyle: "normal" | "italic";
}

/** Complete roles keep family, size, rhythm, and weight together. Sizes use a 16px rem basis. */
export const typography = {
  display: {
    fontFamily: font.serif,
    fontSize: 56,
    compactSize: 44,
    fontWeight: 400,
    lineHeight: 1.02,
    letterSpacing: -0.025,
    fontStyle: "normal",
  },
  pageTitle: {
    fontFamily: font.serif,
    fontSize: 34,
    compactSize: 28,
    fontWeight: 400,
    lineHeight: 1.1,
    letterSpacing: -0.015,
    fontStyle: "normal",
  },
  pageCodeTitle: {
    fontFamily: font.mono,
    fontSize: 22,
    compactSize: 17,
    fontWeight: 400,
    lineHeight: 1.3,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  panelTitle: {
    fontFamily: font.serif,
    fontSize: 24,
    fontWeight: 400,
    lineHeight: 1.15,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  heading: {
    fontFamily: font.serif,
    fontSize: 30,
    fontWeight: 400,
    lineHeight: 1.1,
    letterSpacing: -0.015,
    fontStyle: "normal",
  },
  subheading: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 1.15,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  quote: {
    fontFamily: font.serif,
    fontSize: 20,
    fontWeight: 400,
    lineHeight: 1.4,
    letterSpacing: 0,
    fontStyle: "italic",
  },
  title: {
    fontFamily: font.sans,
    fontSize: 17,
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  titleSmall: {
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  body: {
    fontFamily: font.sans,
    fontSize: 15,
    fontWeight: 400,
    lineHeight: 1.6,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  bodySmall: {
    fontFamily: font.sans,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.55,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  label: {
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.5,
    letterSpacing: 0.08,
    fontStyle: "normal",
  },
  mono: {
    fontFamily: font.mono,
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    fontStyle: "normal",
  },
  caption: {
    fontFamily: font.mono,
    fontSize: 11,
    fontWeight: 400,
    lineHeight: 1.5,
    letterSpacing: 0,
    fontStyle: "normal",
  },
} as const satisfies Record<string, TypeStyle>;
export type TypeRole = keyof typeof typography;
