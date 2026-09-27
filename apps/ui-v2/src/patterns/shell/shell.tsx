import {
  Show,
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  on,
  onCleanup,
  onMount,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { IconMarkClose, IconMenu } from "@amends/icons";
import { IconButton } from "../../components/icon-button/index.ts";
import { media } from "../../foundations/layout/tokens.ts";
import { createMediaQuery } from "../../internal/media.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./shell.css.ts";

interface State {
  readonly navigationId: string;
  readonly mainId: string;
  /** Below desktop, where navigation lives in a drawer. */
  readonly touch: Accessor<boolean>;
  /** Below the split width, where the side panel floats. */
  readonly overlay: Accessor<boolean>;
  readonly navigationOpen: Accessor<boolean>;
  readonly setNavigationOpen: (open: boolean) => void;
  readonly asideOpen: Accessor<boolean>;
  readonly setAsideOpen: (open: boolean) => void;
  readonly toggle: Accessor<HTMLButtonElement | undefined>;
  readonly setToggle: (button: HTMLButtonElement) => void;
}

const Context = createContext<State>();
function useState(part: string): State {
  const state = useContext(Context);
  if (!state) throw new Error(`Shell.${part} must be inside Shell.Root`);
  return state;
}

export type RootProps = JSX.HTMLAttributes<HTMLDivElement>;

/**
 * The app frame: navigation, main content, and an optional side panel. Below 64rem navigation
 * moves into a drawer; below 80rem the side panel floats over the content; below 48rem each
 * fills the screen.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class", "children"]);
  const id = createUniqueId();
  const touch = createMediaQuery(media.touch);
  const overlay = createMediaQuery(media.overlay);
  const [navigationOpen, setNavigationOpen] = createSignal(false);
  const [asideOpen, setAsideOpen] = createSignal(false);
  const [toggle, setToggle] = createSignal<HTMLButtonElement>();
  // Crossing into desktop leaves no drawer to close.
  createEffect(on(touch, (isTouch) => !isTouch && setNavigationOpen(false), { defer: true }));
  const state: State = {
    navigationId: `shell-${id}-navigation`,
    mainId: `shell-${id}-main`,
    touch,
    overlay,
    navigationOpen,
    setNavigationOpen,
    asideOpen,
    setAsideOpen,
    toggle,
    setToggle,
  };
  return (
    <Context.Provider value={state}>
      <div {...native} class={classes(s.root, local.class)}>
        <a
          href={`#${state.mainId}`}
          class={s.skip}
          onClick={(event) => {
            event.preventDefault();
            document.getElementById(state.mainId)?.focus();
          }}
        >
          Skip to content
        </a>
        {local.children}
      </div>
    </Context.Provider>
  );
}

/** Opens and closes the navigation drawer, and reports the layout for app-level decisions. */
export function useShell() {
  const state = useState("useShell");
  return {
    touch: state.touch,
    overlay: state.overlay,
    navigationOpen: state.navigationOpen,
    openNavigation: () => state.setNavigationOpen(true),
    closeNavigation: () => state.setNavigationOpen(false),
  };
}

export type NavigationProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Names the drawer for assistive technology. Default "Navigation". */
  "aria-label"?: string;
};

/**
 * Holds the Rail and the Sidebar. On desktop both stay in place. Below desktop the sidebar opens
 * as a drawer beside the rail, and on phones rail and sidebar open together.
 */
