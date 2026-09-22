/** A status swatch is not automatically suitable for text. Pair each role with its documented surface. */
export interface StatusForegroundColors {
  readonly text: string;
  readonly indicator: string;
}
export interface StatusColors extends StatusForegroundColors {
  /** Decorative tint over canvas or panel, paired with this status's text and indicator. */
  readonly soft: string;
}
export interface StatusPalette {
  readonly idle: StatusForegroundColors;
  readonly running: StatusForegroundColors;
  readonly success: StatusColors;
  readonly warning: StatusColors;
  readonly pending: StatusColors;
  readonly danger: StatusColors;
}
export type StatusTone = keyof StatusPalette;

/** Enabled action colors. Disabled appearance and focus are shared across tones. */
export interface ActionToneColors {
  readonly fill: string;
  readonly fillHover: string;
  readonly fillPressed: string;
  readonly onFill: string;
  readonly text: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly hover: string;
  readonly pressed: string;
}

/** Semantic colors. Disabled text is only for inactive controls; seams are decorative. */
export interface ColorTokens {
  /** Neutral identity treatments. Agent avatars use text.secondary and line.control on the parent surface. */
  readonly avatar: Readonly<
    Record<"human" | "contact" | "system", { readonly surface: string; readonly text: string }>
  >;
  /** Toast is always dark, with its own readable text, action, and focus pairings. */
  readonly toast: { readonly surface: string; readonly text: string; readonly action: string };
  readonly surface: {
    readonly canvas: string;
    readonly panel: string;
    /** Compact dark tooltip surface in either theme; pair only with text.onTooltip. */
    readonly tooltip: string;
  };
  readonly text: {
    readonly primary: string;
    readonly secondary: string;
    readonly onTooltip: string;
    /** Error messages on canvas and panel. */
    readonly invalid: string;
    readonly disabled: string;
  };
  readonly line: {
    /** Decorative division only; never a control boundary or state indicator. */
    readonly seam: string;
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
    readonly danger: ActionToneColors;
  };
  readonly focus: { readonly ring: string };
  readonly status: StatusPalette;
}

// Warning (caution) and pending (waiting) share amber, but remain distinct semantic roles.
// Chroma 0.085 keeps Cotton's amber text inside sRGB; the old UI's 0.1 required gamut mapping.
const cottonAmber = {
  text: "oklch(0.42 0.085 78)",
  indicator: "oklch(0.58 0.12 78)",
  soft: "oklch(0.58 0.12 78 / 0.12)",
} as const satisfies StatusColors;
const sootAmber = {
  text: "oklch(0.82 0.12 82)",
  indicator: "oklch(0.82 0.12 82)",
  soft: "oklch(0.82 0.12 82 / 0.12)",
} as const satisfies StatusColors;
const cottonStatus = {
  idle: { text: "oklch(0.41 0.014 84)", indicator: "oklch(0.62 0.014 84)" },
  running: { text: "oklch(0.41 0.014 84)", indicator: "oklch(0.41 0.014 84)" },
  success: {
    text: "oklch(0.36 0.1 148)",
    indicator: "oklch(0.52 0.14 148)",
    soft: "oklch(0.52 0.14 148 / 0.1)",
  },
  warning: cottonAmber,
  pending: cottonAmber,
  danger: {
    text: "oklch(0.42 0.14 28)",
    indicator: "oklch(0.51 0.17 28)",
    soft: "oklch(0.51 0.17 28 / 0.1)",
  },
} as const satisfies StatusPalette;
const sootStatus = {
  idle: { text: "oklch(0.74 0.008 86)", indicator: "oklch(0.56 0.012 84)" },
  running: { text: "oklch(0.74 0.008 86)", indicator: "oklch(0.74 0.008 86)" },
  success: {
    text: "oklch(0.78 0.14 150)",
    indicator: "oklch(0.78 0.14 150)",
    soft: "oklch(0.78 0.14 150 / 0.12)",
  },
  warning: sootAmber,
  pending: sootAmber,
  danger: {
    text: "oklch(0.78 0.12 30)",
    indicator: "oklch(0.72 0.15 30)",
    soft: "oklch(0.72 0.15 30 / 0.12)",
  },
} as const satisfies StatusPalette;

const toastColors = {
  surface: "oklch(0.2 0.008 84)",
  text: "oklch(0.95 0.006 90)",
  action: "oklch(0.82 0.09 60)",
} as const;

