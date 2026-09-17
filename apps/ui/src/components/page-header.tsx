import { Text } from "./text.tsx";
import { Index, Show, type JSX } from "solid-js";
import { Breadcrumbs } from "./breadcrumbs.tsx";
import { Button, type ButtonProps } from "./button.tsx";
import * as s from "./page-header.css.ts";
import { Identity, type IdentityData } from "./identity.tsx";

export interface PageHeaderAction {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  variant?: ButtonProps["variant"];
  tone?: ButtonProps["tone"];
  pending?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}

export interface PageHeaderProps {
  title: string;
  identityKind?: IdentityData["kind"];
  titleControl?: JSX.Element;
  titleKind?: "text" | "code";
  headingLevel?: "h1" | "h2";
  breadcrumbs?: JSX.Element;
  navigation?: JSX.Element;
  /** Page-level actions only. Form submissions belong after the form; status belongs in summary. */
  actions?: readonly [PageHeaderAction, PageHeaderAction?] | undefined;
  summary?: JSX.Element;
}

/** Ancestry, title/actions, then metadata. Mobile actions retain their names as circular icons. */
export function PageHeader(props: PageHeaderProps) {
  return (
    <header class={s.header}>
      <div class={s.ancestry}>
        <Show when={props.navigation}>
          <div class={s.navigation}>{props.navigation}</div>
        </Show>
        <div class={s.breadcrumbs}>
          {props.breadcrumbs ?? <Breadcrumbs items={[{ label: props.title }]} />}
        </div>
      </div>
      <div class={s.row}>
        <Text
          as={props.headingLevel ?? "h1"}
          variant={props.titleKind === "code" ? "pageCodeTitle" : "pageTitle"}
          aria-label={props.titleControl ? props.title : undefined}
          class={s.title}
          title={props.titleKind === "code" ? props.title : undefined}
          data-kind={props.titleKind ?? "text"}
        >
          <Show
            when={props.titleControl ? undefined : props.identityKind}
            fallback={props.titleControl ?? props.title}
          >
            {(kind) => <Identity name={props.title} kind={kind()} size="small" />}
          </Show>
        </Text>
        <Show when={props.actions}>
          <div class={s.actions}>
            <Index each={props.actions}>
              {(action) => (
                <Show when={action()}>
                  {(action) => (
                    <Button
                      compactIcon={action().icon}
                      variant={action().variant ?? "primary"}
                      tone={action().tone ?? "neutral"}
                      pending={action().pending ?? false}
                      disabled={action().disabled}
                      aria-pressed={action().pressed}
                      onClick={() => action().onClick()}
                    >
                      {action().label}
                    </Button>
                  )}
                </Show>
              )}
            </Index>
          </div>
        </Show>
      </div>
      <Show when={props.summary}>
        <Text as="div" variant="caption" class={s.summary}>
          {props.summary}
        </Text>
      </Show>
    </header>
  );
}
