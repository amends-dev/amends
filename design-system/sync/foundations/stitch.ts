/**
 * The running stitch. One dashed hairline is the whole divider vocabulary, so
 * these six numbers cover section rules, row splits, secondary-action edges and
 * anything that means "in progress".
 *
 * The dash moves from 6/5 to 7/6: at 6/5 the dashes read as a dotted border
 * rather than a stitch.
 */
export const stitch = {
  hairline: 1,
  fine: 1.4,
  base: 1.7,
  heavy: 2.4,
  dash: 7,
  gap: 6,
};

/** `stroke-dasharray` / `repeating-linear-gradient` pair, so the two never drift. */
export const dashPattern = `${stitch.dash} ${stitch.gap}`;
export const dashStops = `0 ${stitch.dash}px, transparent ${stitch.dash}px ${stitch.dash + stitch.gap}px`;
