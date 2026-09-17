import { Text } from "./text.tsx";
import { layout } from "../tokens/index.ts";
import { Portal } from "solid-js/web";
import { InspectorHostContext } from "./inspector-host.tsx";
import { IconButton } from "./button.tsx";
import {
  createEffect,
  createRenderEffect,
  on,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { Dialog } from "./dialog.tsx";
import * as s from "./inspector-layout.css.ts";
export function InspectorLayout(props: {
  presentation?: "inspector" | "conversation";
  note?: string;
  children: JSX.Element;
  inspector: () => JSX.Element;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enabled?: boolean;
  inShell?: boolean;
}) {
  if (props.presentation === "conversation") return <ConversationInspector {...props} />;
  let trigger: HTMLElement | undefined;
  createRenderEffect(
    on(
      () => props.open,
      (open) => {
        if (open) {
          const active = document.activeElement;
          trigger = active instanceof HTMLElement ? active : undefined;
        } else if (trigger?.isConnected) {
          const target = trigger;
          queueMicrotask(() => target.isConnected && target.focus({ preventScroll: true }));
          trigger = undefined;
        }
      },
    ),
  );
  const closeOnEscape: JSX.EventHandler<HTMLElement, KeyboardEvent> = (event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.stopPropagation();
      props.onOpenChange(false);
    }
  };
  const context = useContext(InspectorHostContext);
  const host = props.inShell ? context : undefined;
  const [width, setWidth] = createSignal(0);
  const wide = () => (host ? host.width() : width()) >= layout.contentMin + layout.detail;
  let root!: HTMLDivElement;
  let heading: HTMLHeadingElement | undefined;
  onMount(() => {
    if (host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => {
    if (props.open && wide()) queueMicrotask(() => heading?.focus({ preventScroll: true }));
  });
  return (
    <div
      ref={(node) => {
        root = node;
      }}
      class={s.root}
      data-inspector={props.enabled !== false && props.open && !host && wide()}
    >
      <div class={s.primary}>{props.children}</div>
      <Show when={props.enabled !== false && props.open}>
        {(_open) => {
          const content = props.inspector();
          return (
            <Show
              when={wide()}
              fallback={
                <Dialog
                  title={props.title}
                  placement="end"
                  showClose
                  closeOnBackdrop
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  returnFocus={() => trigger}
                >
                  {content}
                </Dialog>
              }
            >
              <Show
                when={host}
                fallback={
                  <aside class={s.panel} aria-label={props.title} onKeyDown={closeOnEscape}>
                    <div class={s.closeRow}>
                      <Text
                        as="h2"
                        variant="panelTitle"
                        ref={(node) => {
                          heading = node;
                        }}
                        tabIndex={-1}
                        class={s.title}
                      >
                        {props.title}
                      </Text>
                      <IconButton
                        label={`Close ${props.title.toLowerCase()}`}
                        variant="secondary"
                        onClick={() => props.onOpenChange(false)}
                      >
                        ×
                      </IconButton>
                    </div>
                    {content}
                  </aside>
                }
              >
                <Show when={host?.mount()}>
                  {(mount) => (
                    <Portal mount={mount()}>
                      <aside
                        class={s.dockedPanel}
                        aria-label={props.title}
                        onKeyDown={closeOnEscape}
                      >
                        <div class={s.closeRow}>
                          <Text
                            as="h2"
                            variant="panelTitle"
                            ref={(node) => {
                              heading = node;
                            }}
                            tabIndex={-1}
                            class={s.title}
                          >
                            {props.title}
                          </Text>
                          <IconButton
                            label={`Close ${props.title.toLowerCase()}`}
                            variant="secondary"
                            onClick={() => props.onOpenChange(false)}
                          >
                            ×
                          </IconButton>
                        </div>
                        {content}
                      </aside>
                    </Portal>
                  )}
                </Show>
              </Show>
            </Show>
          );
        }}
      </Show>
    </div>
  );
}
export function InspectorHeading(props: {
  title: string;
  note?: JSX.Element;
  children?: JSX.Element;
}) {
  return (
    <header class={s.heading}>
      <Text as="div" variant="caption" class={s.eyebrow}>
        {props.note}
      </Text>
      <Text as="h2" variant="panelTitle" class={s.title}>
        {props.title}
      </Text>
      {props.children}
    </header>
  );
}

function ConversationInspector(props: {
  children: JSX.Element;
  inspector: () => JSX.Element;
  title: string;
  note?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  let trigger: HTMLElement | undefined;
  createRenderEffect(
    on(
      () => props.open,
      (open) => {
        if (open) {
          const active = document.activeElement;
          trigger = active instanceof HTMLElement ? active : undefined;
        } else if (trigger?.isConnected) {
          const target = trigger;
          queueMicrotask(() => target.isConnected && target.focus({ preventScroll: true }));
          trigger = undefined;
        }
      },
    ),
  );
  const host = useContext(InspectorHostContext);
  const [width, setWidth] = createSignal(0);
  const wide = () => (host ? host.width() : width()) >= layout.contentMin + layout.detail;
  let root!: HTMLDivElement;
  let heading: HTMLHeadingElement | undefined;
  onMount(() => {
    if (host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(root);
    onCleanup(() => observer.disconnect());
  });
  createEffect(
    on(
      () => props.open && wide(),
      (docked) => {
        if (docked) queueMicrotask(() => heading?.focus({ preventScroll: true }));
      },
    ),
  );
  const panel = () => (
    <aside
      class={s.conversationPanel}
      data-wide={wide()}
      aria-label={props.title}
      onKeyDown={(event) => {
        if (wide() && event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          props.onOpenChange(false);
        }
      }}
    >
      <div class={s.conversationHeading}>
        <div>
          <Text
            as="h2"
            variant="panelTitle"
            ref={(node) => {
              heading = node;
            }}
            tabindex="-1"
            class={s.title}
          >
            {props.title}
          </Text>
          <Text as="span" variant="caption" class={s.eyebrow}>
            {props.note}
          </Text>
        </div>
        <IconButton
          label="Close thread"
          variant="secondary"
          onClick={() => props.onOpenChange(false)}
        >
          ×
        </IconButton>
      </div>
      <div class={s.conversationContent}>{props.inspector()}</div>
    </aside>
  );
  return (
    <div
      ref={(node) => {
        root = node;
      }}
      class={s.conversationRoot}
      data-wide={wide()}
    >
      <div class={s.conversationPrimary}>{props.children}</div>
      <Show when={props.open}>
        {(_open) => {
          const thread = panel();
          return (
            <Show
              when={wide()}
              fallback={
                <Dialog
                  title={props.title}
                  hideTitle
                  placement="end"
                  contentLayout="fill"
                  closeOnBackdrop
                  open={props.open}
                  onOpenChange={props.onOpenChange}
                  initialFocus={() => heading}
                  returnFocus={() => (wide() ? heading : trigger)}
                >
                  {thread}
                </Dialog>
              }
            >
              <Show when={host?.mount()} fallback={thread}>
                {(mount) => <Portal mount={mount()}>{thread}</Portal>}
              </Show>
            </Show>
          );
        }}
      </Show>
    </div>
  );
}
