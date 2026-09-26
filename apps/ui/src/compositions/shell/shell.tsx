import {
  Show,
  createContext,
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Row, Column, Container } from "../../primitives/layout/index.ts";
import { IconButton, type IconButtonProps } from "../../primitives/icon-button/index.ts";
import { IconMenu, IconSidebarLeftOpen, IconSidebarLeftClose } from "@amends/icons";
import { OverlayHostContext } from "../../primitives/overlay/scope.ts";
import { classes, callHandler } from "../../primitives/internal/props.ts";
import { colorThemes } from "../../foundations/color/theme.css.ts";
import { NavigationPresentationContext } from "../navigation/presentation.ts";
import { Drawer } from "../drawer/index.ts";
import * as s from "./shell.css.ts";

interface State {
  mobile: Accessor<boolean>;
  tablet: Accessor<boolean>;
  overlay: Accessor<boolean>;
  collapsed: Accessor<boolean>;
  drawerOpen: Accessor<boolean>;
  setDrawerOpen: (open: boolean) => void;
  toggle: () => void;
  sidebarId: string;
  mainId: string;
  main: Accessor<HTMLElement | undefined>;
  setMain: (node: HTMLElement) => void;
  sidebar: Accessor<HTMLElement | undefined>;
  setSidebar: (node: HTMLElement | undefined) => void;
  toggleElement: Accessor<HTMLButtonElement | undefined>;
  setToggleElement: (node: HTMLButtonElement) => void;
}
const Context = createContext<State>();
function context() {
  const shell = useContext(Context);
  if (!shell) throw new Error("Shell parts require Shell.Root");
  return shell;
}
export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  defaultCollapsed?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
};
/** Responsive frame with independent desktop preference and transient mobile drawer state. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, [
    "defaultCollapsed",
    "collapsed",
    "onCollapsedChange",
    "class",
    "classList",
    "children",
  ]);
  const [internalCollapsed, setCollapsed] = createSignal(
    untrack(() => local.defaultCollapsed ?? false),
  );
  const collapsed = () => local.collapsed ?? internalCollapsed();
  const [mobile, setMobile] = createSignal(false),
    [tablet, setTablet] = createSignal(false),
    [drawerOpen, setDrawerOpen] = createSignal(false);
  const overlay = createMemo(() => mobile() || tablet());
  const modalOpen = createMemo(() => overlay() && drawerOpen());
  const [main, setMain] = createSignal<HTMLElement>(),
    [sidebar, setSidebar] = createSignal<HTMLElement>(),
    [toggleElement, setToggleElement] = createSignal<HTMLButtonElement>();
  const id = createUniqueId(),
    sidebarId = `shell-${id}-navigation`,
    mainId = `shell-${id}-main`;
  onMount(() => {
    const media = window.matchMedia("(max-width: 47.999rem)");
    const tabletMedia = window.matchMedia("(min-width: 48rem) and (max-width: 63.999rem)");
    const update = () => {
      setMobile(media.matches);
      setTablet(tabletMedia.matches);
      setDrawerOpen(false);
    };
    update();
    media.addEventListener("change", update);
    tabletMedia.addEventListener("change", update);
    onCleanup(() => {
      media.removeEventListener("change", update);
      tabletMedia.removeEventListener("change", update);
    });
  });
  const toggle = () => {
    if (overlay()) setDrawerOpen(!drawerOpen());
    else {
      const next = !collapsed();
      if (local.collapsed === undefined) setCollapsed(next);
      local.onCollapsedChange?.(next);
    }
  };
  return (
    <Context.Provider
      value={{
        mobile,
        tablet,
        overlay,
        collapsed,
        drawerOpen,
        setDrawerOpen,
        toggle,
        sidebarId,
        mainId,
        main,
        setMain,
        sidebar,
        setSidebar,
        toggleElement,
        setToggleElement,
      }}
    >
      <Drawer.Root
        id={`${sidebarId}-drawer`}
        open={modalOpen()}
        onOpenChange={setDrawerOpen}
        animated={overlay()}
        initialFocus={() =>
          sidebar()?.querySelector<HTMLElement>('a[aria-current="page"]') ??
          sidebar()?.querySelector<HTMLElement>("a[href]") ??
          undefined
        }
        returnFocus={() => toggleElement() ?? main()}
      >
        <div
          {...native}
          class={classes(s.root, local.class, local.classList)}
          data-mobile={mobile()}
          data-tablet={tablet()}
          data-collapsed={collapsed()}
        >
          <a
            href={`#${mainId}`}
            class={s.skip}
            onClick={(event) => {
              event.preventDefault();
              main()?.focus();
            }}
          >
            Skip to content
          </a>
          {local.children}
        </div>
      </Drawer.Root>
    </Context.Provider>
  );
}
export function useShell() {
  const state = context();
  return {
    mobile: state.mobile,
    tablet: state.tablet,
    collapsed: state.collapsed,
    drawerOpen: state.drawerOpen,
    closeNavigation: () => state.setDrawerOpen(false),
    toggleNavigation: state.toggle,
  };
}
export function useSidebar() {
  const state = context();
  return {
    compact: () => !state.overlay() && state.collapsed(),
    closeNavigation: () => state.setDrawerOpen(false),
  };
}
export function Sidebar(props: JSX.HTMLAttributes<HTMLElement>) {
  const shell = context();
  if (shell.sidebar()) throw new Error("Shell.Root supports one Sidebar");
  const [local, native] = splitProps(props, ["children", "class", "classList"]);
  const [dock, setDock] = createSignal<HTMLDivElement>(),
    [drawerHost, setDrawerHost] = createSignal<HTMLDivElement>();
  const [content, setContent] = createSignal<HTMLDivElement>(),
    [overlayHost, setOverlayHost] = createSignal<HTMLElement>();
  const compact = () => !shell.overlay() && shell.collapsed();
  createEffect(() => {
    const target = shell.overlay() ? drawerHost() : dock(),
      node = content();
    if (!target || !node || node.parentElement === target) return;
    const active = node.ownerDocument.activeElement;
    const focused = active instanceof HTMLElement && node.contains(active) ? active : undefined;
    target.appendChild(node);
    setOverlayHost(target.closest("dialog") ?? target.ownerDocument.body);
    if (focused)
      queueMicrotask(() => {
        if (shell.overlay() && !shell.drawerOpen())
          shell.toggleElement()?.focus({ preventScroll: true });
        else if (focused.isConnected && !focused.closest("[hidden], [inert]"))
          focused.focus({ preventScroll: true });
        else shell.toggleElement()?.focus({ preventScroll: true });
      });
  });
  onCleanup(() => {
    const node = content(),
      home = dock();
    if (node && home && node.parentElement !== home) home.appendChild(node);
    shell.setSidebar(undefined);
    shell.setDrawerOpen(false);
  });
  return (
    <NavigationPresentationContext.Provider
      value={{ compact, close: () => shell.setDrawerOpen(false) }}
    >
      <OverlayHostContext.Provider value={overlayHost}>
        <aside
          {...native}
          id={shell.sidebarId}
          class={classes(`${colorThemes.soot} ${s.sidebar}`, local.class, local.classList)}
          data-overlay={shell.overlay()}
          hidden={shell.overlay()}
          data-collapsed={shell.collapsed()}
        >
          <div ref={setDock} class={s.dock}>
            <Column
              gap={0}
              class={s.sidebarFrame}
              data-compact={compact()}
              ref={(node) => {
                setContent(node);
                shell.setSidebar(node);
              }}
            >
              {local.children}
            </Column>
          </div>
        </aside>
        <Drawer.Content class={`${colorThemes.soot} ${s.drawer}`}>
          <Drawer.Title class={s.hidden}>Navigation</Drawer.Title>
          <div class={s.drawerHost} ref={setDrawerHost} />
        </Drawer.Content>
      </OverlayHostContext.Provider>
    </NavigationPresentationContext.Provider>
  );
}
export function SidebarHeader(props: JSX.HTMLAttributes<HTMLElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList", "children"]);
  return (
    <Row
      as="header"
      gap={2}
      wrap={false}
      {...native}
      class={classes(s.sidebarHeader, local.class, local.classList)}
    >
      <div class={s.headerContent}>{local.children}</div>
    </Row>
  );
}
export function SidebarContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Column gap={4} {...native} class={classes(s.sidebarContent, local.class, local.classList)} />
  );
}
/** One mounted utility control: beside the expanded header, below the collapsed rail. */
export function SidebarUtility(props: JSX.HTMLAttributes<HTMLDivElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <div
      {...native}
      data-shell-utility=""
      class={classes(s.sidebarUtility, local.class, local.classList)}
    />
  );
}
export function SidebarFooter(props: JSX.HTMLAttributes<HTMLElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Column
      as="footer"
      gap={2}
      {...native}
      class={classes(s.sidebarFooter, local.class, local.classList)}
    />
  );
}
export function SidebarSubtitle(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.sidebarSubtitle, local.class, local.classList)} />;
}
/** Noninteractive text that remains part of an accessible name when the rail hides it visually. */
export function SidebarLabel(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.sidebarLabel, local.class, local.classList)} />;
}
/** Keep optional controls mounted while excluding them from the collapsed rail and keyboard order. */
export function SidebarExpanded(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const shell = context(),
    sidebar = useSidebar();
  const [local, native] = splitProps(props, ["class", "classList", "ref"]);
  let element!: HTMLDivElement;
  createEffect(() => {
    if (sidebar.compact() && element.contains(element.ownerDocument.activeElement))
      shell.toggleElement()?.focus();
  });
  return (
    <div
      {...native}
      ref={(node) => {
        element = node;
        if (typeof local.ref === "function") local.ref(node);
      }}
      hidden={sidebar.compact()}
      inert={sidebar.compact()}
      class={classes(s.expanded, local.class, local.classList)}
    />
  );
}
export function NavigationToggle(
  props: Omit<IconButtonProps, "aria-label" | "aria-labelledby" | "children"> & {
    "aria-label"?: string;
    mode?: "any" | "phone" | "tablet" | "desktop";
  },
) {
  const shell = context();
  const [local, native] = splitProps(props, ["onClick", "ref", "aria-label", "mode"]);
  const visible = () =>
    local.mode === "phone"
      ? shell.mobile()
      : local.mode === "tablet"
        ? shell.tablet()
        : local.mode === "desktop"
          ? !shell.overlay()
          : true;
  return (
    <Show when={shell.sidebar() && visible()}>
      <IconButton
        {...native}
        ref={(element) => {
          shell.setToggleElement(element);
          if (typeof local.ref === "function") local.ref(element);
        }}
        aria-label={
          local["aria-label"] ??
          (shell.overlay()
            ? "Open navigation"
            : shell.collapsed()
              ? "Expand navigation"
              : "Collapse navigation")
        }
        aria-controls={shell.overlay() ? `${shell.sidebarId}-drawer` : shell.sidebarId}
        aria-expanded={shell.overlay() ? shell.drawerOpen() : !shell.collapsed()}
        aria-haspopup={shell.overlay() ? "dialog" : undefined}
        onClick={(event) => {
          callHandler(local.onClick, event);
          if (!event.defaultPrevented) shell.toggle();
        }}
      >
        <Show
          when={shell.overlay()}
          fallback={
            <Show when={shell.collapsed()} fallback={<IconSidebarLeftClose class={s.toggleIcon} />}>
              <IconSidebarLeftOpen class={s.toggleIcon} />
            </Show>
          }
        >
          <IconMenu />
        </Show>
      </IconButton>
    </Show>
  );
}
export type BodyProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Independent main scrolling by default; page keeps tall chrome and content in one flow. */
  scroll?: "regions" | "page";
};
export function Body(props: BodyProps) {
  context();
  const [local, native] = splitProps(props, ["scroll", "class", "classList"]);
  return (
    <div
      {...native}
      data-scroll={local.scroll ?? "regions"}
      class={classes(s.body, local.class, local.classList)}
    />
  );
}
export function Header(props: JSX.HTMLAttributes<HTMLElement> & { workspace?: boolean }) {
  context();
  const [local, native] = splitProps(props, ["workspace", "class", "classList"]);
  return (
    <Row
      as="header"
      gap={4}
      justify="between"
      {...native}
      data-workspace={local.workspace ?? false}
      class={classes(s.header, local.class, local.classList)}
    />
  );
}
export function Main(props: Omit<JSX.HTMLAttributes<HTMLElement>, "id"> & { workspace?: boolean }) {
  const shell = context();
  const [local, native] = splitProps(props, ["workspace", "class", "classList", "ref"]);
  return (
    <main
      {...native}
      id={shell.mainId}
      tabIndex={-1}
      data-workspace={local.workspace ?? false}
      ref={(element) => {
        shell.setMain(element);
        if (typeof local.ref === "function") local.ref(element);
      }}
      class={classes(s.main, local.class, local.classList)}
    />
  );
}
export type ContentProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Standard page content or a narrow form/message column, including its gutters. */
  width?: "fluid" | "standard" | "medium" | "narrow";
  /** Center short content vertically; overflow starts at the top and scrolls in Main. */
  centered?: boolean;
};
/** Optional content boundary inside Main, composed from the shared Container primitive. */
export function Content(props: ContentProps) {
  context();
  const [local, native] = splitProps(props, [
    "width",
    "centered",
    "children",
    "class",
    "classList",
  ]);
  return (
    <div
      {...native}
      class={classes(s.content, local.class, local.classList)}
      data-centered={local.centered ?? false}
      data-width={local.width ?? "fluid"}
    >
      <Container
        maxWidth={
          local.width === "narrow"
            ? "28.25rem"
            : local.width === "medium"
              ? "37rem"
              : local.width === "standard"
                ? "67.5rem"
                : "none"
        }
        gutter={local.width === undefined || local.width === "fluid" ? 0 : 4}
        align={local.width === undefined || local.width === "fluid" ? "start" : "center"}
        class={s.contentInner}
      >
        {local.children}
      </Container>
    </div>
  );
}
/** Persistent tablet rail; the full sidebar moves into a drawer at this width. */
export function Rail(props: JSX.HTMLAttributes<HTMLElement>) {
  const shell = context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <aside
      {...native}
      hidden={!shell.tablet()}
      class={classes(`${colorThemes.soot} ${s.rail}`, local.class, local.classList)}
    />
  );
}
export function RailContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.railContent, local.class, local.classList)} />;
}
export function RailFooter(props: JSX.HTMLAttributes<HTMLDivElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.railFooter, local.class, local.classList)} />;
}
export type InspectorProps = Omit<JSX.HTMLAttributes<HTMLElement>, "title"> & {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: () => HTMLElement | undefined;
};
/** Optional 400px session/detail column, using the same content in a smaller-screen sheet. */
export function Inspector(props: InspectorProps) {
  const shell = context();
  const [local, native] = splitProps(props, [
    "title",
    "open",
    "onOpenChange",
    "returnFocus",
    "children",
    "class",
    "classList",
  ]);
  const [narrow, setNarrow] = createSignal(false),
    [dock, setDock] = createSignal<HTMLDivElement>(),
    [drawerHost, setDrawerHost] = createSignal<HTMLDivElement>(),
    [content, setContent] = createSignal<HTMLDivElement>();
  onMount(() => {
    const media = window.matchMedia("(max-width: 79.999rem)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    onCleanup(() => media.removeEventListener("change", update));
  });
  createEffect(() => {
    const target = narrow() ? drawerHost() : dock(),
      node = content();
    if (target && node && node.parentElement !== target) target.appendChild(node);
  });
  onCleanup(() => {
    const node = content(),
      home = dock();
    if (node && home && node.parentElement !== home) home.appendChild(node);
  });
  return (
    <Drawer.Root
      open={narrow() && local.open}
      onOpenChange={local.onOpenChange}
      animated={false}
      initialFocus={() =>
        content()?.querySelector<HTMLElement>("button,a,input,select,textarea,[tabindex]") ??
        undefined
      }
      returnFocus={() => local.returnFocus?.() ?? shell.main()}
    >
      <aside
        {...native}
        aria-label={local.title}
        hidden={!local.open || narrow()}
        class={classes(s.inspector, local.class, local.classList)}
      >
        <div ref={setDock} class={s.inspectorDock}>
          <div ref={setContent} class={s.inspectorFrame}>
            {local.children}
          </div>
        </div>
      </aside>
      <Drawer.Content class={s.inspectorDrawer}>
        <Drawer.Title class={s.hidden}>{local.title}</Drawer.Title>
        <div ref={setDrawerHost} class={s.inspectorDrawerHost} />
      </Drawer.Content>
    </Drawer.Root>
  );
}
/** The top of Inspector content: a Heading, then the page's close action. It stays in view. */
export function InspectorHeader(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.inspectorHeader, local.class, local.classList)} />;
}
/** Groups the Title and an optional Meta line. */
export function InspectorHeading(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.inspectorHeading, local.class, local.classList)} />;
}
export function InspectorTitle(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <h2 {...native} class={classes(s.inspectorTitle, local.class, local.classList)} />;
}
/** Compact context under the title, cut off on one line. */
export function InspectorMeta(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.inspectorMeta, local.class, local.classList)} />;
}
/** The scrolling content below the header, at the inspector's gutters. */
export function InspectorBody(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <div {...native} class={classes(s.inspectorBody, local.class, local.classList)} />;
}
export function Footer(props: JSX.HTMLAttributes<HTMLElement>) {
  context();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <Row as="footer" gap={3} {...native} class={classes(s.footer, local.class, local.classList)} />
  );
}
