import { style, styleVariants } from "@vanilla-extract/css";
import { avatarTones } from "../../foundations/color/tokens.ts";
import { fontWeight } from "../../foundations/typography/tokens.ts";
import { vars } from "../../foundations/theme/vars.css.ts";

export const sizes = [22, 24, 28, 30, 32, 40, 48] as const;
export type AvatarSize = (typeof sizes)[number];

const rem = (px: number) => `${px / 16}rem`;

export const avatar = style({
  display: "inline-grid",
  placeItems: "center",
  flex: "none",
  overflow: "hidden",
  fontWeight: fontWeight.semibold,
  lineHeight: 1,
  userSelect: "none",
});

// Person initials scale with the tile, at 36% of its width as in the mocks.
export const size = styleVariants(
  Object.fromEntries(sizes.map((px) => [px, px])) as Record<AvatarSize, number>,
  (px) => ({ width: rem(px), height: rem(px), fontSize: rem(px * 0.36) }),
);

// Workspace marks use larger initials: 13px on a 28px tile and 16px on 40px.
export const workspaceSize = styleVariants(
  Object.fromEntries(sizes.map((px) => [px, px])) as Record<AvatarSize, number>,
  (px) => ({ fontSize: rem(px === 40 ? 16 : px * 0.46) }),
);

export const tone = styleVariants(
  Object.fromEntries(avatarTones.map((name) => [name, name])) as Record<
    (typeof avatarTones)[number],
    (typeof avatarTones)[number]
  >,
  (name) => ({
    backgroundColor: vars.color.avatar[name].background,
    color: vars.color.avatar[name].foreground,
  }),
);

export const stack = style({ display: "inline-flex", alignItems: "center" });

// Stacked avatars overlap by 5px.
export const stacked = style({ selectors: { "& + &": { marginInlineStart: "-0.3125rem" } } });
