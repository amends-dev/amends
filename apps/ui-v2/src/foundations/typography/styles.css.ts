import { styleVariants } from "@vanilla-extract/css";
import { fontWeight, typeScale } from "./tokens.ts";

/** Size and line height only; weight, color, and wrapping belong to the consumer. */
export const typeStyles = styleVariants(typeScale);

export const weightStyles = styleVariants(fontWeight, (value) => ({ fontWeight: value }));
