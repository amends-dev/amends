import { createUniqueId, type JSX } from "solid-js";
import * as s from "./navigation-section.css.ts";
export function NavigationSection(props: {
  label: string;
  compact?: boolean;
  children: JSX.Element;
}) {
  const id = createUniqueId();
  return (
    <section class={s.root} aria-labelledby={id} data-compact={props.compact || undefined}>
      <div class={s.heading}>
        <h2 id={id} class={s.label}>
          {props.label}
        </h2>
        <span class={s.seam} aria-hidden="true" />
      </div>
      {props.children}
    </section>
  );
}
