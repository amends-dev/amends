/**
 * A 4px grid with the half steps (2, 6, 10) that compact rows in the mocks use. Keys count
 * 4px units, so `space[6]` is 24px. Values are rem so spacing grows with text size.
 */
const rem = (px: number) => `${px / 16}rem`;

export const space = {
  0: "0",
  0.5: rem(2),
  1: rem(4),
  1.5: rem(6),
  2: rem(8),
  2.5: rem(10),
  3: rem(12),
  4: rem(16),
  5: rem(20),
  6: rem(24),
  8: rem(32),
  10: rem(40),
  12: rem(48),
  16: rem(64),
} as const;
export type Space = keyof typeof space;
