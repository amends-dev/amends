import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { colorVars } from "../../foundations/color/theme.css.ts";

/** Private bridge for a mounted subtree that moves between a dock and a native modal. */
export const OverlayHostContext = createContext<Accessor<HTMLElement | undefined>>();
const properties = Object.values(colorVars).flatMap((group) =>
  Object.values(group).map((value) => value.slice(4, -1)),
);
export function createOverlayScope(anchor: Accessor<HTMLElement | undefined>) {
  const inheritedHost = useContext(OverlayHostContext);
  const mount = createMemo(
    () => inheritedHost?.() ?? anchor()?.closest("dialog") ?? anchor()?.ownerDocument.body,
  );
  const [style, setStyle] = createSignal<JSX.CSSProperties>({});
  const [direction, setDirection] = createSignal<"ltr" | "rtl">("ltr");
  createEffect(() => {
    mount();
    const element = anchor();
    if (!element) return;
    const update = () => {
      const computed = getComputedStyle(element);
      setStyle({
        ...Object.fromEntries(properties.map((key) => [key, computed.getPropertyValue(key)])),
        "color-scheme": computed.colorScheme,
      });
      setDirection(computed.direction === "rtl" ? "rtl" : "ltr");
    };
    update();
    const observer = new MutationObserver(update);
    for (let node: HTMLElement | null = element; node; node = node.parentElement)
      observer.observe(node, { attributes: true, attributeFilter: ["class", "style", "dir"] });
    onCleanup(() => observer.disconnect());
  });
  return { mount, style, direction };
}
