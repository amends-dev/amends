import { For, type JSX } from "solid-js";
import { Container, Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { type ColorTheme } from "@amends/ui/foundations/color";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./layout.stories.css.ts";

export function Frame(props: { theme: ColorTheme; title: string; children: JSX.Element }) {
  return (
    <section class={`${colorThemes[props.theme]} ${s.frame}`}>
      <Container>
        <Column gap={6}>
          <Text as="h2" variant="heading">
            {props.title} · {props.theme === "cotton" ? "Cotton" : "Soot"}
          </Text>
          {props.children}
        </Column>
      </Container>
    </section>
  );
}
export function Themes(props: { title: string; children: (theme: ColorTheme) => JSX.Element }) {
  return (
    <main class={s.page}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => (
          <Frame theme={theme} title={props.title}>
            {props.children(theme)}
          </Frame>
        )}
      </For>
    </main>
  );
}
export function Cell(props: { children: JSX.Element; style?: JSX.CSSProperties }) {
  return (
    <div class={s.cell} style={props.style}>
      <Text>{props.children}</Text>
    </div>
  );
}
