/** Milliseconds. Running motion is decorative; a static label must still communicate the state. */
export const duration = { instant: 0, quick: 200, settle: 240, slow: 320, stitch: 2600 } as const;
export const easing = { settle: "cubic-bezier(0.16, 1, 0.3, 1)", linear: "linear" } as const;

/** Only floating surfaces cast shadows. Focus is an outline, never an elevation level. */
export const shadow = {
  cotton: {
    tooltip: "0 2px 4px oklch(0.24 0.014 84 / 0.1)",
    overlay: "0 2px 4px oklch(0.24 0.014 84 / 0.06), 0 8px 22px oklch(0.24 0.014 84 / 0.07)",
    modal: "0 8px 20px oklch(0.24 0.014 84 / 0.1), 0 30px 60px oklch(0.24 0.014 84 / 0.14)",
  },
  soot: {
    tooltip: "0 2px 4px oklch(0.24 0.014 84 / 0.1)",
    overlay: "0 2px 4px oklch(0 0 0 / 0.32), 0 8px 22px oklch(0 0 0 / 0.4)",
    modal: "0 8px 20px oklch(0 0 0 / 0.5), 0 30px 60px oklch(0 0 0 / 0.55)",
  },
} as const;
