import { useSettings, type SettingsController, type SettingsSection } from "@amends/client";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createContext, Show, useContext, type ParentProps } from "solid-js";
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
            {value.error()}
          </Text>
          <Row>
            <Button variant="ghost" pending={value.pending()} onClick={value.refresh}>
              Try again
            </Button>
          </Row>
        </Column>
      </Show>
    </Column>
  );
}