export function Navigation(props: NavigationProps) {
  const state = useState("Navigation");
  const [local, native] = splitProps(props, ["class", "children", "aria-label"]);
  const [element, setElement] = createSignal<HTMLDivElement>();
  const modal = () => state.touch() && state.navigationOpen();
  const close = () => {
    state.setNavigationOpen(false);
    state.toggle()?.focus();
  };
  createEffect(
    on(modal, (open) => {
      const root = element();
      if (!open || !root) return;
      const target =
        root.querySelector<HTMLElement>('[data-shell-part="sidebar"] [aria-current="page"]') ??
        root.querySelector<HTMLElement>('[data-shell-part="sidebar"] a[href], a[href], button');
      queueMicrotask(() => target?.focus());
    }),
  );
  return (
    <>
      <Show when={modal()}>
        <div class={s.navigationScrim} aria-hidden="true" onClick={close} />
      </Show>
      <div
        {...native}
        ref={setElement}
        id={state.navigationId}
        class={classes(s.navigation, local.class)}
        data-open={state.navigationOpen() ? "" : undefined}
        role={modal() ? "dialog" : undefined}
        aria-modal={modal() ? true : undefined}
        aria-label={local["aria-label"] ?? "Navigation"}
        inert={state.asideOpen() && state.overlay() ? true : undefined}
        onKeyDown={(event) => {
          if (modal() && event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }}
        onClick={(event) => {
          // Following a link in the drawer closes it.
          if (modal() && (event.target as Element).closest("a[href]"))
            state.setNavigationOpen(false);
        }}
      >
        {local.children}
        <Show when={modal()}>
          <IconButton
            icon={IconMarkClose}
            label="Close navigation"
            class={s.navigationClose}
            onClick={close}
          />
        </Show>
      </div>
    </>
  );
}

export type NavigationToggleProps = {
  /** Default "Open navigation". */
  label?: string;
};

/** The menu button that opens the navigation drawer; place it first in a Pane header. Hidden on desktop. */
export function NavigationToggle(props: NavigationToggleProps) {
  const state = useState("NavigationToggle");
  return (
    <IconButton
      ref={state.setToggle}
      icon={IconMenu}
      label={props.label ?? "Open navigation"}
      class={s.toggle}
      aria-expanded={state.navigationOpen()}
      aria-controls={state.navigationId}
      onClick={() => state.setNavigationOpen(!state.navigationOpen())}
    />
  );
}

export type MainProps = JSX.HTMLAttributes<HTMLElement>;

/** The main content region; holds one Pane. */
export function Main(props: MainProps) {
  const state = useState("Main");
  const [local, native] = splitProps(props, ["class"]);
  return (
    <main
      {...native}
      id={state.mainId}
      tabIndex={-1}
      class={classes(s.main, local.class)}
      inert={
        (state.touch() && state.navigationOpen()) || (state.asideOpen() && state.overlay())
          ? true
          : undefined
      }
    />
  );
}

export type AsideProps = JSX.HTMLAttributes<HTMLElement> & {
  /** Names the panel, such as the open thread's title. */
  "aria-label": string;
  /** Called on Escape or a click outside while the panel floats. */
  onClose: () => void;
};

/**
 * The side panel; holds one Pane. Render it while it is open. It sits beside the main content
 * from 80rem, floats over it with a scrim below that, and fills the screen on phones, where the
 * main content keeps its state underneath.
 */
export function Aside(props: AsideProps) {
  const state = useState("Aside");
  const [local, native] = splitProps(props, ["class", "onClose", "aria-label"]);
  const [element, setElement] = createSignal<HTMLElement>();
  const modal = () => state.overlay();
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.setAsideOpen(true);
  onMount(() => {
    if (modal()) element()?.focus();
  });
  onCleanup(() => {
    const restore = modal();
    state.setAsideOpen(false);
    // The content behind stays inert until this update settles.
    if (restore) queueMicrotask(() => previous?.isConnected && previous.focus());
  });
  return (
    <>
      <div class={s.asideScrim} aria-hidden="true" onClick={() => local.onClose()} />
      <aside
        {...native}
        ref={setElement}
        tabIndex={-1}
        class={classes(s.aside, local.class)}
        role={modal() ? "dialog" : "complementary"}
        aria-modal={modal() ? true : undefined}
        aria-label={local["aria-label"]}
        inert={state.touch() && state.navigationOpen() ? true : undefined}
        onKeyDown={(event) => {
          if (modal() && event.key === "Escape") {
            event.stopPropagation();
            local.onClose();
          }
        }}
      />
    </>
  );
}
