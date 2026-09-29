import { For } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { avatarTones, dark, light } from "./tokens.ts";
import { vars } from "../theme/vars.css.ts";
import * as s from "../foundations.stories.css.ts";

type Group = "surface" | "text" | "border" | "action";
const groups: ReadonlyArray<{ group: Group; title: string; note: string }> = [
  {
    group: "surface",
    title: "Surfaces",
    note: "Canvas frames the app; panels, modals, and popovers sit on it in that order.",
  },
  {
    group: "text",
    title: "Text",
    note: "Primary for reading, secondary for navigation and support, muted for metadata.",
  },
  {
    group: "border",
    title: "Borders",
    note: "Dividers split regions; default outlines controls; the stitch is decoration.",
  },
  {
    group: "action",
    title: "Actions",
    note: "The primary action and the current-item indicator are the darkest shade.",
  },
];

function Swatch(props: { group: Group; role: string }) {
  const color = () =>
    (vars.color[props.group] as Record<string, string>)[props.role] ?? "transparent";
  const values = () =>
    [light, dark].map((mode) => (mode[props.group] as Record<string, string>)[props.role]);
  return (
    <li class={s.swatch}>
      {props.group === "text" ? (
        <span
          class={s.chip}
          style={{
            color: color(),
            // Text on the primary action is only meaningful on that fill.
            "background-color": props.role === "onPrimary" ? vars.color.action.primary : undefined,
          }}
          aria-hidden="true"
        >
          Aa
        </span>
      ) : (
        <span class={s.chip} style={{ "background-color": color() }} aria-hidden="true" />
      )}
      <span>
        <span class={s.name}>
          {props.group}.{props.role}
        </span>
        <span class={s.value}>{values().join(" / ")}</span>
      </span>
    </li>
  );
}

const statusTones = ["success", "caution", "danger"] as const;
const statusRoles = ["mark", "text", "surface", "border"] as const;

const meta = { title: "Foundations/Color" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Roles = {
  render: () => (
    <div class={s.page}>
      <For each={groups}>
        {(entry) => (
          <section class={s.section}>
            <h2 class={s.heading}>{entry.title}</h2>
            <p class={s.note}>{entry.note}</p>
            <ul class={s.grid}>
              <For each={Object.keys(light[entry.group])}>
                {(role) => <Swatch group={entry.group} role={role} />}
              </For>
            </ul>
          </section>
        )}
      </For>
      <section class={s.section}>
        <h2 class={s.heading}>Status</h2>
        <p class={s.note}>
          Marks are the only saturated color. Text, surfaces, and borders make a notice in the tone.
          Offline has no tone: its mark is a ring in text.muted.
        </p>
        <ul class={s.grid}>
          <For each={statusTones}>
            {(tone) => (
              <For each={statusRoles}>
                {(role) => (
                  <li class={s.swatch}>
                    <span
                      class={s.chip}
                      style={
                        role === "text"
                          ? { color: vars.color.status[tone].text }
                          : { "background-color": vars.color.status[tone][role] }
                      }
                      aria-hidden="true"
                    >
                      {role === "text" ? "Aa" : ""}
                    </span>
                    <span>
                      <span class={s.name}>
                        status.{tone}.{role}
                      </span>
                      <span class={s.value}>
                        {light.status[tone][role]} / {dark.status[tone][role]}
                      </span>
                    </span>
                  </li>
                )}
              </For>
            )}
          </For>
        </ul>
      </section>
      <section class={s.section}>
        <h2 class={s.heading}>Avatar tones</h2>
        <p class={s.note}>
          Square initials; a person keeps one tone. Ink marks the current reader.
        </p>
        <ul class={s.grid}>
          <For each={avatarTones}>
            {(tone) => (
              <li class={s.swatch}>
                <span
                  class={s.chip}
                  style={{
                    "background-color": vars.color.avatar[tone].background,
                    color: vars.color.avatar[tone].foreground,
                    border: "none",
                  }}
                  aria-hidden="true"
                >
                  AM
                </span>
                <span>
                  <span class={s.name}>avatar.{tone}</span>
                  <span class={s.value}>
                    {light.avatar[tone].background} / {dark.avatar[tone].background}
                  </span>
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  ),
} satisfies Story;
