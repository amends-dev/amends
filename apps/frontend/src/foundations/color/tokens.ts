/** Foreground and background roles; both text roles support both surfaces. */
export interface ColorTokens {
  readonly surface: {
    readonly canvas: string;
    readonly panel: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
  };
}

export const cotton = {
  surface: {
    canvas: "oklch(0.955 0.012 88)",
    panel: "oklch(0.978 0.008 92)",
  },
  text: {
    primary: "oklch(0.24 0.014 84)",
    secondary: "oklch(0.41 0.014 84)",
  },
} as const satisfies ColorTokens;

export const soot = {
  surface: {
    canvas: "oklch(0.185 0.008 84)",
    panel: "oklch(0.215 0.009 84)",
  },
  text: {
    primary: "oklch(0.95 0.006 90)",
    secondary: "oklch(0.74 0.008 86)",
  },
} as const satisfies ColorTokens;

export const colors = { cotton, soot } as const;
export type ColorTheme = keyof typeof colors;
