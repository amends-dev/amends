import { style } from "@vanilla-extract/css";
import { space } from "@amends/ui/foundations/spacing";
import { typography } from "@amends/ui/foundations/typography";

export const root = style({ minHeight: "100dvh", fontFamily: typography.body.fontFamily });
export const page = style({ paddingBlock: space[6] });
