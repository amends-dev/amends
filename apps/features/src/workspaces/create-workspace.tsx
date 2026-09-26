import { useCreateWorkspace, type CreateWorkspaceController } from "@amends/client";
import { CreateWorkspaceForm } from "@amends/ui/features/workspaces";
import { Button } from "@amends/ui/primitives/button";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createContext, createEffect, Show, useContext, type ParentProps } from "solid-js";

const Context = createContext<CreateWorkspaceController>();
const controller = () => {
  const value = useContext(Context);
  if (!value) throw new Error("CreateWorkspace parts require CreateWorkspace.Root.");
  return value;
};
export function Root(props: ParentProps<{ onCreated: (workspaceId: string) => void }>) {
  const value = useCreateWorkspace();
  createEffect(() => {
    const state = value.state();
    if (state._tag === "Ready") props.onCreated(state.workspace.id);
  });
  return <Context.Provider value={value}>{props.children}</Context.Provider>;
}
export function Form(props: { headingAs?: "h1" | "h2" | "h3" }) {
  const value = controller();
  const form = () => {
    const state = value.state();
    return state._tag === "Form" ? state : undefined;
  };
  return (
    <Show when={form()}>
      {(state) => (
        <CreateWorkspaceForm
          headingAs={props.headingAs}
          name={state().name}
          onNameChange={value.setName}
          memberName={state().memberName}
          onMemberNameChange={value.setMemberName}
          memberNameError={
            state().error === "invalid-member-name" ? "Use 1 to 80 characters." : undefined
          }
          onSubmit={value.submit}
          pending={state().pending}
          nameError={state().error === "invalid-name" ? "Enter a workspace name." : undefined}
          requestError={
            state().error === "denied"
              ? "This identity cannot create workspaces."
              : state().error === "request-reused"
                ? "This request was already used for a different name. Return to the workspace list before starting again."
                : state().error === "request-failed"
                  ? "We couldn’t confirm creation. Try again with this name to safely check the same request."
                  : undefined
          }
        />
      )}
    </Show>
  );
}
/** Keep the created result available if its directory refresh needs recovery. */
export function Result() {
  const value = controller();
  const created = () => {
    const state = value.state();
    return state._tag === "Created" ? state : undefined;
  };
  return (
    <Show when={created()}>
      {(state) => (
        <Column gap={4}>
          <Text as="h1" variant="heading">
            Workspace created
          </Text>
          <Text>{state().workspace.name} is ready.</Text>
          <Text role="status">{state().pending ? "Refreshing your workspaces…" : ""}</Text>
          <Show when={state().refreshFailed}>
            <Text role="alert" tone="danger">
              Your workspace was created, but we couldn’t refresh the list. Try again to open it.
            </Text>
            <Button onClick={value.retryRefresh}>Try again</Button>
          </Show>
        </Column>
      )}
    </Show>
  );
}
