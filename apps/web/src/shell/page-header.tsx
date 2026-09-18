import { createContext, onCleanup, useContext } from "solid-js";
import type { PageHeaderProps } from "@amends/ui/components";
export type PageHeaderContent = Omit<PageHeaderProps, "navigation">;
export const PageHeaderContext =
  createContext<(content: (() => PageHeaderContent) | undefined) => void>();
/** The active page supplies content; the shell retains its single navigation/header frame. */
export function usePageHeader(content: () => PageHeaderContent) {
  const set = useContext(PageHeaderContext);
  if (!set) throw new Error("Page headers require the shell.");
  set(content);
  onCleanup(() => set(undefined));
}
