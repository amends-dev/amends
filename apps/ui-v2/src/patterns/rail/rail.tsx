import { Show, splitProps, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Avatar } from "../../components/avatar/index.ts";
import { Logo } from "../../components/logo/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes, type IconComponent } from "../../internal/props.ts";
import * as s from "./rail.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & {
  /** Default "Main". */
  "aria-label"?: string;
};

/** The leftmost column of global destinations. Place it first in Shell.Navigation. */
export function Root(props: RootProps) {
  const [local, native] = splitProps(props, ["class", "aria-label"]);
  return (
    <nav
      {...native}
      aria-label={local["aria-label"] ?? "Main"}
      data-shell-part="rail"
      class={classes(s.rail, local.class)}
    />
  );
}

export type BrandProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & {
  href: string;
  /** The accessible name of the link. Default "Amends home". */
  label?: string;
};

/** The Amends mark, linking home, above a short seam. */
export function Brand(props: BrandProps) {
  const [local, native] = splitProps(props, ["label", "class"]);
  return (
    <>
      <a
        {...native}
        aria-label={local.label ?? "Amends home"}
        class={classes(s.brand, local.class)}
      >
        <Logo />
      </a>
      <span class={s.seam} aria-hidden="true" />
    </>
  );
}

export type ListProps = JSX.HTMLAttributes<HTMLUListElement>;

/** The destinations; each child is an Item. */
export function List(props: ListProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <ul {...native} class={classes(s.list, local.class)} />;
}

type ItemCommon = {
  icon: IconComponent;
  /** The destination's name, shown as a tooltip and read by assistive technology. */
  label: string;
  current?: boolean;
};

export type ItemProps = ItemCommon &
  (
    | (Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { href: string })
    | (Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined })
  );

/** A destination in List or Footer: a link with `href`, or a button with `onClick`. */
export function Item(props: ItemProps) {
  const [local, native] = splitProps(props, ["icon", "label", "current", "class"]);
  const icon = () => <Dynamic component={local.icon} class={s.icon} />;
  return (
    <li class={s.entry}>
      <Show
        when={native.href !== undefined}
        fallback={
          <button
            {...(native as JSX.ButtonHTMLAttributes<HTMLButtonElement>)}
            type="button"
            aria-label={local.label}
            title={local.label}
            aria-current={local.current ? "true" : undefined}
            class={classes(s.item, local.class)}
          >
            {icon()}
          </button>
        }
      >
        <a
          {...(native as JSX.AnchorHTMLAttributes<HTMLAnchorElement>)}
          aria-label={local.label}
          title={local.label}
          aria-current={local.current ? "page" : undefined}
          class={classes(s.item, local.class)}
        >
          {icon()}
        </a>
      </Show>
    </li>
  );
}

export type FooterProps = JSX.HTMLAttributes<HTMLUListElement>;

/** Settings and the account, pinned to the bottom of the rail. */
export function Footer(props: FooterProps) {
  const [local, native] = splitProps(props, ["class"]);
  return <ul {...native} class={classes(s.list, s.footer, local.class)} />;
}

export type AccountProps = Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** The signed-in person's name. */
  name: string;
  initials?: string;
  tone?: AvatarToneName;
};

/** The signed-in person's avatar, opening account actions. */
export function Account(props: AccountProps) {
  const [local, native] = splitProps(props, ["name", "initials", "tone", "class"]);
  return (
    <li class={s.entry}>
      <button
        {...native}
        type="button"
        aria-label={`Account: ${local.name}`}
        title={local.name}
        class={classes(s.account, local.class)}
      >
        <Avatar
          name={local.name}
          initials={local.initials}
          tone={local.tone}
          size={30}
          decorative
        />
      </button>
    </li>
  );
}
