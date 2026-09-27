import { For, splitProps, type JSX } from "solid-js";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./avatar.css.ts";

export type { AvatarSize } from "./avatar.css.ts";

export type AvatarProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  /** The person or workspace the tile stands for; also its accessible name. */
  name: string;
  /** Overrides the initials derived from the name. */
  initials?: string;
  tone?: AvatarToneName;
  /** Tile width in CSS pixels. Default 32. */
  size?: s.AvatarSize;
  /** A workspace mark uses larger initials and the neutral tone by default. */
  variant?: "person" | "workspace";
  /** Hide from assistive technology when the name is already visible beside it. */
  decorative?: boolean;
};

/** "Alex Morgan" → "AM"; a short all-caps name such as "AJ" stays as written. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const [first = "", second] = words;
  if (words.length === 1) return /^[A-Z]{1,2}$/.test(first) ? first : first.charAt(0).toUpperCase();
  return (first.charAt(0) + (second?.charAt(0) ?? "")).toUpperCase();
}

/** A square tile with a person's or workspace's initials. */
export function Avatar(props: AvatarProps) {
  const [local, native] = splitProps(props, [
    "name",
    "initials",
    "tone",
    "size",
    "variant",
    "decorative",
    "class",
  ]);
  const size = () => local.size ?? 32;
  const workspace = () => local.variant === "workspace";
  return (
    <span
      {...native}
      role={local.decorative ? undefined : "img"}
      aria-label={local.decorative ? undefined : local.name}
      aria-hidden={local.decorative ? true : undefined}
      class={classes(
        s.avatar,
        s.size[size()],
        workspace() && s.workspaceSize[size()],
        s.tone[local.tone ?? (workspace() ? "neutral" : "slate")],
        local.class,
      )}
    >
      {local.initials ?? initialsOf(local.name)}
    </span>
  );
}

export interface AvatarStackPerson {
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
}

export type AvatarStackProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  people: readonly AvatarStackPerson[];
  /** Default 22, the size threads and group headers use. */
  size?: s.AvatarSize;
};

/** Overlapping avatars, such as the people in a thread. Name the group with `aria-label`. */
export function AvatarStack(props: AvatarStackProps) {
  const [local, native] = splitProps(props, ["people", "size", "class"]);
  return (
    <span {...native} role="group" class={classes(s.stack, local.class)}>
      <For each={local.people}>
        {(person) => (
          <Avatar
            name={person.name}
            initials={person.initials}
            tone={person.tone}
            size={local.size ?? 22}
            class={s.stacked}
          />
        )}
      </For>
    </span>
  );
}
