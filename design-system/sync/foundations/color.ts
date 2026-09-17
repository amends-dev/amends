/**
 * Warm-neutral palette. Every neutral sits on hue 84-92 so paper reads warm; the
 * accent is kakishibu persimmon at hue 42, far enough from the signal hues that it
 * can never be mistaken for a status.
 *
 * Three rules the values encode:
 * - Surfaces separate by lightness, never by an outline.
 * - Actions are ink. `brand` is for marketing, docs and links, not chrome.
 * - Hue inside the shell only ever reports state.
 */
export const cotton = {
  surface: {
    base: "oklch(0.955 0.012 88)",
    sunken: "oklch(0.925 0.014 88)",
    panel: "oklch(0.978 0.008 92)",
    muted: "oklch(0.945 0.014 88)",
    /** Near-black in both themes: the rail is a constant, not a themed surface. */
    rail: "oklch(0.2 0.008 84)",
    scrim: "oklch(0.24 0.014 84 / 0.45)",
  },
  ink: {
    primary: "oklch(0.24 0.014 84)",
    secondary: "oklch(0.41 0.014 84)",
    tertiary: "oklch(0.5 0.014 84)",
    /** Type on an ink fill. The primary button is ink, so it needs paper type. */
    onFill: "oklch(0.97 0.01 90)",
  },
  border: {
    default: "oklch(0.86 0.014 86)",
    seam: "oklch(0.78 0.016 84)",
    /** The heaviest line: illustration cloth, and the edge of a secondary action. */
    strong: "oklch(0.7 0.016 84)",
  },
  brand: {
    fill: "oklch(0.56 0.13 42)",
    fillMuted: "oklch(0.56 0.13 42 / 0.13)",
    deep: "oklch(0.42 0.11 40)",
    /**
     * No longer brand-hued. It reads as the line on a selected chip or control, and
     * persimmon is scoped out of the shell, so it resolves to an ink-tinted line.
     */
    light: "oklch(0.42 0.016 84)",
    accent: "oklch(0.56 0.13 42)",
    onFill: "oklch(0.99 0.01 90)",
    /** Light ink for dark grounds: the rail, tooltips, an avatar ring. */
    thread: "oklch(0.95 0.006 90)",
    /** Ink, not accent, so focus survives every surface including the rail. */
    focus: "oklch(0.24 0.014 84)",
  },
  status: {
    activeSolid: "oklch(0.24 0.014 84)",
    activeSoft: "oklch(0.24 0.014 84 / 0.08)",
    pendingSolid: "oklch(0.58 0.12 78)",
    pendingSoft: "oklch(0.58 0.12 78 / 0.13)",
    successSolid: "oklch(0.52 0.14 148)",
    successSoft: "oklch(0.52 0.14 148 / 0.1)",
    dangerSolid: "oklch(0.51 0.17 28)",
    dangerSoft: "oklch(0.51 0.17 28 / 0.1)",
    /** Running. Ink at secondary weight — motion carries it, not hue. */
    thinkingSolid: "oklch(0.41 0.014 84)",
    /** Idle. */
    neutralSolid: "oklch(0.62 0.014 84)",
  },
};

/**
 * Soot. Same token names, same meanings; the ink fill inverts, so the primary
 * button becomes near-white paper with dark type. Persimmon lifts from L 0.56 to
 * L 0.70 to survive the dark ground.
 */
export const night: typeof cotton = {
  surface: {
    base: "oklch(0.185 0.008 84)",
    sunken: "oklch(0.155 0.007 84)",
    panel: "oklch(0.215 0.009 84)",
    muted: "oklch(0.25 0.01 84)",
    rail: "oklch(0.145 0.007 84)",
    scrim: "oklch(0.1 0.006 84 / 0.6)",
  },
  ink: {
    primary: "oklch(0.95 0.006 90)",
    secondary: "oklch(0.74 0.008 86)",
    tertiary: "oklch(0.62 0.01 85)",
    onFill: "oklch(0.17 0.008 84)",
  },
  border: {
    default: "oklch(0.32 0.01 84)",
    seam: "oklch(0.44 0.012 84)",
    strong: "oklch(0.54 0.012 84)",
  },
  brand: {
    fill: "oklch(0.7 0.14 44)",
    fillMuted: "oklch(0.7 0.14 44 / 0.16)",
    deep: "oklch(0.56 0.13 42)",
    light: "oklch(0.6 0.012 84)",
    accent: "oklch(0.7 0.14 44)",
    onFill: "oklch(0.17 0.008 84)",
    thread: "oklch(0.95 0.006 90)",
    focus: "oklch(0.95 0.006 90)",
  },
  status: {
    activeSolid: "oklch(0.95 0.006 90)",
    activeSoft: "oklch(0.95 0.006 90 / 0.1)",
    pendingSolid: "oklch(0.82 0.12 82)",
    pendingSoft: "oklch(0.82 0.12 82 / 0.12)",
    successSolid: "oklch(0.78 0.14 150)",
    successSoft: "oklch(0.78 0.14 150 / 0.12)",
    dangerSolid: "oklch(0.72 0.15 30)",
    dangerSoft: "oklch(0.72 0.15 30 / 0.12)",
    thinkingSolid: "oklch(0.74 0.008 86)",
    neutralSolid: "oklch(0.56 0.012 84)",
  },
};
