import { Text } from "./text.tsx";
import type { JSX } from "solid-js";
import * as s from "./metadata-list.css.ts";
export function MetadataList(props: { children: JSX.Element }) {
  return (
    <Text as="div" variant="caption" class={s.root}>
      {props.children}
    </Text>
  );
}
export function MetadataItem(props: { children: JSX.Element }) {
  return (
    <Text as="span" variant="inherit" class={s.item}>
      {props.children}
    </Text>
  );
}
