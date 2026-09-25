import { Shell } from "@amends/ui/compositions/shell";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import type { ParentProps } from "solid-js";

export function PlaceholderPage(
  props: ParentProps<{ readonly title: string; readonly message: string }>,
) {
  return (
    <Shell.Body scroll="page">
      <Shell.Main>
        <Shell.Content width="narrow">
          <Column gap={5}>
            <Text variant="mono" tone="secondary">
              Amends
            </Text>
            <Text as="h1" variant="heading">
              {props.title}
            </Text>
            <Text>{props.message}</Text>
            {props.children}
          </Column>
        </Shell.Content>
      </Shell.Main>
    </Shell.Body>
  );
}
