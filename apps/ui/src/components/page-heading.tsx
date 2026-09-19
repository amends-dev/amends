import { children, Show, type JSX } from "solid-js";
import { Text } from "./text.tsx";
import * as s from "./page-header.css.ts";
export function PageHeading(props: {
  title: string;
  description?: JSX.Element;
  headingLevel?: "h1" | "h2";
}) {
  const descriptionSlot = children(() => props.description);
  return (
    <div class={s.heading}>
      <Text as={props.headingLevel ?? "h1"} variant="pageTitle">
        {props.title}
      </Text>
      <Show when={descriptionSlot()}>
        <Text tone="secondary">{descriptionSlot()}</Text>
      </Show>
    </div>
  );
}
