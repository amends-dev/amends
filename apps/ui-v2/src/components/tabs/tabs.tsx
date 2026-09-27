import { Show, splitProps, type JSX } from "solid-js";
import { Count } from "../count/index.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./tabs.css.ts";

export type ListProps = JSX.HTMLAttributes<HTMLElement> & {
  /** Names the set of tabs, such as "Group". */
  "aria-label": string;
};

/** A row of tabs that switch the view below them. Tabs hug their labels, 24px apart. */
export function List(props: ListProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <nav {...native} class={classes(s.list, local.class)} />;
}

type Common = {
  /** The tab showing now. */
  current?: boolean;
  /** An item count shown after the label. */
  count?: number;
  children: JSX.Element;
};

export type TabProps = Common &
  (
    | (Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { href: string })
    | (Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined })
  );

/** A tab that navigates with `href`, or acts through `onClick`. */
export function Tab(props: TabProps) {
  const [local, native] = splitProps(props, ["current", "count", "children", "class"]);
  const content = () => (
    <>
      {local.children}
      <Show when={local.count !== undefined}>
        <Count value={local.count ?? 0} variant="plain" class={s.count} />
      </Show>
    </>
  );
  const current = () => (local.current ? ("page" as const) : undefined);
  return (
    <Show
      when={native.href !== undefined}
      fallback={
        <button
          {...(native as JSX.ButtonHTMLAttributes<HTMLButtonElement>)}
          type="button"
          aria-current={current()}
          class={classes(s.tab, local.class)}
        >
          {content()}
        </button>
      }
    >
      <a
        {...(native as JSX.AnchorHTMLAttributes<HTMLAnchorElement>)}
        aria-current={current()}
        class={classes(s.tab, local.class)}
      >
        {content()}
      </a>
    </Show>
  );
}
