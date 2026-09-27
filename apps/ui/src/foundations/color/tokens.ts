/**
 * Color roles for the neutral design mocked in `design-system/Amends Group Exploration.free`.
 * Values are the exact light and dark fills and strokes the Lunacy screens use; components
 * consume roles, never raw values. Everything is a shade of gray except the avatar tones, the
 * agent name, and danger, which the screens use for identity and errors.
 */
export interface AvatarTone {
  readonly background: string;
  readonly foreground: string;
}

export const avatarTones = [
  "neutral",
  "sand",
  "lilac",
  "clay",
  "olive",
  "slate",
  "sage",
  "ink",
] as const;
export type AvatarToneName = (typeof avatarTones)[number];

export interface ColorTokens {
  readonly surface: {
    /** The outer frame: title bar, rail, and the gutter around panels. */
    readonly canvas: string;
    /** Sidebar, main content, side panel, and centered screens. */
    readonly panel: string;
    /** Modal dialogs. */
    readonly raised: string;
    /** Menus, dropdowns, and toasts, which sit above a modal. */
    readonly popover: string;
    /** Inputs and the composer. */
    readonly field: string;
    /** The quiet "Find anything" field. */
    readonly search: string;
    /** A row under the pointer. */
    readonly hover: string;
    /** The message whose thread is open. */
    readonly active: string;
    /** The current sidebar row. */
    readonly selected: string;
    /** The current rail destination, on canvas. */
    readonly railSelected: string;
    /** Badges, counts, reactions, a chosen option, and disabled actions. */
    readonly subtle: string;
    /** An inline mention and the workspace mark. */
    readonly mention: string;
  };
  readonly text: {
    readonly primary: string;
    /** Navigation items, supporting copy, and secondary actions. */
    readonly secondary: string;
    /** Timestamps, section labels, placeholders, and toolbar icons. */
    readonly muted: string;
    readonly disabled: string;
    /** An agent's name. */
    readonly agent: string;
    readonly danger: string;
    /** Text and icons on the primary action. */
    readonly onPrimary: string;
  };
  readonly border: {
    /** 1px lines between panel regions. */
    readonly divider: string;
    /** Outlines of buttons, inputs, the composer, and modals. */
    readonly default: string;
    /** An open or focused picker field. */
    readonly strong: string;
    /** The outline of a chosen option. */
    readonly selected: string;
    readonly danger: string;
    /** The dashed running stitch; decorative only. */
    readonly stitch: string;
  };
  readonly action: {
    readonly primary: string;
    readonly secondary: string;
    /** The 2px bar beside the current item and under the current tab. */
    readonly indicator: string;
  };
  /** The dimming layer behind a modal or a floating side panel. */
  readonly scrim: string;
  /** The heavier dimming behind the navigation drawer on phones. */
  readonly scrimStrong: string;
  readonly avatar: Readonly<Record<AvatarToneName, AvatarTone>>;
}

export const light = {
  surface: {
    canvas: "#F7F7F8",
    panel: "#FFFFFF",
    raised: "#FFFFFF",
    popover: "#FFFFFF",
    field: "#FFFFFF",
    search: "#F6F6F7",
    hover: "#F8F8F9",
    active: "#F5F5F6",
    selected: "#F0F0F2",
    railSelected: "#E9E9EC",
    subtle: "#F3F3F5",
    mention: "#ECEEF1",
  },
  text: {
    primary: "#242528",
    secondary: "#73757B",
    muted: "#9C9EA4",
    disabled: "#9C9EA4",
    agent: "#8755DD",
    danger: "#89221C",
    onPrimary: "#FFFFFF",
  },
  border: {
    divider: "#EDEEF0",
    default: "#E5E6E9",
    strong: "#73757B",
    selected: "#9C9EA4",
    danger: "#B32F28",
    stitch: "#BCB7AC",
  },
  action: { primary: "#242528", secondary: "#FFFFFF", indicator: "#242528" },
  scrim: "#24252833",
  scrimStrong: "#24252866",
  avatar: {
    neutral: { background: "#ECEEF1", foreground: "#575D66" },
    sand: { background: "#EAE2D7", foreground: "#8D6E42" },
    lilac: { background: "#EEE7F8", foreground: "#8863B2" },
    clay: { background: "#E8E2DF", foreground: "#8C6D61" },
    olive: { background: "#E6E9E1", foreground: "#61714E" },
    slate: { background: "#E2E8EC", foreground: "#5C7485" },
    sage: { background: "#E0E5DE", foreground: "#56654F" },
    ink: { background: "#28292D", foreground: "#FFFFFF" },
  },
} satisfies ColorTokens;

export const dark = {
  surface: {
    canvas: "#111215",
    panel: "#1B1D21",
    raised: "#24272D",
    popover: "#2B2F36",
    field: "#181A1E",
    search: "#181A1E",
    hover: "#22252B",
    active: "#24272D",
    selected: "#30343B",
    railSelected: "#30353D",
    subtle: "#262A30",
    mention: "#353A44",
  },
  text: {
    primary: "#ECEEF2",
    secondary: "#B3B8C2",
    muted: "#959CA8",
    disabled: "#777E8A",
    agent: "#C2A1FA",
    // The mocks have no dark error state yet; these are proposals.
    danger: "#F0A8A0",
    onPrimary: "#191B20",
  },
  border: {
    divider: "#343942",
    default: "#4B515C",
    strong: "#9CA5B5",
    selected: "#727D8F",
    danger: "#E58A80",
    stitch: "#626B79",
  },
  action: { primary: "#ECEEF2", secondary: "#25292F", indicator: "#ECEEF2" },
  scrim: "#00000080",
  // The mocks show the drawer in light mode only; this dark value is a proposal.
  scrimStrong: "#000000A6",
  avatar: {
    neutral: { background: "#353A44", foreground: "#BEC5D0" },
    sand: { background: "#3B3329", foreground: "#D5B68C" },
    lilac: { background: "#382D49", foreground: "#C7ACEB" },
    clay: { background: "#3C3030", foreground: "#D4ADA0" },
    olive: { background: "#303A2C", foreground: "#B3C59D" },
    slate: { background: "#2C3741", foreground: "#AFC5D8" },
    sage: { background: "#2E392F", foreground: "#AEC0A5" },
    ink: { background: "#383C45", foreground: "#ECEEF2" },
  },
} satisfies ColorTokens;

export const colorModes = { light, dark } as const;
export type ColorMode = keyof typeof colorModes;
