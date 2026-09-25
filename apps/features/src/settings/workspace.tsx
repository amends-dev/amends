import { WorkspaceNameForm } from "@amends/ui/features/settings";
import { KeyValue } from "@amends/ui/compositions/key-value";
import { Divider } from "@amends/ui/primitives/divider";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { Select } from "@amends/ui/primitives/select";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createSignal, on, Show } from "solid-js";
import { useSettingsScope } from "./settings.tsx";
/**
 * The name field follows the stored name until edited. A draft keeps the name it was made
 * against, so a rename saved elsewhere meanwhile conflicts instead of being overwritten.
 */
export function WorkspaceName() {
  const value = useSettingsScope();
  const [draft, setDraft] = createSignal<{ name: string; expected: string }>();
  const stored = () => value.data()?.settings.workspace.name ?? "";
  createEffect(() => {
    if (value.saved()) setDraft(undefined);
  });
  createEffect(on(value.revision, () => setDraft(undefined), { defer: true }));
  return (
    <Show when={value.data()}>
      {(data) => (
        <Column gap={4}>
          <Divider.Root>
            <Divider.Label as="h2">Name</Divider.Label>
            <Divider.Line />
          </Divider.Root>
          <Show
            when={data().settings.canRename}
            fallback={<Text>Only an authorized owner can rename this workspace.</Text>}
          >
            <WorkspaceNameForm
              name={draft()?.name ?? stored()}
              onNameChange={(name) => setDraft({ name, expected: draft()?.expected ?? stored() })}
              onSubmit={(name) =>
                value.send({ kind: "rename", name, expectedName: draft()?.expected ?? stored() })
              }
              pending={value.pending()}
              disabled={value.needsRefresh()}
            />
          </Show>
        </Column>
      )}
    </Show>
  );
}
export function WorkspaceDetails() {
  const value = useSettingsScope();
  return (
    <Show when={value.data()}>
      {(data) => (
        <Column gap={3}>
          <Divider.Root>
            <Divider.Label as="h2">Details</Divider.Label>
            <Divider.Line />
          </Divider.Root>
          <KeyValue.Root>
            <KeyValue.Row>
              <KeyValue.Label>Name</KeyValue.Label>
              <KeyValue.Value>{data().settings.workspace.name}</KeyValue.Value>
            </KeyValue.Row>
            <KeyValue.Row>
              <KeyValue.Label>Created by</KeyValue.Label>
              <KeyValue.Value>{data().settings.workspace.createdBy}</KeyValue.Value>
            </KeyValue.Row>
            <KeyValue.Row>
              <KeyValue.Label>Owner</KeyValue.Label>
              <KeyValue.Value>{data().ownership.owner.identity.id}</KeyValue.Value>
            </KeyValue.Row>
            <KeyValue.Row>
              <KeyValue.Label>Workspace ID</KeyValue.Label>
              <KeyValue.Value>{data().settings.workspace.id}</KeyValue.Value>
            </KeyValue.Row>
          </KeyValue.Root>
        </Column>
      )}
    </Show>
  );
}
export function OwnershipTransfer() {
  const value = useSettingsScope(),
    [open, setOpen] = createSignal(false),
    [selected, setSelected] = createSignal<string | null>(null);
  const [expected, setExpected] = createSignal<string>();
  createEffect(() => {
    if (value.saved()) {
      setOpen(false);
      setSelected(null);
    }
  });
  return (
    <Show when={value.data()?.ownership.canTransfer}>
      <Column gap={3}>
        <Divider.Root>
          <Divider.Label as="h2">Ownership</Divider.Label>
          <Divider.Line />
        </Divider.Root>
        <Text tone="secondary">
          A workspace has one owner. Transferring ownership makes you an administrator.
        </Text>
        <Dialog.Root
          open={open()}
          onOpenChange={(next) => {
            if (value.pending()) return;
            setOpen(next);
            if (next) {
              setExpected(value.data()?.ownership.ownerAssignmentId);
              setSelected(null);
            }
          }}
        >
          <Row>
            <Dialog.Trigger
              disabled={
                value.pending() ||
                value.needsRefresh() ||
                !value.data()?.ownership.candidates.length
              }
            >
              Transfer ownership
            </Dialog.Trigger>
          </Row>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Transfer ownership</Dialog.Title>
              <Dialog.Description>
                The selected member becomes the only owner. You’ll remain an administrator and lose
                owner-only actions.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Field label="New owner" required disabled={value.pending()}>
                {(control) => (
                  <Select
                    {...control}
                    options={
                      value.data()?.ownership.candidates.map((member) => ({
                        value: member.id,
                        label: member.identity.id,
                      })) ?? []
                    }
                    value={selected()}
                    onChange={setSelected}
                  />
                )}
              </Field>
              <Show when={open() && value.error()}>
                <Text role="alert" tone="danger">
                  {value.error()}
                </Text>
              </Show>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Close variant="secondary" disabled={value.pending()}>
                Cancel
              </Dialog.Close>
              <Button
                pending={value.pending()}
                disabled={!selected() || !expected() || value.needsRefresh()}
                onClick={() => {
                  const memberId = selected(),
                    expectedOwnerAssignmentId = expected();
                  if (memberId && expectedOwnerAssignmentId)
                    value.send({ kind: "transfer", memberId, expectedOwnerAssignmentId });
                }}
              >
                Confirm transfer
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Root>
        <Show when={!value.data()?.ownership.candidates.length}>
          <Text tone="secondary">Invite another person before transferring ownership.</Text>
        </Show>
      </Column>
    </Show>
  );
}
