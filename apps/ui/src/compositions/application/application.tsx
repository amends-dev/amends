import { Show, type ParentProps } from "solid-js";
import { colorThemes } from "../../foundations/color/theme.css.ts";
import { Column, Container } from "../../primitives/layout/index.ts";
import { Text } from "../../primitives/text/index.ts";
import * as styles from "./application.css.ts";

export function ApplicationFrame(props: ParentProps<{ theme?: keyof typeof colorThemes }>) {
  return (
    <div class={`${colorThemes[props.theme ?? "cotton"]} ${styles.root}`}>{props.children}</div>
  );
}
export interface ApplicationPageProps {
  readonly title: string;
  readonly message: string;
  readonly brand?: string;
}
/** Presentation only. The caller supplies copy, controls, and any application behavior. */
export function ApplicationPage(props: ParentProps<ApplicationPageProps>) {
  return (
    <Container as="main" maxWidth="40rem" class={styles.page}>
      <Column gap={5}>
        <Show when={props.brand}>
          <Text variant="mono" tone="secondary">
            {props.brand}
          </Text>
        </Show>
        <Text as="h1" variant="heading">
          {props.title}
        </Text>
        <Text>{props.message}</Text>
        {props.children}
      </Column>
    </Container>
  );
}
