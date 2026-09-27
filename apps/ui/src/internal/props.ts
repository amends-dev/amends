import type { IconProps } from "@amends/icons";
import type { JSX } from "solid-js";

/** An `@amends/icons` component, passed by reference so the owner controls its size. */
export type IconComponent = (props: IconProps) => JSX.Element;

/** Joins class names, skipping empty ones. */
export function classes(...names: ReadonlyArray<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
