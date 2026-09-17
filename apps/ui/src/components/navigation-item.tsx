import { Show, mergeProps, type JSX } from "solid-js";
import { Identity, type IdentityData } from "./identity.tsx";
import { withTooltip } from "./overlay-trigger.ts";
import * as s from "./navigation-item.css.ts";

export type NavigationLinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  "data-compact": boolean;
};

export interface NavigationItemProps {
  href: string;
  label: string;
  icon?: JSX.Element;
  identityKind?: IdentityData["kind"];
  active?: boolean;
  compact?: boolean;
  count?: number;
  onClick?: JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>;
  /** Render a router link by forwarding these props to its anchor. Defaults to a native link. */
  renderLink?: (props: NavigationLinkProps) => JSX.Element;
}

/** One navigation destination, with the same identity in an expanded sidebar or compact rail. */
export function NavigationItem(props: NavigationItemProps) {
  const anchor: NavigationLinkProps = {
    get href() {
      return props.href;
    },
    class: s.item,
    get "aria-label"() {
      return props.count === undefined ? props.label : `${props.label} (${props.count})`;
    },
    get "aria-current"() {
      return props.active ? "page" : undefined;
    },
    get "data-compact"() {
      return props.compact ?? false;
    },
    get title() {
      return props.compact && !props.identityKind ? props.label : undefined;
    },
    get onClick() {
      return props.onClick;
    },
    get children() {
      return (
        <>
          <span class={s.icon} aria-hidden="true">
            {props.icon}
          </span>
          <Show when={!props.compact}>
            <span class={s.label}>{props.label}</span>
          </Show>
          <Show when={!props.compact}>
            <Show when={props.count !== undefined}>
              <span class={s.count} aria-hidden="true">
                {props.count}
              </span>
            </Show>
          </Show>
        </>
      );
    },
  };
  const link = (attributes: NavigationLinkProps) =>
    props.renderLink ? props.renderLink(attributes) : <a {...attributes} />;
  return (
    <Show when={props.identityKind} fallback={link(anchor)}>
      {(kind) => (
        <Identity
          name={props.label}
          kind={kind()}
          size="compact"
          compact={props.compact ?? false}
          trigger={(trigger) =>
            link(
              mergeProps(anchor, withTooltip<HTMLAnchorElement>(anchor, trigger), {
                get children() {
                  return (
                    <>
                      {trigger.children}
                      <Show when={!props.compact && props.count !== undefined}>
                        <span class={s.count} aria-hidden="true">
                          {props.count}
                        </span>
                      </Show>
                    </>
                  );
                },
              }),
            )
          }
        />
      )}
    </Show>
  );
}
