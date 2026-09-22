import { styleVariants } from "@vanilla-extract/css";
import { typography } from "./tokens.ts";

/** Visual styles only: the consumer owns HTML semantics, color, spacing, and wrapping. */
export const typographyStyles = styleVariants(typography);
