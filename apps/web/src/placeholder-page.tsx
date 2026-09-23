import { space } from "@amends/ui/foundations/spacing";
import { Column, Container } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import type { ParentProps } from "solid-js";

export function PlaceholderPage(
  props: ParentProps<{ readonly title: string; readonly message: string }>,
) {
  return (
    <Container as="main" maxWidth="40rem" style={{ "padding-block": space[6] }}>
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
    </Container>
  );
}
