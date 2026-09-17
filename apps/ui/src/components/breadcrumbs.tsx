import { createSignal, For, onCleanup, onMount, Show, type JSX } from "solid-js";
import { breakpoint } from "../tokens/index.ts";
import { Popover } from "./popover.tsx";
import { IconButton } from "./button.tsx";
import * as s from "./breadcrumbs.css.ts";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
export type BreadcrumbLinkProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[];
  renderLink?: (props: BreadcrumbLinkProps) => JSX.Element;
}
/** The final item names the current page. On small screens, intermediate ancestors remain available in a popover. */
export function Breadcrumbs(props: BreadcrumbsProps) {
  const [compact, setCompact] = createSignal(false);
  const [open, setOpen] = createSignal(false);
  onMount(() => {
    const media = window.matchMedia(`(max-width: ${breakpoint.navigation - 1}px)`);
    const change = () => {
      setCompact(media.matches);
      setOpen(false);
    };
    change();
    media.addEventListener("change", change);
    onCleanup(() => media.removeEventListener("change", change));
  });
  const link = (item: BreadcrumbItem, className: string) => {
    const attributes: BreadcrumbLinkProps = {
      href: item.href!,
      class: className,
      children: item.label,
      onClick: () => setOpen(false),
    };
    return props.renderLink ? props.renderLink(attributes) : <a {...attributes} />;
  };
  const collapsed = () => compact() && props.items.length > 2;
  return (
    <nav aria-label="Breadcrumbs" class={s.root}>
      <ol class={s.list}>
        <For each={props.items}>
          {(item, index) => (
            <>
              <Show when={!collapsed() || index() === 0 || index() === props.items.length - 1}>
                <li class={s.item}>
                  <Show when={index() > 0}>
                    <span aria-hidden="true" class={s.separator}>
                      /
                    </span>
                  </Show>
                  <Show
                    when={index() < props.items.length - 1 && item.href}
                    fallback={
                      <span
                        class={s.current}
                        aria-current={index() === props.items.length - 1 ? "page" : undefined}
                      >
                        {item.label}
                      </span>
                    }
                  >
                    {link(item, s.link)}
                  </Show>
                </li>
              </Show>
              <Show when={collapsed() && index() === 0}>
                <li class={s.item}>
                  <span aria-hidden="true" class={s.separator}>
                    /
                  </span>
                  <Popover
                    open={open()}
                    onOpenChange={setOpen}
                    label="Parent pages"
                    placement="bottom-start"
                    trigger={(trigger) => (
                      <IconButton
                        {...trigger}
                        label="Show parent pages"
                        variant="ghost"
                        size="touch"
                      >
                        …
                      </IconButton>
                    )}
                  >
                    <ul class={s.parents}>
                      <For each={props.items.slice(1, -1)}>
                        {(parent) => (
                          <li>
                            <Show
                              when={parent.href}
                              fallback={<span class={s.parent}>{parent.label}</span>}
                            >
                              {link(parent, s.parent)}
                            </Show>
                          </li>
                        )}
                      </For>
                    </ul>
                  </Popover>
                </li>
              </Show>
            </>
          )}
        </For>
      </ol>
    </nav>
  );
}
