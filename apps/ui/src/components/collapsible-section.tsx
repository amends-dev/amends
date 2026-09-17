import { createUniqueId, Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import * as s from "./collapsible-section.css.ts";
import { Identity, type IdentityData } from "./identity.tsx";
export interface CollapsibleSectionProps {
  title: string;
  identityKind?: IdentityData["kind"];
  count: number;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  headingLevel?: "h2" | "h3" | "h4";
  indicator?: JSX.Element;
  note?: string;
  children: JSX.Element;
}
/** Controlled disclosure; collapsed content stays mounted but is hidden and cannot receive focus. */
export function CollapsibleSection(props: CollapsibleSectionProps) {
  const id = createUniqueId();
  return (
    <section>
      <Dynamic component={props.headingLevel ?? "h2"} class={s.heading}>
        <button
          class={s.trigger}
          type="button"
          aria-expanded={props.expanded}
          aria-controls={id}
          onClick={() => props.onExpandedChange(!props.expanded)}
        >
          <span aria-hidden="true" class={s.symbol}>
            {props.expanded ? "−" : "+"}
          </span>
          {props.indicator}
          <span class={s.title}>
            <Show when={props.identityKind} fallback={props.title}>
              {(kind) => <Identity name={props.title} kind={kind()} size="compact" />}
            </Show>
          </span>
          <span>{props.count}</span>
          <span class={s.seam} aria-hidden="true" />
          <Show when={props.note}>
            <span>{props.note}</span>
          </Show>
        </button>
      </Dynamic>
      <div id={id} hidden={!props.expanded}>
        {props.children}
      </div>
    </section>
  );
}
