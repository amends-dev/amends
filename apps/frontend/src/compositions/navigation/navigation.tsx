import {
  createContext,
  createSignal,
  createUniqueId,
  onCleanup,
  splitProps,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { Tooltip } from "../../primitives/tooltip/index.ts";
import { callHandler, classes } from "../../primitives/internal/props.ts";
import { NavigationPresentationContext } from "./presentation.ts";
import * as s from "./navigation.css.ts";

export type RootProps = JSX.HTMLAttributes<HTMLElement> & { compact?: boolean };
export function Root(props: RootProps) {
  const inherited = useContext(NavigationPresentationContext);
  const [local, native] = splitProps(props, ["compact", "class", "classList", "children"]);
  const compact = () => local.compact ?? inherited.compact();
  return (
    <NavigationPresentationContext.Provider value={{ compact, close: inherited.close }}>
      <nav
        {...native}
        class={classes(s.root, local.class, local.classList)}
        data-compact={compact()}
      >
        {local.children}
      </nav>
    </NavigationPresentationContext.Provider>
  );
}
const SectionContext = createContext<{ id: string; register: () => void }>();
export function Section(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const [local, native] = splitProps(props, ["class", "classList", "children"]);
  const id = createUniqueId(),
    [labelled, setLabelled] = createSignal(false);
  return (
    <SectionContext.Provider
      value={{
        id,
        register: () => {
          setLabelled(true);
          onCleanup(() => setLabelled(false));
        },
      }}
    >
      <div
        {...native}
        role="group"
        aria-labelledby={labelled() ? id : undefined}
        class={classes(s.section, local.class, local.classList)}
      >
        {local.children}
      </div>
    </SectionContext.Provider>
  );
}
export function SectionLabel(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
  const section = useContext(SectionContext);
  if (!section) throw new Error("Navigation.SectionLabel requires Navigation.Section");
  section.register();
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <h2 {...native} id={section.id} class={classes(s.sectionLabel, local.class, local.classList)} />
  );
}
const LinkContext = createContext<{ register: (text: Accessor<string>) => void }>();
export type LinkProps = Omit<JSX.AnchorHTMLAttributes<HTMLAnchorElement>, "type"> & {
  href: string;
};
export function Link(props: LinkProps) {
  const navigation = useContext(NavigationPresentationContext);
  const [label, setLabel] = createSignal<Accessor<string>>(() => "");
  const [local, native] = splitProps(props, ["class", "classList", "children", "onClick"]);
  const click: JSX.EventHandler<HTMLAnchorElement, MouseEvent> = (event) => {
    callHandler(local.onClick, event);
    const anchor = event.currentTarget;
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self")
    )
      return;
    // Let router/ancestor handlers cancel navigation before dismissing a drawer.
    queueMicrotask(() => {
      if (!event.defaultPrevented) navigation.close();
    });
  };
  return (
    <LinkContext.Provider
      value={{
        register: (text) => {
          setLabel(() => text);
          onCleanup(() => setLabel(() => () => ""));
        },
      }}
    >
      <Tooltip.Root disabled={!navigation.compact()} placement="right">
        <Tooltip.Trigger
          as="a"
          {...native}
          class={classes(s.link, local.class, local.classList)}
          onClick={click}
        >
          {local.children}
        </Tooltip.Trigger>
        <Tooltip.Content>{label()() || props["aria-label"] || "Navigation"}</Tooltip.Content>
      </Tooltip.Root>
    </LinkContext.Provider>
  );
}
export function Icon(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return (
    <span {...native} aria-hidden="true" class={classes(s.icon, local.class, local.classList)} />
  );
}
export function Label(
  props: Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & { children: string },
) {
  const link = useContext(LinkContext);
  if (!link) throw new Error("Navigation.Label requires Navigation.Link");
  link.register(() => props.children);
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.label, local.class, local.classList)} />;
}
export function Count(props: JSX.HTMLAttributes<HTMLSpanElement>) {
  const [local, native] = splitProps(props, ["class", "classList"]);
  return <span {...native} class={classes(s.count, local.class, local.classList)} />;
}
