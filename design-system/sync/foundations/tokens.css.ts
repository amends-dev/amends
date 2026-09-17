import { createThemeContract } from "@vanilla-extract/css";

export const color = createThemeContract({
  // surface.rail and ink.onFill are new in v2: the rail is a constant near-black
  // in both themes, and the primary button is ink, so it needs paper type.
  surface: { base: null, sunken: null, panel: null, muted: null, rail: null, scrim: null },
  ink: { primary: null, secondary: null, tertiary: null, onFill: null },
  // border.strong is the third line weight: illustration cloth, and the edge of a
  // secondary action.
  border: { default: null, seam: null, strong: null },
  brand: {
    fill: null,
    fillMuted: null,
    deep: null,
    light: null,
    accent: null,
    onFill: null,
    thread: null,
    focus: null,
  },
  status: {
    activeSolid: null,
    activeSoft: null,
    pendingSolid: null,
    pendingSoft: null,
    successSolid: null,
    successSoft: null,
    dangerSolid: null,
    dangerSoft: null,
    thinkingSolid: null,
    neutralSolid: null,
  },
});

export const elevation = createThemeContract({
  flat: null,
  ring: null,
  // raised and lifted now resolve to none. Kept so existing consumers compile;
  // remove once none reference them.
  raised: null,
  overlay: null,
  lifted: null,
  modal: null,
});
