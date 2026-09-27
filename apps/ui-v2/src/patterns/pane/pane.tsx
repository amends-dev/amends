import { Show, createContext, splitProps, useContext, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconMarkBack, IconMarkClose } from "@amends/icons";
import { IconButton, type IconButtonProps } from "../../components/icon-button/index.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./pane.css.ts";

const Variant = createContext<"main" | "side">("main");

export type RootProps = JSX.HTMLAttributes<HTMLDivElement> & {
  /** Main content, or a side panel with a smaller title and a Back bar on phones. Default main. */
  variant?: "main" | "side";
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
  /** Where Back leads, such as the group's name. */
  children: string;
};

/** Returns from a full-screen side pane on phones; hidden on wider layouts. */
export function Back(props: BackProps) {
  const [local, native] = splitProps(props, ["children", "class"]);
  return (
    <button
      {...native}
      type="button"
      aria-label={`Back to ${local.children}`}
      class={classes(s.back, local.class)}
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

export type BodyProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The scrolling content. */
export function Body(props: BodyProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.body, local.class)} />;
}

export type FooterProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The bar under the content, such as the composer. It stays above the phone's home indicator. */
export function Footer(props: FooterProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.footer, local.class)} />;
}
