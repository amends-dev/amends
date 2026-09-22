/** Quarter-rem steps: 0–24px at a 16px root. Values scale with the reader's root text size. */
export const space = {
  0: "0rem",
  1: "0.25rem",
  2: "0.5rem",
  3: "0.75rem",
  4: "1rem",
  5: "1.25rem",
  6: "1.5rem",
} as const;

export type SpaceStep = keyof typeof space;
