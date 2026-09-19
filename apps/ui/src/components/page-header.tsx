import { Text } from "./text.tsx";
import { children, Show, type JSX } from "solid-js";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import * as s from "./page-header.css.ts";
import { Identity, type IdentityData } from "./identity.tsx";

export interface PageHeaderProps {
  title: string;
  identityKind?: IdentityData["kind"];
  titleControl?: JSX.Element;
  titleKind?: "text" | "code";
  headingLevel?: "h1" | "h2";
  breadcrumbs?: JSX.Element;
  navigation?: JSX.Element;
  /** Page-level actions only. Form submissions belong after the form; status belongs in summary. */
  actions?: JSX.Element;
  summary?: JSX.Element;
}

/** Ancestry, title/actions, then metadata. Mobile actions retain their names as circular icons. */
export function PageHeader(props: PageHeaderProps) {
  const navigationSlot = children(() => props.navigation);
  const titleControlSlot = children(() => props.titleControl);
  const actionsSlot = children(() => props.actions);
  const summarySlot = children(() => props.summary);
  return (
    <div class={s.header}>
      <div class={s.ancestry}>
        <Show when={navigationSlot()}>
          <div class={s.navigation}>{navigationSlot()}</div>
        </Show>
        <div class={s.breadcrumbs}>
          {props.breadcrumbs ?? <Breadcrumbs items={[{ label: props.title }]} />}
        </div>
      </div>
      <div class={s.row}>
        <Text
          as={props.headingLevel ?? "h1"}
          variant={props.titleKind === "code" ? "pageCodeTitle" : "pageTitle"}
          aria-label={titleControlSlot() ? props.title : undefined}
          class={s.title}
          title={props.titleKind === "code" ? props.title : undefined}
          data-kind={props.titleKind ?? "text"}
        >
          <Show
            when={titleControlSlot() ? undefined : props.identityKind}
            fallback={titleControlSlot() ?? props.title}
          >
            {(kind) => <Identity name={props.title} kind={kind()} size="small" />}
          </Show>
        </Text>
        <Show when={actionsSlot()}>
          <div class={s.actions}>{actionsSlot()}</div>
        </Show>
      </div>
      <Show when={summarySlot()}>
        <Text as="div" variant="caption" class={s.summary}>
          {summarySlot()}
        </Text>
      </Show>
    </div>
  );
}
