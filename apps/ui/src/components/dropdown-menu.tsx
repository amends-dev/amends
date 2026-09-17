import * as Menu from "@kobalte/core/dropdown-menu";
import { createContext, createSignal, Show, useContext, type JSX } from "solid-js";
import { createOverlayScope } from "./overlay-scope.ts";
import * as s from "./menu.css.ts";

const SelectionContext = createContext<(action: () => void) => void>();

export type OverlayTrigger = (props: JSX.ButtonHTMLAttributes<HTMLButtonElement>) => JSX.Element;
export interface DropdownMenuProps {
  /** Render one button and spread the supplied attributes, events, and ref onto it. */
  trigger: OverlayTrigger;
  children: JSX.Element;
  disabled?: boolean;
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
}
/** Action menu with managed focus, typeahead, collision handling, and themed portal content. */
export function DropdownMenu(props: DropdownMenuProps) {
  const [anchor, setAnchor] = createSignal<HTMLElement>();
  const scope = createOverlayScope(anchor);
  let selection: (() => void) | undefined;
  return (
    <SelectionContext.Provider
      value={(action) => {
        selection = action;
      }}
    >
      <Menu.Root
        modal={false}
        placement={props.placement ?? "bottom-end"}
        gutter={6}
        overflowPadding={8}
        fitViewport
      >
        <Menu.Trigger as={props.trigger} ref={setAnchor} disabled={props.disabled ?? false} />
        <Show when={scope.mount()}>
          {(mount) => (
            <Menu.Portal mount={mount()}>
              <div data-theme={scope.scope().theme} data-surface={scope.scope().surface}>
                <Menu.Content
                  class={s.content}
                  onCloseAutoFocus={(event) => {
                    if (selection) {
                      event.preventDefault();
                      const action = selection;
                      selection = undefined;
                      anchor()?.focus({ preventScroll: true });
                      queueMicrotask(action);
                    }
                  }}
                >
                  {props.children}
                </Menu.Content>
              </div>
            </Menu.Portal>
          )}
        </Show>
      </Menu.Root>
    </SelectionContext.Provider>
  );
}
export interface DropdownMenuItemProps {
  children: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "neutral" | "danger";
}
/** Selecting an enabled action closes the menu. Disabled actions are skipped by navigation. */
export function DropdownMenuItem(props: DropdownMenuItemProps) {
  const select = useContext(SelectionContext);
  if (!select) throw new Error("DropdownMenuItem requires a DropdownMenu.");
  return (
    <Menu.Item
      class={`${s.item} ${props.tone === "danger" ? s.danger : ""}`}
      textValue={props.children}
      disabled={props.disabled ?? false}
      onSelect={() => select(props.onSelect)}
    >
      {props.children}
    </Menu.Item>
  );
}
export function DropdownMenuSeparator() {
  return <Menu.Separator class={s.separator} />;
}
