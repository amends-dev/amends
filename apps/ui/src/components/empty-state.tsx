import { Text } from "./text.tsx";
import { children, Match, Switch, Show, type JSX } from "solid-js";
import { vars } from "../styles/contract.css.ts";
import * as s from "./empty-state.css.ts";
export interface EmptyStateProps {
  layout?: "centered" | "inline";
  detail?: JSX.Element;
  title: string;
  description: JSX.Element;
  illustration?: JSX.Element;
  action?: JSX.Element;
}
export function EmptyState(props: EmptyStateProps) {
  const actionSlot = children(() => props.action);
  const detailSlot = children(() => props.detail);
  return (
    <div class={s.root} data-layout={props.layout ?? "centered"}>
      {props.illustration}
      <div class={s.copy}>
        <Text as="h2" variant={props.layout === "inline" ? "panelTitle" : "heading"}>
          {props.title}
        </Text>
        <Text as="div" variant={props.layout === "inline" ? "bodySmall" : "body"} tone="secondary">
          {props.description}
        </Text>
        <Show when={detailSlot()}>
          <Text as="div" variant="caption" tone="muted">
            {detailSlot()}
          </Text>
        </Show>
      </div>
      <Show when={actionSlot()}>{actionSlot()}</Show>
    </div>
  );
}
/** Decorative state illustrations; the empty-state heading carries their meaning. */
export function EmptyStateIllustration(props: {
  kind:
    | "empty-hoop"
    | "separate-cloth"
    | "empty-spool"
    | "unpinned-policy"
    | "folded-stacks"
    | "no-items"
    | "no-results"
    | "first-stitch"
    | "disconnected"
    | "nothing-waiting"
    | "mended"
    | "parked-needle"
    | "unstitched-cloth"
    | "needle-beside-cloth";
}) {
  return (
    <Switch>
      <Match when={props.kind === "needle-beside-cloth"}>
        <svg class={s.illustration} viewBox="0 0 240 170" fill="none" aria-hidden="true">
          <path
            d="M34 112 L206 96"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linecap="round"
          />
          <path
            d="M56 60 L188 48"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          />
          <ellipse
            cx="62"
            cy="60"
            rx="2.6"
            ry="5"
            transform="rotate(-5 62 60)"
            stroke={vars.color.text.primary}
            stroke-width="1.2"
          />
          <path
            d="M62 66 C88 82 44 92 74 104"
            stroke={vars.color.text.primary}
            stroke-width="1.4"
            stroke-dasharray="7 6"
            stroke-linecap="round"
          />
        </svg>
      </Match>
      <Match when={props.kind === "unstitched-cloth"}>
        <svg class={s.illustration} viewBox="0 0 240 160" fill="none" aria-hidden="true">
          <path
            d="M28 44 L208 34 L202 128 L34 138 Z"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linejoin="round"
          />
          <path
            d="M48 108 L214 28"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          />
          <ellipse
            cx="208"
            cy="31"
            rx="4.6"
            ry="2.4"
            transform="rotate(-26 208 31)"
            stroke={vars.color.text.primary}
            stroke-width="1.2"
          />
        </svg>
      </Match>
      <Match when={props.kind === "empty-hoop"}>
        <svg class={s.illustration} viewBox="0 0 240 180" fill="none" aria-hidden="true">
          <circle cx="120" cy="95" r="66" stroke={vars.color.line.control} />
          <circle cx="120" cy="95" r="58" stroke={vars.color.line.subtle} />
          <path d="M112 23H128 M120 18V29" stroke={vars.color.line.control} />
        </svg>
      </Match>
      <Match when={props.kind === "separate-cloth"}>
        <svg class={s.illustration} viewBox="0 0 240 180" fill="none" aria-hidden="true">
          <path
            d="M20 55L96 45L90 130L26 140Z M147 48L220 58L210 141L145 131Z"
            stroke={vars.color.line.control}
            stroke-width="1.4"
          />
          <path d="M82 60V121 M157 62V122" stroke={vars.color.line.subtle} stroke-dasharray="3 5" />
        </svg>
      </Match>
      <Match when={props.kind === "empty-spool"}>
        <svg class={s.illustration} viewBox="0 0 240 180" fill="none" aria-hidden="true">
          <path
            d="M70 30H170 M70 150H170 M86 30V150 M154 30V150"
            stroke={vars.color.line.control}
            stroke-width="1.4"
          />
          <path d="M120 30V150" stroke={vars.color.line.subtle} stroke-dasharray="4 6" />
        </svg>
      </Match>
      <Match when={props.kind === "unpinned-policy" || props.kind === "folded-stacks"}>
        <svg class={s.illustration} viewBox="0 0 240 170" fill="none" aria-hidden="true">
          <Show
            when={props.kind === "unpinned-policy"}
            fallback={
              <>
                <path
                  d="M20 118L92 104L159 118L89 132Z M23 105L92 91L156 105 M28 91L92 78L152 91 M158 131L194 123L226 132L191 140Z M160 121L194 113L224 121"
                  stroke={vars.color.line.control}
                  stroke-width="1.4"
                />
                <path d="M82 39H157" stroke={vars.color.text.primary} stroke-width="1.6" />
                <ellipse cx="89" cy="39" rx="2.5" ry="5" stroke={vars.color.text.primary} />
              </>
            }
          >
            <path
              d="M36 35L208 24L198 139L45 150Z"
              stroke={vars.color.line.control}
              stroke-width="1.4"
            />
            <path
              d="M77 51V116 M122 45V111 M167 42V106"
              stroke={vars.color.line.subtle}
              stroke-dasharray="3 5"
            />
            <circle cx="77" cy="47" r="4" stroke={vars.color.text.primary} />
            <circle cx="122" cy="41" r="4" stroke={vars.color.text.primary} />
            <circle cx="167" cy="38" r="4" stroke={vars.color.text.primary} />
          </Show>
        </svg>
      </Match>
      <Match when={props.kind === "first-stitch"}>
        <svg
          class={s.illustration}
          data-kind="first-stitch"
          data-stitch="on"
          viewBox="0 0 240 180"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="112"
            cy="92"
            r="66"
            stroke={vars.color.line.control}
            stroke-width="1.4"
          ></circle>
          <circle
            cx="112"
            cy="92"
            r="58"
            stroke={vars.color.line.control}
            stroke-width="1.2"
          ></circle>
          <path
            d="M100 26 h24 a5 5 0 0 1 0 10 h-24 a5 5 0 0 1 0 -10 Z"
            stroke={vars.color.line.control}
            stroke-width="1.3"
            stroke-linejoin="round"
          ></path>
          <path
            d="M84 100 H140"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-dasharray="7 6"
            stroke-linecap="round"
            data-seam="1"
          ></path>
          <path
            d="M140 100 L196 66"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          ></path>
          <ellipse
            cx="190"
            cy="70"
            rx="5"
            ry="2.5"
            transform="rotate(-31 190 70)"
            stroke={vars.color.text.primary}
            stroke-width="1.2"
          ></ellipse>
        </svg>
      </Match>
      <Match when={props.kind === "disconnected"}>
        <svg
          class={s.illustration}
          data-kind="disconnected"
          viewBox="0 0 240 180"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M62 40 L152 118"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          ></path>
          <ellipse
            cx="68"
            cy="46"
            rx="3"
            ry="6"
            transform="rotate(41 68 46)"
            stroke={vars.color.text.primary}
            stroke-width="1.3"
          ></ellipse>
          <path
            d="M34 132 C66 120 96 146 128 134 C152 125 168 140 190 132"
            stroke={vars.color.line.control}
            stroke-width="1.5"
            stroke-dasharray="7 6"
            stroke-linecap="round"
          ></path>
          <path
            d="M186 44 L214 44 M200 30 L200 58"
            stroke={vars.color.line.control}
            stroke-width="1.3"
            stroke-linecap="round"
          ></path>
        </svg>
      </Match>
      <Match when={props.kind === "nothing-waiting"}>
        <svg
          class={s.illustration}
          data-kind="nothing-waiting"
          data-stitch="on"
          viewBox="0 0 200 130"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M24 106 H176"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linecap="round"
          ></path>
          <path
            d="M100 22 V106"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          ></path>
          <ellipse
            cx="100"
            cy="31"
            rx="2.8"
            ry="5.4"
            stroke={vars.color.text.primary}
            stroke-width="1.2"
          ></ellipse>
          <path
            d="M100 38 C70 52 132 68 94 90"
            stroke={vars.color.text.primary}
            stroke-width="1.5"
            stroke-dasharray="7 6"
            stroke-linecap="round"
            data-seam="1"
          ></path>
        </svg>
      </Match>
      <Match when={props.kind === "mended"}>
        <svg
          class={s.illustration}
          data-kind="mended"
          viewBox="0 0 240 170"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M26 40 H104 V136 H26 Z"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linejoin="round"
          ></path>
          <path
            d="M136 36 H214 V132 H136 Z"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linejoin="round"
          ></path>
          <path
            d="M104 50 L136 66 M136 50 L104 66 M104 76 L136 92 M136 76 L104 92 M104 102 L136 118 M136 102 L104 118"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          ></path>
        </svg>
      </Match>
      <Match when={props.kind === "parked-needle"}>
        <svg
          class={s.illustration}
          data-kind="parked-needle"
          viewBox="0 0 200 120"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M26 74 L96 66 L172 74 L100 84 Z"
            stroke={vars.color.line.control}
            stroke-width="1.4"
            stroke-linejoin="round"
          ></path>
          <path
            d="M34 62 L98 55 L164 62"
            stroke={vars.color.line.control}
            stroke-width="1.2"
            stroke-linejoin="round"
          ></path>
          <path
            d="M52 44 H150"
            stroke={vars.color.text.primary}
            stroke-width="1.7"
            stroke-linecap="round"
          ></path>
          <ellipse
            cx="58"
            cy="44"
            rx="2.6"
            ry="5"
            stroke={vars.color.text.primary}
            stroke-width="1.2"
          ></ellipse>
          <circle
            cx="164"
            cy="34"
            r="11"
            stroke={vars.color.text.primary}
            stroke-width="1.4"
          ></circle>
          <circle
            cx="164"
            cy="34"
            r="4.5"
            stroke={vars.color.line.control}
            stroke-width="1.2"
          ></circle>
        </svg>
      </Match>
      <Match when={props.kind === "no-items" || props.kind === "no-results"}>
        <svg
          class={s.illustration}
          data-kind={props.kind}
          viewBox="0 0 240 170"
          fill="none"
          aria-hidden="true"
        >
          <Show
            when={props.kind === "no-items"}
            fallback={
              <>
                <circle cx="120" cy="86" r="62" stroke="currentColor" stroke-width="1.7" />
                <circle
                  cx="120"
                  cy="86"
                  r="54"
                  stroke="currentColor"
                  stroke-width="1.2"
                  stroke-dasharray="3 7"
                />
                <path
                  d="M120 24v-10 M108 17h24"
                  stroke="currentColor"
                  stroke-width="1.7"
                  stroke-linecap="round"
                />
              </>
            }
          >
            <path
              d="M30 46L208 34L202 138L36 148Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
            />
            <path
              d="M46 112C88 90 138 100 190 70"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-dasharray="7 6"
              stroke-linecap="round"
            />
            <path
              d="M188 71L228 50"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linecap="round"
            />
            <ellipse
              cx="222"
              cy="53"
              rx="4.6"
              ry="2.4"
              transform="rotate(-27 222 53)"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </Show>
        </svg>
      </Match>
    </Switch>
  );
}