export const cotton = {
  avatar: {
    human: { surface: "oklch(0.88 0.018 86)", text: "oklch(0.32 0.014 84)" },
    contact: { surface: "oklch(0.9 0.014 88)", text: "oklch(0.4 0.014 84)" },
    system: { surface: "oklch(0.24 0.014 84)", text: "oklch(0.95 0.006 90)" },
  },
  toast: toastColors,
  surface: {
    canvas: "oklch(0.955 0.012 88)",
    panel: "oklch(0.978 0.008 92)",
    tooltip: "oklch(0.2 0.008 84)",
  },
  text: {
    primary: "oklch(0.24 0.014 84)",
    secondary: "oklch(0.41 0.014 84)",
    onTooltip: "oklch(0.95 0.006 90)",
    invalid: cottonStatus.danger.text,
    disabled: "oklch(0.62 0.014 84)",
  },
  line: {
    seam: "oklch(0.78 0.016 84)",
    control: "oklch(0.6 0.016 84)",
    strong: "oklch(0.42 0.016 84)",
    invalid: cottonStatus.danger.indicator,
  },
  action: {
    fill: "oklch(0.24 0.014 84)",
    fillHover: "oklch(0.32 0.014 84)",
    fillPressed: "oklch(0.17 0.008 84)",
    onFill: "oklch(0.97 0.01 90)",
    hover: "oklch(0.24 0.014 84 / 0.05)",
    pressed: "oklch(0.24 0.014 84 / 0.12)",
    disabled: "oklch(0.24 0.014 84 / 0.08)",
    danger: {
      fill: cottonStatus.danger.text,
      fillHover: "oklch(0.48 0.16 28)",
      fillPressed: "oklch(0.36 0.12 28)",
      onFill: "oklch(0.97 0.01 90)",
      text: cottonStatus.danger.text,
      border: cottonStatus.danger.indicator,
      borderStrong: cottonStatus.danger.text,
      hover: cottonStatus.danger.soft,
      pressed: "oklch(0.51 0.17 28 / 0.18)",
    },
  },
  focus: { ring: "oklch(0.24 0.014 84)" },
  status: cottonStatus,
} as const satisfies ColorTokens;

export const soot = {
  avatar: {
    human: { surface: "oklch(0.31 0.012 86)", text: "oklch(0.95 0.006 90)" },
    contact: { surface: "oklch(0.29 0.012 88)", text: "oklch(0.9 0.008 86)" },
    system: { surface: "oklch(0.95 0.006 90)", text: "oklch(0.2 0.008 84)" },
  },
  toast: toastColors,
  surface: {
    canvas: "oklch(0.185 0.008 84)",
    panel: "oklch(0.215 0.009 84)",
    tooltip: "oklch(0.2 0.008 84)",
  },
  text: {
    primary: "oklch(0.95 0.006 90)",
    secondary: "oklch(0.74 0.008 86)",
    onTooltip: "oklch(0.95 0.006 90)",
    invalid: sootStatus.danger.text,
    disabled: "oklch(0.5 0.012 84)",
  },
  line: {
    seam: "oklch(0.44 0.012 84)",
    control: "oklch(0.57 0.012 84)",
    strong: "oklch(0.74 0.008 86)",
    invalid: sootStatus.danger.indicator,
  },
  action: {
    fill: "oklch(0.95 0.006 90)",
    fillHover: "oklch(0.87 0.008 86)",
    fillPressed: "oklch(0.8 0.008 86)",
    onFill: "oklch(0.17 0.008 84)",
    hover: "oklch(0.95 0.006 90 / 0.06)",
    pressed: "oklch(0.95 0.006 90 / 0.14)",
    disabled: "oklch(0.95 0.006 90 / 0.08)",
    danger: {
      fill: sootStatus.danger.text,
      fillHover: "oklch(0.84 0.08 30)",
      fillPressed: "oklch(0.70 0.14 30)",
      onFill: "oklch(0.17 0.008 84)",
      text: sootStatus.danger.text,
      border: sootStatus.danger.indicator,
      borderStrong: sootStatus.danger.text,
      hover: sootStatus.danger.soft,
      pressed: "oklch(0.72 0.15 30 / 0.2)",
    },
  },
  focus: { ring: "oklch(0.95 0.006 90)" },
  status: sootStatus,
} as const satisfies ColorTokens;

export const colors = { cotton, soot } as const;
export type ColorTheme = keyof typeof colors;
