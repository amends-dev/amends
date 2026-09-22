/** Reading, control, action, and focus colors. Disabled text is only for inactive controls. */
export interface ColorTokens {
  readonly surface: {
    readonly canvas: string;
    readonly panel: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    /** Error messages on canvas and panel. */
    readonly invalid: string;
    readonly disabled: string;
  };
  readonly line: {
    readonly control: string;
    readonly strong: string;
    /** Invalid-control border on canvas and panel; not an error-text color. */
    readonly invalid: string;
  };
  readonly action: {
    readonly fill: string;
    readonly fillHover: string;
    readonly fillPressed: string;
    readonly onFill: string;
    /** Translucent backgrounds for text.primary, over canvas or panel. */
    readonly hover: string;
    readonly pressed: string;
    /** Translucent fill, supported on canvas and panel surfaces. */
    readonly disabled: string;
  };
  readonly focus: { readonly ring: string };
}

export const cotton = {
  surface: {
    canvas: "oklch(0.955 0.012 88)",
    panel: "oklch(0.978 0.008 92)",
  },
  text: {
    primary: "oklch(0.24 0.014 84)",
    secondary: "oklch(0.41 0.014 84)",
    invalid: "oklch(0.42 0.14 28)",
    disabled: "oklch(0.62 0.014 84)",
  },
  line: {
    control: "oklch(0.6 0.016 84)",
    strong: "oklch(0.42 0.016 84)",
    invalid: "oklch(0.51 0.17 28)",
  },
  action: {
    fill: "oklch(0.24 0.014 84)",
    fillHover: "oklch(0.32 0.014 84)",
    fillPressed: "oklch(0.17 0.008 84)",
    onFill: "oklch(0.97 0.01 90)",
    hover: "oklch(0.24 0.014 84 / 0.05)",
    pressed: "oklch(0.24 0.014 84 / 0.12)",
    disabled: "oklch(0.24 0.014 84 / 0.08)",
  },
  focus: { ring: "oklch(0.24 0.014 84)" },
} as const satisfies ColorTokens;

export const soot = {
  surface: {
    canvas: "oklch(0.185 0.008 84)",
    panel: "oklch(0.215 0.009 84)",
  },
  text: {
    primary: "oklch(0.95 0.006 90)",
    secondary: "oklch(0.74 0.008 86)",
    invalid: "oklch(0.78 0.12 30)",
    disabled: "oklch(0.5 0.012 84)",
  },
  line: {
    control: "oklch(0.57 0.012 84)",
    strong: "oklch(0.74 0.008 86)",
    invalid: "oklch(0.72 0.15 30)",
  },
  action: {
    fill: "oklch(0.95 0.006 90)",
    fillHover: "oklch(0.87 0.008 86)",
    fillPressed: "oklch(0.8 0.008 86)",
    onFill: "oklch(0.17 0.008 84)",
    hover: "oklch(0.95 0.006 90 / 0.06)",
    pressed: "oklch(0.95 0.006 90 / 0.14)",
    disabled: "oklch(0.95 0.006 90 / 0.08)",
  },
  focus: { ring: "oklch(0.95 0.006 90)" },
} as const satisfies ColorTokens;

export const colors = { cotton, soot } as const;
export type ColorTheme = keyof typeof colors;
