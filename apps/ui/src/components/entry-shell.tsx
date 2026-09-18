import { Show, type JSX } from "solid-js";
import { Button } from "./button.tsx";
import { Text } from "./text.tsx";
import { WorkspaceMark } from "./workspace-mark.tsx";
import * as s from "./entry-shell.css.ts";

export type EntryLinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export interface EntryShellProps {
  /** Where the mark leads. Render a router link by forwarding these props to its anchor. */
  home: { href: string; renderLink?: (props: EntryLinkProps) => JSX.Element };
  /** The signed-in address and how to end the session; absent before sign-in. */
  account?: { name: string; onSignOut: () => void } | undefined;
  /** Screen title and its one-line explanation. */
  title: string;
  blurb?: string | undefined;
  /** Reading column: 420px for forms, 560px for lists. */
  width?: "narrow" | "wide";
  /** Vertical placement: centered for short forms, from the top for lists. */
  align?: "center" | "start";
  /** Footer text at the end, such as policy links. */
  links?: JSX.Element;
  children: JSX.Element;
}

/**
 * Chrome for everything before a workspace exists: sign-in, the workspace
 * picker, and membership explanations. It has no rail because there is no
 * workspace behind it yet. Sessions and routing stay with the application.
 */
export function EntryShell(props: EntryShellProps) {
  const link: EntryLinkProps = {
    get href() {
      return props.home.href;
    },
    class: s.home,
    "aria-label": "amends",
    get children() {
      return (
        <>
          <WorkspaceMark name="amends" />
          <Text as="span" variant="subheading">
            amends
          </Text>
        </>
      );
    },
  };
  return (
    <div class={s.shell}>
      <header class={s.chrome}>
        <Show when={props.home.renderLink} fallback={<a {...link} />}>
          {(render) => render()(link)}
        </Show>
        <Show when={props.account}>
          {(account) => (
            <span class={s.account}>
              <Text as="span" variant="caption" tone="muted" class={s.accountName}>
                {account().name}
              </Text>
              <Button variant="secondary" size="compact" onClick={() => account().onSignOut()}>
                sign out
              </Button>
            </span>
          )}
        </Show>
      </header>
      <main class={s.body} data-align={props.align ?? "center"}>
        <div class={s.column} data-width={props.width ?? "narrow"}>
          <div class={s.intro}>
            <Text as="h1" variant="pageTitle">
              {props.title}
            </Text>
            <Show when={props.blurb}>
              <Text tone="secondary">{props.blurb}</Text>
            </Show>
          </div>
          {props.children}
        </div>
      </main>
      <footer class={s.foot}>
        <Text as="span" variant="caption" tone="muted" class={s.note}>
          <Show when={props.account} fallback="amends keeps one identity per address">
            {(account) => `signed in as ${account().name}`}
          </Show>
        </Text>
        {props.links}
      </footer>
    </div>
  );
}
