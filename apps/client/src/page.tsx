import { A } from "@solidjs/router";
import { Button } from "@amends/ui/primitives/button";
import { Column, Container, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { paths } from "./routing/paths.ts";
import { useSession } from "./session/provider.tsx";
import type { ParentProps } from "solid-js";
import * as styles from "./app.css.ts";

/** Temporary route outlet while product pages are introduced individually. */
export function FoundationPage(props: ParentProps<{ title: string; message: string }>) {
  return (
    <Container as="main" maxWidth="40rem" class={styles.page}>
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
export function SessionActions() {
  const session = useSession();
  return (
    <Row gap={4}>
      <A href={paths.workspaces}>Workspaces</A>
      <Button variant="secondary" onClick={() => session.replace(undefined)}>
        Sign out
      </Button>
    </Row>
  );
}
