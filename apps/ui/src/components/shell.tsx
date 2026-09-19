import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  Show,
  useContext,
  type Accessor,
  type ParentProps,
} from "solid-js";
import { breakpoint } from "../tokens/index.ts";
import { Dialog } from "./dialog.tsx";
import { InspectorHostContext } from "./inspector-host.tsx";
import { OverlayHostContext } from "./overlay-scope.ts";
import { NavigationToggle as Toggle } from "./navigation-toggle.tsx";
import * as s from "./shell.css.ts";

type Mode = "mobile" | "rail" | "sidebar";
interface ShellState {
  contentId: string;
  main: Accessor<HTMLElement | undefined>;
  setMain: (element: HTMLElement) => void;
  open: Accessor<boolean>;
  setOpen: (open: boolean) => void;
  mode: Accessor<Mode>;
  setMode: (mode: Mode) => void;
  hasSidebar: Accessor<boolean>;
  setHasSidebar: (value: boolean) => void;
  navigationTrigger: Accessor<HTMLElement | undefined>;
  setNavigationTrigger: (element: HTMLElement) => void;
}
const Context = createContext<ShellState>();
const SidebarContext = createContext<{ compact: Accessor<boolean>; close: () => void }>({
  compact: () => false,
  close: () => {},
});
function useShell() {
  const shell = useContext(Context);
  if (!shell) throw new Error("Shell parts require Shell.Root.");
  return shell;
}

export function Root(props: ParentProps) {
  const [main, setMain] = createSignal<HTMLElement>();
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<Mode>("mobile");
  const [hasSidebar, setHasSidebar] = createSignal(false);
  const [navigationTrigger, setNavigationTrigger] = createSignal<HTMLElement>();
  const contentId = createUniqueId();
  return (
    <Context.Provider
      value={{
        contentId,
        main,
        setMain,
        open,
        setOpen,
        mode,
        setMode,
        hasSidebar,
        setHasSidebar,
        navigationTrigger,
        setNavigationTrigger,
      }}
    >
      <div class={s.root}>
        <a href={`#${contentId}`} class={s.skip} onClick={() => main()?.focus()}>
          Skip to content
        </a>
        {props.children}
      </div>
    </Context.Provider>
  );
}

/** One mounted child tree moves between the sidebar/rail and the modal drawer. */
export function Sidebar(props: ParentProps<{ label?: string }>) {
  const shell = useShell();
  shell.setHasSidebar(true);
  onCleanup(() => {
    shell.setHasSidebar(false);
    shell.setOpen(false);
  });
  let dock!: HTMLDivElement;
  let drawer!: HTMLDivElement;
  let content!: HTMLDivElement;
  const [overlayHost, setOverlayHost] = createSignal<HTMLElement>();
  const close = () => shell.setOpen(false);
  const compact = () => shell.mode() === "rail" && !shell.open();
  createEffect(() => {
    const target = shell.open() ? drawer : dock;
    target.appendChild(content);
    setOverlayHost(target.closest("dialog") ?? target.ownerDocument.body);
  });
  onMount(() => {
    const desktop = window.matchMedia(`(min-width: ${breakpoint.sidebar}px)`);
    const tablet = window.matchMedia(`(min-width: ${breakpoint.navigation}px)`);
    const change = () => {
      shell.setMode(desktop.matches ? "sidebar" : tablet.matches ? "rail" : "mobile");
      if (desktop.matches && shell.open()) {
        close();
        queueMicrotask(() => shell.main()?.focus({ preventScroll: true }));
      }
    };
    change();
    desktop.addEventListener("change", change);
    tablet.addEventListener("change", change);
    onCleanup(() => {
      desktop.removeEventListener("change", change);
      tablet.removeEventListener("change", change);
    });
  });
  return (
    <SidebarContext.Provider value={{ compact, close }}>
      <OverlayHostContext.Provider value={overlayHost}>
        <aside
          class={s.sidebar}
          data-mode={shell.mode()}
          data-surface="inverse"
          aria-label={props.label ?? "Workspace navigation"}
        >
          <div
            class={s.dock}
            ref={(node) => {
              dock = node;
            }}
          >
            <div
              class={s.sidebarContent}
              data-compact={compact()}
              ref={(node) => {
                content = node;
              }}
            >
              {props.children}
            </div>
          </div>
        </aside>
        <div data-surface="inverse">
          <Dialog
            open={shell.open()}
            onOpenChange={shell.setOpen}
            placement="start"
            title="Navigation"
            hideTitle
            closeOnBackdrop
            contentLayout="fill"
            returnFocus={() =>
              shell.navigationTrigger()?.isConnected ? shell.navigationTrigger() : shell.main()
            }
          >
            <div
              class={s.drawer}
              ref={(node) => {
                drawer = node;
              }}
            />
          </Dialog>
        </div>
      </OverlayHostContext.Provider>
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);

/** Identity and actions share a row when expanded; compact actions sit below the scroll area. */
export function SidebarHeader(props: ParentProps) {
  return <div class={s.sidebarHeader}>{props.children}</div>;
}
export function SidebarContent(props: ParentProps) {
  return <div class={s.sidebarNavigation}>{props.children}</div>;
}
export function SidebarActions(props: ParentProps) {
  return <div class={s.sidebarActions}>{props.children}</div>;
}

export function NavigationToggle(props: { placement?: "header" | "sidebar" }) {
  const shell = useShell();
  const sidebar = useSidebar();
  const inSidebar = () => props.placement === "sidebar";
  return (
    <Show when={shell.hasSidebar() && shell.mode() === (inSidebar() ? "rail" : "mobile")}>
      <div
        class={inSidebar() ? s.sidebarToggle : undefined}
        hidden={inSidebar() && !sidebar.compact()}
      >
        <Toggle
          variant={inSidebar() ? "ghost" : "secondary"}
          expanded={shell.open()}
          onClick={(event) => {
            shell.setNavigationTrigger(event.currentTarget);
            shell.setOpen(true);
          }}
        />
      </div>
    </Show>
  );
}

/** Measures space after navigation, before the inspector consumes its column. */
export function Body(props: ParentProps) {
  const [mount, setMount] = createSignal<HTMLDivElement>();
  const [width, setWidth] = createSignal(0);
  let body!: HTMLDivElement;
  onMount(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(body);
    onCleanup(() => observer.disconnect());
  });
  return (
    <InspectorHostContext.Provider value={{ mount, width }}>
      <div
        class={s.body}
        ref={(node) => {
          body = node;
        }}
      >
        {props.children}
        <div class={s.inspectorHost} ref={setMount} />
      </div>
    </InspectorHostContext.Provider>
  );
}
export function Header(props: ParentProps) {
  return <header class={s.header}>{props.children}</header>;
}
export function Footer(props: ParentProps) {
  return <footer class={s.footer}>{props.children}</footer>;
}
export function Main(props: ParentProps<{ scroll?: "page" | "panels" }>) {
  const shell = useShell();
  return (
    <main
      id={shell.contentId}
      ref={shell.setMain}
      tabIndex={-1}
      class={s.main}
      data-scroll={props.scroll ?? "page"}
    >
      {props.children}
    </main>
  );
}
export * as Shell from "./shell.tsx";
