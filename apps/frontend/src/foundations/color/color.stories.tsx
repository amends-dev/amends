import { For, type JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import Color from "colorjs.io";
import { colors, type ColorTheme } from "@amends/frontend/foundations/color";
import { colorThemes, colorVars } from "@amends/frontend/foundations/color/styles";
import * as s from "./color.stories.css.ts";

const labels = { cotton: "Cotton", soot: "Soot" } as const;
const roles = [
  { group: "surface", name: "canvas", usage: "The main background." },
  { group: "surface", name: "panel", usage: "A distinct content surface." },
  { group: "text", name: "primary", usage: "Headings and main content." },
  { group: "text", name: "secondary", usage: "Supporting information; still readable body text." },
] as const;

function Pairings(props: { theme: ColorTheme; surface: "canvas" | "panel" }) {
  return (
    <div class={props.surface === "canvas" ? s.canvasSample : s.panelSample}>
      <h3 class={s.sampleTitle}>Text on surface.{props.surface}</h3>
      <For each={["primary", "secondary"] as const}>
        {(tone) => (
          <>
            <p class={`${s.sampleText} ${s[tone]}`} data-color-pair={`${tone}/${props.surface}`}>
              {tone === "primary"
                ? "Primary text carries the message."
                : "Secondary text adds context."}
            </p>
            <p class={s.ratio}>
              text.{tone} ·{" "}
              {new Color(colors[props.theme].text[tone])
                .contrastWCAG21(colors[props.theme].surface[props.surface])
                .toFixed(2)}
              :1 contrast · minimum 4.5:1
            </p>
          </>
        )}
      </For>
    </div>
  );
}

function ColorSpecimen(props: { theme: ColorTheme; children?: JSX.Element }) {
  return (
    <article
      class={`${colorThemes[props.theme]} ${s.specimen}`}
      aria-label={`${labels[props.theme]} colors`}
      data-color-theme={props.theme}
    >
      <h2 class={s.title}>{labels[props.theme]}</h2>
      <p class={s.description}>Reading colors. Primary and secondary text work on both surfaces.</p>
      <dl class={s.tokens}>
        <For each={roles}>
          {(role) => (
            <div class={s.token}>
              <dt>
                <code>
                  {role.group}.{role.name}
                </code>
              </dt>
              <dd class={s.tokenValue}>
                <div
                  class={s.swatch}
                  style={{
                    "background-color":
                      role.group === "surface"
                        ? colorVars.surface[role.name]
                        : colorVars.text[role.name],
                  }}
                  aria-hidden="true"
                />
                <code>
                  {role.group === "surface"
                    ? colors[props.theme].surface[role.name]
                    : colors[props.theme].text[role.name]}
                </code>
                <div>{role.usage}</div>
              </dd>
            </div>
          )}
        </For>
      </dl>
      <Pairings theme={props.theme} surface="canvas" />
      <Pairings theme={props.theme} surface="panel" />
      {props.children}
    </article>
  );
}

const meta = {
  title: "Foundations/Color",
  component: ColorSpecimen,
  render: (props) => (
    <main>
      <ColorSpecimen {...props} />
    </main>
  ),
  args: { theme: "cotton" },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    children: { table: { disable: true } },
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The four reading color roles, using the production tokens and scoped theme classes. Primary and secondary text support both surfaces at a minimum contrast of 4.5:1. Neutral filled-action colors have separate stories under Color / Actions. Specimen layout and system fonts are workshop scaffolding.",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ColorSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison = {
  render: () => (
    <main class={s.comparison}>
      <ColorSpecimen theme="cotton" />
      <ColorSpecimen theme="soot" />
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;

export const Cotton = { args: { theme: "cotton" } } satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;

export const NestedThemes = {
  render: () => (
    <main class={s.comparison}>
      <ColorSpecimen theme="cotton">
        <ColorSpecimen theme="soot" />
      </ColorSpecimen>
      <ColorSpecimen theme="soot">
        <ColorSpecimen theme="cotton" />
      </ColorSpecimen>
    </main>
  ),
  parameters: { controls: { disable: true } },
} satisfies Story;
