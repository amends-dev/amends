import {
  useSettings,
  type SettingsController,
  type SettingsError,
  type SettingsSection,
} from "@amends/client";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createContext, Show, useContext, type ParentProps } from "solid-js";
const messages: { readonly [Error in SettingsError]: string } = {
  changed: "This changed while you were editing. Refresh, review the latest values, and try again.",
  denied: "You no longer have permission for this action. Refresh to review your access.",
  gone: "This item is no longer available for that action. Refresh to see its current state.",
  invalid: "Check the values and try again.",
  failed: "The request could not be completed. Try again when the host is available.",
  "refresh-failed": "Saved, but the latest data could not be loaded. Refresh to continue.",
  outdated: "The latest settings could not be loaded. Try again.",
};
/** The reader-facing text for a settings failure. */
export const settingsMessage = (error: SettingsError | undefined) =>
  error === undefined ? undefined : messages[error];
const Context = createContext<SettingsController>();
export const useSettingsScope = () => {
  const value = useContext(Context);
  if (!value) throw new Error("Settings parts require Settings.Root.");
  return value;
};
function Scope(props: ParentProps<{ workspaceId: string; section: SettingsSection }>) {
  const value = useSettings(props.workspaceId, props.section);
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}
/** Workspace identity changes release requests and drafts; data refreshes preserve the mounted tree. */
export function Root(props: ParentProps<{ workspaceId: string; section: SettingsSection }>) {
  return (
    <Show when={props.workspaceId} keyed>
      {(workspaceId) => (
        <Show when={props.section} keyed>
          {(section) => (
            <Scope workspaceId={workspaceId} section={section}>
              {props.children}
            </Scope>
          )}
        </Show>
      )}
    </Show>
  );
}
export function Feedback() {
  const value = useSettingsScope();
  return (
    <Column gap={2}>
      <Text role="status" aria-atomic="true">
        {value.pending() ? "Updating settings…" : value.saved() ? "Saved." : ""}
      </Text>
      <Show when={value.error()}>
        <Column gap={2}>
          <Text role="alert" tone="danger">
            {settingsMessage(value.error())}
          </Text>
          {/* A failed request or invalid input is retried from its form; a refresh helps only
              when the values shown are out of date. */}
          <Show when={value.needsRefresh() || value.error() === "outdated"}>
            <Row>
              <Button variant="ghost" pending={value.pending()} onClick={value.refresh}>
                Try again
              </Button>
            </Row>
          </Show>
        </Column>
      </Show>
    </Column>
  );
}
