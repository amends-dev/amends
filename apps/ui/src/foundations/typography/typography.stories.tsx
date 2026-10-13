import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { fontWeight, typeScale, type FontWeight, type TypeRole } from "./tokens.ts";
import { typeStyles, weightStyles } from "./styles.css.ts";
import * as s from "../foundations.stories.css.ts";

const px = (rem: string) => `${Number.parseFloat(rem) * 16}px`;
const uses: Record<TypeRole, { sample: string; weight: FontWeight }> = {
  meta: { sample: "10:02 AM · DIRECT MESSAGES", weight: "regular" },
  hint: { sample: "Everyone in this group sees this name.", weight: "regular" },
  control: { sample: "Save changes", weight: "medium" },
  item: { sample: "general", weight: "regular" },
  body: {
    sample: "found a bug. composer crashes when I paste an image from clipboard lol",
    weight: "regular",
  },
  bodyTouch: { sample: "found a bug. composer crashes when I paste an image", weight: "regular" },
  titleTouch: { sample: "general", weight: "medium" },
  title: { sample: "general", weight: "medium" },
  heading: { sample: "Group settings", weight: "medium" },
  display: { sample: "Choose a workspace", weight: "medium" },
};

const meta = { title: "Foundations/Typography" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Scale = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Type scale</h2>
        <p class={s.note}>
          Figtree at 400, 500, and 600. Each role has one size and line height; the weight shown is
          its usual one.
        </p>
        <div class={s.panel}>
          <For each={Object.keys(typeScale) as Array<TypeRole>}>
            {(role) => (
              <div class={s.specimenRow}>
                <span>
                  <span class={s.name}>{role}</span>
                  <span class={s.value}>
                    {px(typeScale[role].fontSize)} / {px(typeScale[role].lineHeight)}
                  </span>
                </span>
                <p
                  class={`${s.specimenText} ${typeStyles[role]} ${weightStyles[uses[role].weight]}`}
                >
                  {uses[role].sample}
                </p>
              </div>
            )}
          </For>
        </div>
      </section>
      <section class={s.section}>
        <h2 class={s.heading}>Weights</h2>
        <div class={s.panel}>
          <For each={Object.keys(fontWeight) as Array<FontWeight>}>
            {(weight) => (
              <div class={s.specimenRow}>
                <span>
                  <span class={s.name}>{weight}</span>
                  <span class={s.value}>{fontWeight[weight]}</span>
                </span>
                <p class={`${s.specimenText} ${typeStyles.body} ${weightStyles[weight]}`}>
                  A shared place for your work.
                </p>
              </div>
            )}
          </For>
        </div>
      </section>
    </div>
  ),
} satisfies Story;
