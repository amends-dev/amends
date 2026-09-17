/** Dimensions are CSS-pixel numbers. Web styles translate spacing and type to rem. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  24: 96,
} as const;
export const radius = { none: 0, small: 6, medium: 10, large: 16, dialog: 22, pill: 9999 } as const;

/** Layout thresholds describe available space, not device type or input capability. */
export const breakpoint = { navigation: 768, sidebar: 1024 } as const;
export const layout = {
  rail: 60,
  sidebar: 256,
  detail: 400,
  contentMin: 560,
  companionMin: 720,
  reading: 680,
  wide: 1120,
} as const;
export const control = { compact: 32, regular: 40, touch: 44 } as const;
export const layer = { base: 0, sticky: 10, overlay: 20, modal: 30, toast: 40 } as const;

/** The dash and gap describe one full repeat; motion travels an integer number of repeats. */
export const stroke = { hairline: 1, fine: 1.4, base: 1.7, heavy: 2.4, dash: 7, gap: 6 } as const;
export const focus = { width: 2, offset: 2 } as const;
