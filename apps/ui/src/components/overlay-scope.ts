import {
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
} from "solid-js";

/** Layouts that relocate mounted children update the portal host without remounting them. */
export const OverlayHostContext = createContext<Accessor<HTMLElement | undefined>>();

/** Portals stay inside native modals and carry the trigger's nearest complete theme scope. */
export function createOverlayScope(anchor: Accessor<HTMLElement | undefined>) {
  const inheritedHost = useContext(OverlayHostContext);
  const [mount, setMount] = createSignal<HTMLElement>();
  const [scope, setScope] = createSignal<{ theme?: string; surface?: string }>({});
  createEffect(() => {
    const host = inheritedHost?.();
    const element = anchor();
    if (!element) return;
    setMount(element.closest("dialog") ?? host ?? element.ownerDocument.body);
    const ancestors: HTMLElement[] = [];
    for (let node: HTMLElement | null = element; node; node = node.parentElement)
      ancestors.push(node);
    const update = () => {
      const nearest = ancestors.find(
        (node) =>
          ["cotton", "soot"].includes(node.dataset.theme ?? "") ||
          node.dataset.surface === "inverse",
      );
      setScope(
        nearest
          ? {
              ...(nearest.dataset.theme ? { theme: nearest.dataset.theme } : {}),
              ...(nearest.dataset.surface === "inverse" ? { surface: "inverse" } : {}),
            }
          : {},
      );
    };
    update();
    const observer = new MutationObserver(update);
    for (const node of ancestors)
      observer.observe(node, { attributes: true, attributeFilter: ["data-theme", "data-surface"] });
    onCleanup(() => observer.disconnect());
  });
  return { mount, scope };
}
