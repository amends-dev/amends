import { Show, createContext, splitProps, useContext, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconMarkBack, IconMarkClose } from "@amends/icons";
import { IconButton, type IconButtonProps } from "../../components/icon-button/index.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./pane.css.ts";

const Variant = createContext<"main" | "side" | "modal">("main");

export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /**
   * Main content; a side panel, with a smaller title and a Back bar on phones; or a modal, with a
   * larger title and its context beside it. Default main.
   */
  variant?: "main" | "side" | "modal";
};

/**
 * One column of content: a Header, a scrolling Body, and a Footer such as a composer. Header and
 * Footer stay in place while the Body scrolls. Main content, the side panel, and modals share it.
 */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["variant", "class"]);
  return (
    <Variant.Provider value={local.variant ?? "main"}>
      <div
        {...native}
        data-variant={local.variant ?? "main"}
        class={classes(s.pane, local.class)}
      />
    </Variant.Provider>
  );
}

export type HeaderProps = JSX.HTMLAttributes<HTMLElement>;

/** Holds Title, Actions, Tabs or Subtitle, and a leading control such as Shell.NavigationToggle. */
export function Header(props: HeaderProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <header {...native} class={classes(s.header, local.class)} />;
}

export type TitleProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> & {
  children: string;
  /** Shown before the title on desktop. */
  icon?: IconComponent;
  /** A second line on phones, such as the workspace name. */
  context?: string;
  /** Default h1 for main content and h2 for a side pane. */
  level?: 1 | 2;
};

export function Title(props: TitleProps) {
  const [local, native] = splitProps(props, ["children", "icon", "context", "level", "class"]);
  const variant = useContext(Variant);
  const level = () => local.level ?? (variant === "side" ? 2 : 1);
  return (
    <div {...native} class={classes(s.title, local.class)}>
      <Show when={local.icon}>{(icon) => <Dynamic component={icon()} class={s.titleIcon} />}</Show>
      <div class={s.titleText}>
        <Dynamic component={`h${level()}`} class={s.heading}>
          {local.children}
        </Dynamic>
        <Show when={local.context}>
          <span class={s.context}>{local.context}</span>
        </Show>
      </div>
    </div>
  );
}

export type ActionsProps = JSX.HTMLAttributes<HTMLDivElement>;

/** Controls at the end of the title bar, such as IconButtons and an AvatarStack. */
export function Actions(props: ActionsProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.actions, local.class)} />;
}

export type CloseProps = Omit<IconButtonProps, "icon" | "label"> & {
  /** Default "Close". */
  label?: string;
};

/** Closes a side pane. Phones use Back instead, so it is hidden there. */
export function Close(props: CloseProps) {
  const [local, native] = splitProps(props, ["label", "class"]);
  return (
    <IconButton
      {...native}
      icon={IconMarkClose}
      label={local.label ?? "Close"}
      class={classes(s.close, local.class)}
    />
  );
}

export type BackProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Where Back leads, such as the group's name; shown beside the arrow. */
  children?: string;
  /** Show on every layout, as in a modal's subview. Default phones only. */
  always?: boolean;
};

/** Returns from a full-screen side pane on phones, or from a subview when `always` is set. */
export function Back(props: BackProps) {
  const [local, native] = splitProps(props, ["children", "always", "class"]);
  return (
    <button
      aria-label={local.children ? `Back to ${local.children}` : "Back"}
      {...native}
      type="button"
      class={classes(s.back, local.always && s.backAlways, local.class)}
    >
      <span class={s.backIcon} aria-hidden="true">
        <IconMarkBack size={20} />
      </span>
      {local.children}
    </button>
  );
}

export type TabsProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The row under the title bar for a Tabs.List. */
export function Tabs(props: TabsProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.tabs, local.class)} />;
}

export type SubtitleProps = JSX.HTMLAttributes<HTMLParagraphElement>;

/** A line under the title bar, such as "Thread in #general". */
export function Subtitle(props: SubtitleProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <p {...native} class={classes(s.subtitle, local.class)} />;
}

export type ToolbarProps = JSX.HTMLAttributes<HTMLDivElement>;

/** Search, filters, and actions above a list; they stay while the list scrolls. */
export function Toolbar(props: ToolbarProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.toolbar, local.class)} />;
}

/** The trailing group in a Toolbar, such as sorting and New task. */
export function ToolbarEnd(props: ToolbarProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.toolbarEnd, local.class)} />;
}

export type BodyProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** "list" starts flush under a toolbar's column headings. Default "default". */
  inset?: "default" | "list";
};

/** The scrolling content. */
export function Body(props: BodyProps) {
  const [local, native] = splitProps(props, ["class", "inset"]);
  return (
    <div
      {...native}
      data-inset={local.inset === "list" ? "list" : undefined}
      class={classes(s.body, local.class)}
    />
  );
}

export type FooterProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The bar under the content, such as the composer. It stays above the phone's home indicator. */
export function Footer(props: FooterProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.footer, local.class)} />;
}
