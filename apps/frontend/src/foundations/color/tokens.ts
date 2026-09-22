/** Reading, action, and focus colors. Disabled text is only for inactive controls. */
export interface ColorTokens {
  readonly surface: {
    readonly canvas: string;
    readonly panel: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly disabled: string;
  };
  readonly action: {
    readonly fill: string;
    readonly fillHover: string;
    readonly fillPressed: string;
    readonly onFill: string;
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
    disabled: "oklch(0.62 0.014 84)",
  },
  action: {
    fill: "oklch(0.24 0.014 84)",
    fillHover: "oklch(0.32 0.014 84)",
    fillPressed: "oklch(0.17 0.008 84)",
    onFill: "oklch(0.97 0.01 90)",
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
    disabled: "oklch(0.5 0.012 84)",
  },
  action: {
    fill: "oklch(0.95 0.006 90)",
    fillHover: "oklch(0.87 0.008 86)",
    fillPressed: "oklch(0.8 0.008 86)",
    onFill: "oklch(0.17 0.008 84)",
    disabled: "oklch(0.95 0.006 90 / 0.08)",
  },
  focus: { ring: "oklch(0.95 0.006 90)" },
} as const satisfies ColorTokens;

export const colors = { cotton, soot } as const;
export type ColorTheme = keyof typeof colors;
