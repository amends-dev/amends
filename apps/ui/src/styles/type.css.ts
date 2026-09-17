import { styleVariants } from "@vanilla-extract/css";
import { breakpoint, typography, type TypeStyle } from "../tokens/index.ts";

/** Typography roles do not select an HTML heading level or force capitalization. */
export const type = styleVariants(typography, ({ compactSize, ...role }: TypeStyle) => ({
  ...role,
  fontSize: `${role.fontSize / 16}rem`,
  letterSpacing: `${role.letterSpacing}em`,
  ...(compactSize === undefined
    ? {}
    : {
        "@media": {
          [`(max-width: ${breakpoint.navigation - 1}px)`]: { fontSize: `${compactSize / 16}rem` },
        },
      }),
}));
