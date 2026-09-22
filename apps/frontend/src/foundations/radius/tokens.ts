/** Square corners or fully rounded control shapes. The browser constrains oversized radii to fit. */
export const radius = {
  none: "0px",
  pill: "9999px",
} as const;

export type RadiusName = keyof typeof radius;
