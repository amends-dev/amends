import { style } from "@vanilla-extract/css";
import { space } from "../../foundations/spacing/tokens.ts";
import { typography } from "../../foundations/typography/tokens.ts";

export const root = style({ minHeight: "100dvh", fontFamily: typography.body.fontFamily });
export const page = style({ paddingBlock: space[6] });
