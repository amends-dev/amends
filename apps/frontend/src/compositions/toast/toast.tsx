import { IconX } from "@amends/icons";
import {
  For,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import * as s from "./toast.css.ts";

interface Entry {
  id: number;
  render: () => JSX.Element;
  previous?: HTMLElement;
  element?: HTMLElement;
}
interface Queue {
  entries: Accessor<Entry[]>;
  duration: Accessor<number>;
  limit: Accessor<number>;
  show: (render: () => JSX.Element) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}
const QueueContext = createContext<Queue>();
const EntryContext = createContext<Entry>();
const PauseContext = createContext<Accessor<boolean>>();
const MessageContext = createContext<{
  close: () => void;
  addAction: () => () => void;
}>();
function queue() {
  const value = useContext(QueueContext);
  if (!value) throw new Error("Toast requires Toast.Provider");
  return value;
}
function message() {
  const value = useContext(MessageContext);
  if (!value) throw new Error("Toast parts require Toast.Root");
  return value;
}
export interface ProviderProps extends ParentProps {
  /** Auto-dismiss lifetime for messages without actions, in milliseconds. */
  duration?: number;
  /** Additional messages wait without starting their timers. */
  limit?: number;
}
export function Provider(props: ProviderProps) {
  const [entries, setEntries] = createSignal<Entry[]>([]);
  let nextId = 0,
    disposed = false;
  const dismiss = (id: number) => {
    const entry = entries().find((entry) => entry.id === id);
    const restore = entry?.element?.contains(entry.element.ownerDocument.activeElement);
    setEntries((current) => current.filter((entry) => entry.id !== id));
    if (restore && entry?.previous?.isConnected && !entry.previous.closest("[hidden], [inert]"))
      entry.previous.focus({ preventScroll: true });
  };
  const clear = () => {
    for (const entry of entries()) dismiss(entry.id);
  };
  onCleanup(() => {
    disposed = true;
    clear();
  });
  return (
    <QueueContext.Provider
      value={{
        entries,
        duration: () => props.duration ?? 5000,
        limit: () => Math.max(1, Math.floor(props.limit ?? 3)),
        show: (render) => {
          const id = nextId++;
          if (!disposed)
            setEntries((current) => [
              ...current,
              {
                id,
                render,
                previous:
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : undefined,
              },
            ]);
          return id;
        },
        dismiss,
        clear,
      }}
    >
      {props.children}
    </QueueContext.Provider>
  );
}
/** Scoped to the nearest provider; no module-global notification store. */
export function useToast() {
  const state = queue();
  return { show: state.show, dismiss: state.dismiss, clear: state.clear };
}
export type ViewportProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children">;
/** Mount once per provider, inside the current theme and, for modal feedback, inside that dialog. */
export function Viewport(props: ViewportProps) {
  const state = queue();
  const [local, native] = splitProps(props, ["class", "classList"]);
  const [hovered, setHovered] = createSignal(false),
    [focused, setFocused] = createSignal(false),
    [inactive, setInactive] = createSignal(false);
  let element!: HTMLDivElement;
  createEffect(() => {
    const entries = state.entries();
    if (!entries.length) setHovered(false);
    // Removing a focused DOM node need not dispatch focusout. Reconcile after queue changes.
    queueMicrotask(() => {
      if (element?.isConnected) setFocused(element.contains(element.ownerDocument.activeElement));
    });
  });
  onMount(() => {
    const doc = element.ownerDocument,
      win = doc.defaultView!;
    const blur = () => setInactive(true),
      focus = () => setInactive(doc.hidden),
      visibility = () => setInactive(doc.hidden);
    const shortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.code !== "KeyT" ||
        !element.children.length ||
        !element.getClientRects().length
      )
        return;
      const modals = doc.querySelectorAll("dialog:modal"),
        modal = modals.item(modals.length - 1);
      if (modal && !modal.contains(element)) return;
      event.preventDefault();
      (element.firstElementChild as HTMLElement).focus();
    };
    setInactive(doc.hidden);
    win.addEventListener("blur", blur);
    win.addEventListener("focus", focus);
    doc.addEventListener("visibilitychange", visibility);
    doc.addEventListener("keydown", shortcut);
    onCleanup(() => {
      win.removeEventListener("blur", blur);
      win.removeEventListener("focus", focus);
      doc.removeEventListener("visibilitychange", visibility);
      doc.removeEventListener("keydown", shortcut);
    });
  });
  return (
    <div
      {...native}
      role="region"
      aria-label={props["aria-label"] ?? "Notifications (Alt+T)"}
      class={classes(s.viewport, local.class, local.classList)}
      data-frontend-toast-viewport
    >
      <PauseContext.Provider value={() => hovered() || focused() || inactive()}>
        <div
          ref={(node) => {
            element = node;
          }}
          class={s.list}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          onFocusIn={() => setFocused(true)}
          onFocusOut={(event) => {
            if (!element.contains(event.relatedTarget as Node | null)) setFocused(false);
          }}
        >
          <For each={state.entries().slice(0, state.limit())}>
            {(entry) => (
              <EntryContext.Provider value={entry}>{entry.render()}</EntryContext.Provider>
            )}
          </For>
        </div>
      </PauseContext.Provider>
    </div>
  );
}
export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  duration?: number;
  /** Actions persist by default. Set explicitly to override that policy. */
  persistent?: boolean;
};
export function Root(props: RootProps) {
  const state = queue(),
    entry = useContext(EntryContext),
    paused = useContext(PauseContext);
  if (!entry || !paused)
    throw new Error("Toast.Root must be rendered by useToast().show inside Toast.Viewport");
  const [actions, setActions] = createSignal(0);
  const [local, native] = splitProps(props, [
    "duration",
    "persistent",
    "class",
    "classList",
    "ref",
    "children",
    "onKeyDown",
  ]);
  const close = () => state.dismiss(entry.id);
  createEffect(() => {
    let remaining = local.duration ?? state.duration();
    const persistent = local.persistent ?? actions() > 0;
    if (persistent) return;
    createEffect(() => {
      if (paused()) return;
      const started = Date.now();
      const timer = setTimeout(close, Math.max(0, remaining));
      onCleanup(() => {
        clearTimeout(timer);
        remaining -= Date.now() - started;
      });
    });
  });
  onCleanup(() => {
    entry.element = undefined;
  });
  return (
    <MessageContext.Provider
      value={{
        close,
        addAction: () => {
          setActions((n) => n + 1);
          return () => setActions((n) => n - 1);
        },
      }}
    >
      <div
        {...native}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={0}
        ref={(node) => {
          entry.element = node;
          if (typeof local.ref === "function") local.ref(node);
        }}
        class={classes(s.root, local.class, local.classList)}
        data-frontend-toast
        onKeyDown={(event) => {
          callHandler(local.onKeyDown, event);
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        {local.children}
      </div>
    </MessageContext.Provider>
  );
}
function part(props: JSX.HTMLAttributes<HTMLDivElement>, base: string) {
  message();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(base, local.class, local.classList)} />;
}
export const Content = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.content);
export const Title = (props: JSX.HTMLAttributes<HTMLDivElement>) => part(props, s.title);
export const Description = (props: JSX.HTMLAttributes<HTMLDivElement>) =>
  part(props, s.description);
export function Action(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const state = message();
  onCleanup(state.addAction());
  const [local, native] = splitProps(props, ["class", "classList", "onClick"]);
  return (
    <button
      {...native}
      type={props.type ?? "button"}
      class={classes(s.action, local.class, local.classList)}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) state.close();
      }}
    />
  );
}
export function Close(props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) {
  const state = message();
  const [local, native] = splitProps(props, ["class", "classList", "onClick", "children"]);
  return (
    <button
      {...native}
      type={props.type ?? "button"}
      aria-label={props["aria-label"] ?? "Dismiss notification"}
      class={classes(s.close, local.class, local.classList)}
      onClick={(event) => {
        callHandler(local.onClick, event);
        if (!event.defaultPrevented) state.close();
      }}
    >
      {local.children ?? <IconX />}
    </button>
  );
}
