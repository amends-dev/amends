import { style } from "@vanilla-extract/css";
import { space } from "@amends/frontend/foundations/spacing";
import { typography } from "@amends/frontend/foundations/typography";

export const root = style({ minHeight: "100dvh", fontFamily: typography.body.fontFamily });
export const page = style({ paddingBlock: space[6] });
