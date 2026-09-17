import { Text } from "./text.tsx";
import { Show, type JSX } from "solid-js";
import * as s from "./work-item-row.css.ts";
import { Identity, type IdentityData } from "./identity.tsx";
export type WorkItemRowProps = {
  timestamp?: { text: string; dateTime?: string };
  title: string;
  identityKind?: IdentityData["kind"];
  density?: "regular" | "compact";
  metadataPlacement?: "responsive" | "inline";
  titleAccessory?: JSX.Element;
  titleKind?: "text" | "code";
  supportingTone?: "neutral" | "success" | "pending" | "danger";
  active?: boolean;
  primaryRef?: (element: HTMLButtonElement | HTMLAnchorElement) => void;
  supportingText?: string;
  indicator?: JSX.Element;
  leadingIcon?: JSX.Element;
  metadata?: JSX.Element;
  progress?: JSX.Element;
  actions?: JSX.Element;
  /** What the row has to say about its last action, beneath it: a refusal, mostly. */
  notice?: JSX.Element;
  selection?: { selected: boolean; onChange: (selected: boolean) => void; disabled?: boolean };
} & (
  | { href: string; onOpen?: never }
  | { href?: never; onOpen: () => void }
  | { href?: never; onOpen?: never }
);
/** Selection and actions are siblings of the primary link/button, so they never activate the row. */
export function WorkItemRow(props: WorkItemRowProps) {
  const content = () => (
    <>
      <Text as="span" variant="inherit" class={s.titleLine}>
        <Text
          as="span"
          variant={
            props.titleKind === "code" ? "mono" : props.density === "compact" ? "bodySmall" : "body"
          }
          class={s.title}
          data-kind={props.titleKind}
        >
          <Show when={props.identityKind} fallback={props.title}>
            {(kind) => <Identity name={props.title} kind={kind()} size="small" />}
          </Show>
        </Text>
        {props.titleAccessory}
      </Text>
      <Show when={props.supportingText}>
        <Text as="span" variant="caption" class={s.supporting} data-tone={props.supportingTone}>
          {props.supportingText}
        </Text>
      </Show>
    </>
  );
  return (
    <div
      role="listitem"
      class={s.row}
      data-density={props.density}
      data-metadata={props.metadataPlacement}
      data-interactive={!!(props.href || props.onOpen)}
      data-active={props.active || undefined}
      data-icon={!!props.leadingIcon}
      data-identity={!!props.identityKind}
      data-timestamp={!!props.timestamp}
      data-selectable={!!props.selection}
      data-selected={props.selection?.selected || undefined}
    >
      <Show when={props.selection}>
        {(selection) => (
          <Text as="label" variant="inherit" class={s.selection}>
            <input
              type="checkbox"
              class={s.checkbox}
              aria-label={`Select ${props.title}`}
              checked={selection().selected}
              disabled={selection().disabled}
              onChange={(event) => selection().onChange(event.currentTarget.checked)}
            />
          </Text>
        )}
      </Show>
      <Text as="span" variant="inherit" class={s.indicator}>
        {props.leadingIcon ?? props.indicator}
      </Text>
      <Show when={props.timestamp}>
        {(time) => (
          <Text as="time" variant="caption" class={s.timestamp} dateTime={time().dateTime}>
            {time().text}
          </Text>
        )}
      </Show>
      <Show
        when={props.href}
        fallback={
          <Show
            when={props.onOpen}
            fallback={
              <div class={s.primary} data-static>
                {content()}
              </div>
            }
          >
            <button
              ref={props.primaryRef}
              type="button"
              class={s.primary}
              aria-current={props.active ? "true" : undefined}
              onClick={() => props.onOpen?.()}
            >
              {content()}
            </button>
          </Show>
        }
      >
        {(href) => (
          <a
            ref={props.primaryRef}
            class={s.primary}
            aria-current={props.active ? "true" : undefined}
            href={href()}
          >
            {content()}
          </a>
        )}
      </Show>
      <Show when={props.metadata || props.timestamp || props.progress}>
        <Text as="div" variant="caption" class={s.metadata}>
          <Show when={props.timestamp}>
            {(time) => (
              <Text
                as="time"
                variant="inherit"
                class={s.mobileTimestamp}
                dateTime={time().dateTime}
              >
                {time().text}
              </Text>
            )}
          </Show>
          <Show when={props.progress}>
            <Text as="span" variant="inherit" class={s.progress}>
              {props.progress}
            </Text>
          </Show>
          {props.metadata}
        </Text>
      </Show>
      <Show when={props.actions}>
        <div class={s.actions}>{props.actions}</div>
      </Show>
      <Show when={props.notice}>
        <div class={s.notice}>{props.notice}</div>
      </Show>
    </div>
  );
}
export function WorkItemList(props: { label: string; children: JSX.Element }) {
  return (
    <div role="list" aria-label={props.label} class={s.list}>
      {props.children}
    </div>
  );
}

export function WorkItemMetadataItem(props: { children: JSX.Element }) {
  return (
    <Text as="span" variant="inherit" class={s.metadataItem}>
      {props.children}
    </Text>
  );
}
