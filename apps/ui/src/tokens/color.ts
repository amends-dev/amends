/** Semantic colour roles. Text, indicators, and decorative lines have separate contrast needs. */
export type ColorTokens = {
  readonly surface: {
    readonly canvas: string;
    readonly panel: string;
    readonly recessed: string;
    readonly muted: string;
    readonly scrim: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly muted: string;
    readonly disabled: string;
  };
  readonly line: {
    readonly subtle: string;
    readonly seam: string;
    readonly control: string;
    readonly strong: string;
  };
  readonly action: {
    readonly fill: string;
    readonly fillHover: string;
    readonly fillPressed: string;
    readonly onFill: string;
    readonly hover: string;
    readonly pressed: string;
    readonly selected: string;
    readonly disabled: string;
  };
  readonly focus: { readonly ring: string };
  readonly brand: {
    readonly fill: string;
    readonly onFill: string;
    readonly text: string;
    readonly textHover: string;
    readonly soft: string;
  };
  readonly status: {
    readonly neutral: string;
    readonly running: string;
    readonly pending: StatusColors;
    readonly success: StatusColors;
    readonly danger: StatusColors;
  };
  readonly selection: { readonly fill: string; readonly text: string };
};

/** Indicators may be lighter than text; soft backgrounds must be paired with their status text. */
export type StatusColors = {
  readonly indicator: string;
  readonly text: string;
  readonly soft: string;
};

export const cotton: ColorTokens = {
  surface: {
    canvas: "oklch(0.955 0.012 88)",
    panel: "oklch(0.978 0.008 92)",
    recessed: "oklch(0.925 0.014 88)",
    muted: "oklch(0.945 0.014 88)",
    scrim: "oklch(0.24 0.014 84 / 0.45)",
  },
  text: {
    primary: "oklch(0.24 0.014 84)",
    secondary: "oklch(0.41 0.014 84)",
    muted: "oklch(0.5 0.014 84)",
    disabled: "oklch(0.62 0.014 84)",
  },
  line: {
    subtle: "oklch(0.86 0.014 86)",
    seam: "oklch(0.78 0.016 84)",
    control: "oklch(0.6 0.016 84)",
    strong: "oklch(0.42 0.016 84)",
  },
  action: {
    fill: "oklch(0.24 0.014 84)",
    fillHover: "oklch(0.32 0.014 84)",
    fillPressed: "oklch(0.17 0.008 84)",
    onFill: "oklch(0.97 0.01 90)",
    hover: "oklch(0.24 0.014 84 / 0.05)",
    pressed: "oklch(0.24 0.014 84 / 0.12)",
    selected: "oklch(0.24 0.014 84 / 0.09)",
    disabled: "oklch(0.24 0.014 84 / 0.08)",
  },
  focus: { ring: "oklch(0.24 0.014 84)" },
  brand: {
    fill: "oklch(0.56 0.13 42)",
    onFill: "oklch(0.99 0.01 90)",
    text: "oklch(0.47 0.12 40)",
    textHover: "oklch(0.42 0.11 40)",
    soft: "oklch(0.56 0.13 42 / 0.13)",
  },
  status: {
    neutral: "oklch(0.6 0.014 84)",
    running: "oklch(0.41 0.014 84)",
    pending: {
      indicator: "oklch(0.58 0.12 78)",
      text: "oklch(0.42 0.1 78)",
      soft: "oklch(0.58 0.12 78 / 0.13)",
    },
    success: {
      indicator: "oklch(0.52 0.14 148)",
      text: "oklch(0.36 0.1 148)",
      soft: "oklch(0.52 0.14 148 / 0.1)",
    },
    danger: {
      indicator: "oklch(0.51 0.17 28)",
      text: "oklch(0.42 0.14 28)",
      soft: "oklch(0.51 0.17 28 / 0.1)",
    },
  },
  selection: { fill: "oklch(0.84 0.055 60)", text: "oklch(0.24 0.014 84)" },
};

export const soot: ColorTokens = {
  surface: {
    canvas: "oklch(0.185 0.008 84)",
    panel: "oklch(0.215 0.009 84)",
    recessed: "oklch(0.155 0.007 84)",
    muted: "oklch(0.25 0.01 84)",
    scrim: "oklch(0.1 0.006 84 / 0.6)",
  },
  text: {
    primary: "oklch(0.95 0.006 90)",
    secondary: "oklch(0.74 0.008 86)",
    muted: "oklch(0.65 0.01 85)",
    disabled: "oklch(0.5 0.012 84)",
  },
  line: {
    subtle: "oklch(0.32 0.01 84)",
    seam: "oklch(0.44 0.012 84)",
    control: "oklch(0.57 0.012 84)",
    strong: "oklch(0.74 0.008 86)",
  },
  action: {
    fill: "oklch(0.95 0.006 90)",
    fillHover: "oklch(0.87 0.008 86)",
    fillPressed: "oklch(0.8 0.008 86)",
    onFill: "oklch(0.17 0.008 84)",
    hover: "oklch(0.95 0.006 90 / 0.06)",
    pressed: "oklch(0.95 0.006 90 / 0.14)",
    selected: "oklch(0.95 0.006 90 / 0.1)",
    disabled: "oklch(0.95 0.006 90 / 0.08)",
  },
  focus: { ring: "oklch(0.95 0.006 90)" },
  brand: {
    fill: "oklch(0.7 0.14 44)",
    onFill: "oklch(0.17 0.008 84)",
    text: "oklch(0.75 0.12 44)",
    textHover: "oklch(0.83 0.09 44)",
    soft: "oklch(0.7 0.14 44 / 0.16)",
  },
  status: {
    neutral: "oklch(0.62 0.012 84)",
    running: "oklch(0.74 0.008 86)",
    pending: {
      indicator: "oklch(0.82 0.12 82)",
      text: "oklch(0.82 0.12 82)",
      soft: "oklch(0.82 0.12 82 / 0.12)",
    },
    success: {
      indicator: "oklch(0.78 0.14 150)",
      text: "oklch(0.78 0.14 150)",
      soft: "oklch(0.78 0.14 150 / 0.12)",
    },
    danger: {
      indicator: "oklch(0.72 0.15 30)",
      text: "oklch(0.78 0.12 30)",
      soft: "oklch(0.72 0.15 30 / 0.12)",
    },
  },
  selection: { fill: "oklch(0.42 0.07 44)", text: "oklch(0.97 0.01 90)" },
};

/** The navigation surface stays dark in either theme; every foreground role changes with it. */
export const inverse: ColorTokens = {
  ...soot,
  surface: { ...soot.surface, canvas: "oklch(0.16 0.007 84)", panel: "oklch(0.2 0.008 84)" },
};

export const colors = { cotton, soot, inverse } as const;
export type ThemeName = "cotton" | "soot";
