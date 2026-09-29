/**
 * The running stitch that divides and joins content: a thin dashed thread with round caps, drawn
 * as SVG strokes because dashed CSS borders cannot set dash length or caps. The mocks draw it at
 * 1.4px with 7px dashes and 6px gaps; it is finer here, to sit quieter beside the text.
 */
export const stitch = { width: "0.3", dashes: "7 4" } as const;
