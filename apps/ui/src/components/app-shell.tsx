import { WorkspaceMark } from "./workspace-mark.tsx";
import { InspectorHostContext } from "./inspector-host.tsx";
import { createSignal, createUniqueId, onCleanup, onMount, Show, type JSX } from "solid-js";
import { breakpoint } from "../tokens/index.ts";
import { Dialog } from "./dialog.tsx";
import { NavigationToggle } from "./navigation-toggle.tsx";
import * as s from "./app-shell.css.ts";

export interface AppShellProps {
  workspace: string;
  /** What stands under the workspace name: who the reader is here, when known. */
  caption?: string;
  header: (navigation: JSX.Element) => JSX.Element;
  navigation: (compact: boolean, close: () => void) => JSX.Element;
  account?: (compact: boolean) => JSX.Element;
  children: JSX.Element;
}

/** Responsive navigation frame. Destinations and routing remain owned by the application. */
export function AppShell(props: AppShellProps) {
  const [inspectorMount, setInspectorMount] = createSignal<HTMLDivElement>();
  const [width, setWidth] = createSignal(0);
  const [open, setOpen] = createSignal(false);
  const [accountMode, setAccountMode] = createSignal("mobile");
  const contentId = createUniqueId();
  let main!: HTMLElement;
  let frame!: HTMLDivElement;
  const close = () => setOpen(false);
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(frame);
    onCleanup(() => observer.disconnect());
    const desktop = window.matchMedia(`(min-width: ${breakpoint.sidebar}px)`);
    const tablet = window.matchMedia(`(min-width: ${breakpoint.navigation}px)`);
    const change = () => {
      setAccountMode(desktop.matches ? "desktop" : tablet.matches ? "tablet" : "mobile");
      if (desktop.matches && open()) {
        close();
        main.focus({ preventScroll: true });
      }
    };
    change();
    tablet.addEventListener("change", change);
    desktop.addEventListener("change", change);
    onCleanup(() => {
      desktop.removeEventListener("change", change);
      tablet.removeEventListener("change", change);
    });
  });
  const menu = (variant: "ghost" | "secondary") => (
    <NavigationToggle variant={variant} expanded={open()} onClick={() => setOpen(true)} />
  );
  const workspace = (withAccount: boolean) => (
    <div class={s.identity}>
      <WorkspaceMark name={props.workspace} />
      <span class={s.identityText}>
        <strong class={s.name}>{props.workspace}</strong>
        <span class={s.caption}>{props.caption ?? "workspace"}</span>
      </span>
      <Show when={withAccount}>{props.account?.(false)}</Show>
    </div>
  );
  return (
    <InspectorHostContext.Provider value={{ mount: inspectorMount, width }}>
      <div class={s.shell}>
        <a href={`#${contentId}`} class={s.skip} onClick={() => main.focus()}>
          Skip to content
        </a>
        <aside class={s.sidebar} data-surface="inverse" aria-label="Workspace sidebar">
          {workspace(accountMode() === "desktop")}
          <nav class={s.navigation} aria-label="Main navigation">
            {props.navigation(false, close)}
          </nav>
        </aside>
        <aside class={s.rail} data-surface="inverse" aria-label="Workspace rail">
          <WorkspaceMark name={props.workspace} />
          {menu("ghost")}
          <nav class={s.railNav} aria-label="Main navigation">
            {props.navigation(true, close)}
          </nav>
          <div class={s.railAccount}>
            <Show when={accountMode() === "tablet"}>{props.account?.(true)}</Show>
          </div>
        </aside>
        <div
          ref={(node) => {
            frame = node;
          }}
          class={s.workspace}
        >
          <div class={s.body}>
            {props.header(
              accountMode() === "mobile" ? (
                <div class={s.mobileMenu}>{menu("secondary")}</div>
              ) : undefined,
            )}
            <main
              ref={(node) => {
                main = node;
              }}
              id={contentId}
              tabIndex={-1}
              class={s.main}
            >
              {props.children}
            </main>
          </div>
          <div class={s.inspectorHost} ref={setInspectorMount} />
        </div>
        <div data-surface="inverse">
          <Dialog
            open={open()}
            onOpenChange={setOpen}
            placement="start"
            title="Navigation"
            hideTitle
            closeOnBackdrop
          >
            {workspace(open())}
            <nav class={s.navigation} aria-label="Main navigation">
              {props.navigation(false, close)}
            </nav>
          </Dialog>
        </div>
      </div>
    </InspectorHostContext.Provider>
  );
}
