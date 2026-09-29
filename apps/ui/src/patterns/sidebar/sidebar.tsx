import { Show, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { IconChevronDown, IconMarkSearch } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Count } from "../../components/count/index.ts";
import { TurnActivity, turnStateLabels } from "../../components/turn-status/index.ts";
import { TaskStatus, type TaskState } from "../../components/task-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./sidebar.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** Names the navigation, such as "Workspace". */
  "aria-label": string;
};

/** The destination's items beside the rail. Place it after Rail.Root in Shell.Navigation. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <nav {...native} data-shell-part="sidebar" class={classes(s.sidebar, local.class)} />;
}

export type HeaderProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The workspace switcher and search, above a divider aligned with the pane headers. */
export function Header(props: HeaderProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.header, local.class)} />;
}

export type WorkspaceProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  name: string;
  initials?: string;
};

/** The current workspace; opens the workspace switcher. */
export function Workspace(props: WorkspaceProps) {
  const [local, native] = splitProps(props, ["name", "initials", "class"]);
  return (
    <button
      {...native}
      type="button"
      aria-haspopup="menu"
      class={classes(s.workspace, local.class)}
    >
      <Avatar
        name={local.name}
        initials={local.initials ?? local.name.charAt(0).toUpperCase()}
        variant="workspace"
        size={28}
        decorative
      />
      <span class={s.workspaceName}>{local.name}</span>
      <IconChevronDown class={s.chevron} />
    </button>
  );
}

export type SearchProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** The prompt, such as "Find anything…". */
  children: string;
  /** The keyboard shortcut, shown on desktop, such as "⌘ K". */
  shortcut?: string;
};

/** Opens search. */
export function Search(props: SearchProps) {
  const [local, native] = splitProps(props, ["children", "shortcut", "class"]);
  return (
    <button {...native} type="button" class={classes(s.search, local.class)}>
      <IconMarkSearch class={s.searchIcon} />
      <span class={s.searchLabel}>{local.children}</span>
      <Show when={local.shortcut}>
        <kbd class={s.shortcut}>{local.shortcut}</kbd>
      </Show>
    </button>
  );
}

export type BodyProps = JSX.HTMLAttributes<HTMLDivElement>;

/** The scrolling list of items and sections. */
export function Body(props: BodyProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.body, local.class)} />;
}

export type ListProps = JSX.HTMLAttributes<HTMLUListElement>;

/** Items, 4px apart. */
export function List(props: ListProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <ul {...native} class={classes(s.list, local.class)} />;
}

export interface ItemPerson {
  readonly name: string;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
}

export type ItemProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
  /** The label. */
  children: string;
  /** An icon before the label. */
  icon?: IconComponent;
  /** A person's avatar before the label, for direct messages. */
  person?: ItemPerson;
  /** A badge after the label, such as unread items. */
  count?: number;
  /** Names the count for assistive technology, such as "5 unread". */
  countLabel?: string;
  /** A dot for activity the reader has not seen, when there is no count. */
  unread?: boolean;
  current?: boolean;
  /** Agents at work there: the most pressing turn state, as a quiet mark before any count. */
  activity?: "queued" | "working" | "stopping";
};

/** A destination in a List. */
export function Item(props: ItemProps) {
  const [local, native] = splitProps(props, [
    "children",
    "icon",
    "person",
    "count",
    "countLabel",
    "unread",
    "current",
    "activity",
    "class",
  ]);
  return (
    <li>
      <a
        {...native}
        aria-current={local.current ? "page" : undefined}
        class={classes(s.item, local.class)}
        data-unread={local.unread ? "" : undefined}
      >
        <Show when={local.icon}>{(icon) => <Dynamic component={icon()} class={s.itemIcon} />}</Show>
        <Show when={local.person}>
          {(person) => (
            <Avatar
              name={person().name}
              initials={person().initials}
              tone={person().tone}
              size={24}
              class={s.itemAvatar}
              decorative
            />
          )}
        </Show>
        <span class={s.itemLabel}>{local.children}</span>
        <Show when={local.activity}>
          {(activity) => (
            <TurnActivity state={activity()} class={s.itemActivity}>
              {turnStateLabels[activity()]}
            </TurnActivity>
          )}
        </Show>
        <Show
          when={local.count}
          fallback={
            <Show when={local.unread}>
              <span class={s.unread} role="img" aria-label="new activity" />
            </Show>
          }
        >
          {(count) => <Count value={count()} aria-label={local.countLabel} />}
        </Show>
      </a>
    </li>
  );
}

export type SubItemProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
  children: string;
  /** An icon before the label. */
  icon?: IconComponent;
  /** For a task, its state, shown instead of an icon. */
  state?: TaskState;
  current?: boolean;
};

/** A thread or task shown under the Item before it, joined by a stitch. */
export function SubItem(props: SubItemProps) {
  const [local, native] = splitProps(props, ["children", "icon", "state", "current", "class"]);
  return (
    <li>
      <a
        {...native}
        aria-current={local.current ? "page" : undefined}
        class={classes(s.subItem, local.class)}
      >
        <svg
          class={s.connector}
          viewBox="0 0 18 41"
          preserveAspectRatio="xMinYMax slice"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 0 V36 Q1 40 5 40 H18"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-dasharray="7 6"
            stroke-linecap="round"
          />
        </svg>
        <Show when={local.state}>{(state) => <TaskStatus state={state()} />}</Show>
        <Show when={!local.state && local.icon}>
          {(icon) => <Dynamic component={icon()} class={s.subItemIcon} />}
        </Show>
        <span class={s.itemLabel}>{local.children}</span>
      </a>
    </li>
  );
}

export type SectionProps = JSX.HTMLAttributes<HTMLDivElement>;

/** A titled group of items, such as Groups or Direct messages. */
export function Section(props: SectionProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <div {...native} class={classes(s.section, local.class)} />;
}

export type EmptyProps = JSX.HTMLAttributes<HTMLParagraphElement>;

/** A quiet line where a section has no items yet, such as "No groups yet". */
export function Empty(props: EmptyProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <p {...native} class={classes(s.empty, local.class)} />;
}

export type SectionHeaderProps = Omit<JSX.HTMLAttributes<HTMLDivElement>, "title"> & {
  /** Shown in capitals. */
  title: string;
  /** Makes the title a link, such as to the full list of groups. */
  href?: string;
  /** The title's page is showing. */
  current?: boolean;
  /** Section actions, such as IconButtons with size="compact". */
  children?: JSX.Element;
};

/** The section's title and its actions. */
export function SectionHeader(props: SectionHeaderProps) {
  const [local, native] = splitProps(props, ["title", "href", "current", "children", "class"]);
  return (
    <div
      {...native}
      class={classes(s.sectionHeader, local.class)}
      data-current={local.current ? "" : undefined}
    >
      <Show when={local.href} fallback={<span class={s.sectionTitle}>{local.title}</span>}>
        {(href) => (
          <a href={href()} class={s.sectionTitle} aria-current={local.current ? "page" : undefined}>
            {local.title}
          </a>
        )}
      </Show>
      <Show when={local.children}>
        <div class={s.sectionActions}>{local.children}</div>
      </Show>
    </div>
  );
}
