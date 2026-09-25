import { type SettingsData, useWorkspace } from "@amends/client";
import { ItemList } from "@amends/ui/compositions/item-list";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { KeyValue } from "@amends/ui/compositions/key-value";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { Select } from "@amends/ui/primitives/select";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Status } from "@amends/ui/primitives/status";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createMemo, createSignal, For, Show, onMount } from "solid-js";
import { useSettingsScope } from "./settings.tsx";
type Entry = SettingsData["members"][number];
const workspaceRoles = (entry: Entry) =>
  entry.access?.assignments.filter(
    (assignment) =>
      assignment.status === "active" &&
      assignment.source._tag === "Role" &&
      assignment.source.scope._tag === "Workspace",
  ) ?? [];
const roleName = (entry: Entry, roleId: string) =>
  entry.access?.roles.find((choice) => choice.role.id === roleId)?.role.name ?? roleId;
const roleNames = (entry: Entry) =>
  workspaceRoles(entry)
    .map((assignment) =>
      assignment.source._tag === "Role" ? roleName(entry, assignment.source.roleId) : "",
    )
    .join(", ") || "No workspace role";
export function MemberList(props: { memberHref: (id: string) => string; selectedId?: string }) {
  const value = useSettingsScope();
  const membership = useWorkspace(() => value.data()?.settings.workspace.id ?? "");
  return (
    <Show when={value.data()}>
      <Column gap={6}>
        <For each={["active", "removed"] as const}>
          {(status) => (
            <Column gap={3}>
              <Text as="h2" variant="heading">
                {status === "active" ? "Members" : "Removed members"}
              </Text>
              <Show
                when={value.data()?.members.some((entry) => entry.member.status === status)}
                fallback={
                  <Text tone="secondary">
                    {status === "active" ? "No visible members." : "No removed members."}
                  </Text>
                }
              >
                <ItemList.Root
                  aria-label={status === "active" ? "Active members" : "Removed members"}
                >
                  <For
                    each={value.data()?.members.filter((entry) => entry.member.status === status)}
                  >
                    {(entry) => (
                      <ItemList.Item>
                        <ItemList.Link
                          href={props.memberHref(entry.member.id)}
                          aria-current={props.selectedId === entry.member.id ? "page" : undefined}
                        >
                          <Avatar.Root
                            kind={entry.member.identity._tag === "Human" ? "human" : "agent"}
                            decorative
                          >
                            <Avatar.Fallback>
                              {entry.member.identity.id.slice(0, 1).toLocaleUpperCase()}
                            </Avatar.Fallback>
                          </Avatar.Root>
                          <ItemList.Content>
                            <ItemList.Title>
                              {entry.member.identity.id}
                              {entry.member.id === membership()?.member.id ? " · You" : ""}
                            </ItemList.Title>
                            <ItemList.Description>
                              {entry.access ? roleNames(entry) : "Access details unavailable"}
                            </ItemList.Description>
                          </ItemList.Content>
                          <Status.Root tone={status === "active" ? "success" : "idle"}>
                            <Status.Indicator />
                            <Status.Label>
                              {status === "active" ? "Active" : "Removed"}
                            </Status.Label>
                          </Status.Root>
                        </ItemList.Link>
                      </ItemList.Item>
                    )}
                  </For>
                </ItemList.Root>
              </Show>
            </Column>
          )}
        </For>
      </Column>
    </Show>
  );
}
function MemberEditor(props: { entry: Entry }) {
  const value = useSettingsScope(),
    [role, setRole] = createSignal<string | null>(null),
    [removeOpen, setRemoveOpen] = createSignal(false);
  const current = workspaceRoles(props.entry),
    expectedAssignmentIds = current.map((record) => record.id);
  const first = current[0];
  if (first?.source._tag === "Role") setRole(first.source.roleId);
  createEffect(() => {
    if (value.saved()) setRemoveOpen(false);
  });
  return (
    <Column gap={5}>
      <Show when={props.entry.access?.canManage}>
        <Column
          as="form"
          gap={3}
          aria-label="Member role"
          onSubmit={(event) => {
            event.preventDefault();
            const roleId = role();
            if (roleId)
              value.send({
                kind: "role",
                memberId: props.entry.member.id,
                roleId,
                expectedAssignmentIds,
              });
          }}
        >
          <Field label="Workspace role" required disabled={value.pending() || value.needsRefresh()}>
            {(control) => (
              <Select
                {...control}
                value={role()}
                onChange={setRole}
                options={
                  props.entry.access?.roles
                    .filter((choice) => choice.assignable)
                    .map((choice) => ({ value: choice.role.id, label: choice.role.name })) ?? []
                }
              />
            )}
          </Field>
          <Text tone="secondary">
            Changes the workspace role. Separate permissions and scoped access remain in place.
          </Text>
          <Row>
            <Button
              type="submit"
              disabled={!role() || value.needsRefresh()}
              pending={value.pending()}
            >
              Save role
            </Button>
          </Row>
        </Column>
      </Show>
      <Show when={props.entry.canRemove}>
        <Dialog.Root
          open={removeOpen()}
          onOpenChange={(next) => {
            if (!value.pending()) setRemoveOpen(next);
          }}
        >
          <Row>
            <Dialog.Trigger
              tone="danger"
              variant="secondary"
              disabled={value.pending() || value.needsRefresh()}
            >
              Remove member
            </Dialog.Trigger>
          </Row>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Remove member</Dialog.Title>
              <Dialog.Description>
                Remove {props.entry.member.identity.id} from this workspace? Rejoining requires a
                fresh invitation and creates a new membership.
              </Dialog.Description>
            </Dialog.Header>
            <Dialog.Body>
              <Show when={removeOpen() && value.error()}>
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
                tone="danger"
                pending={value.pending()}
                disabled={value.needsRefresh()}
                onClick={() => value.send({ kind: "remove", memberId: props.entry.member.id })}
              >
                Confirm removal
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Root>
      </Show>
      <Show when={props.entry.member.status === "removed"}>
        <Text tone="secondary">
          This membership is closed. Invite the person again to create a new membership.
        </Text>
      </Show>
    </Column>
  );
}
function MemberContent(props: { entry: Entry }) {
  let heading!: HTMLHeadingElement;
  onMount(() => heading.focus());
  return (
    <Column gap={5}>
      <Text
        ref={(element) => {
          heading = element;
        }}
        tabIndex={-1}
        as="h2"
        variant="heading"
      >
        {props.entry.member.identity.id}
      </Text>
      <KeyValue.Root>
        <KeyValue.Row>
          <KeyValue.Label>Kind</KeyValue.Label>
          <KeyValue.Value>{props.entry.member.identity._tag}</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>Status</KeyValue.Label>
          <KeyValue.Value>{props.entry.member.status}</KeyValue.Value>
        </KeyValue.Row>
        <KeyValue.Row>
          <KeyValue.Label>Member ID</KeyValue.Label>
          <KeyValue.Value>{props.entry.member.id}</KeyValue.Value>
        </KeyValue.Row>
      </KeyValue.Root>
      <MemberEditor entry={props.entry} />
      <Show
        when={props.entry.access}
        fallback={<Text tone="secondary">You cannot read this member’s access.</Text>}
      >
        {(access) => (
          <Column gap={3}>
            <Text as="h3" variant="heading">
              Access
            </Text>
            <Show
              when={access().assignments.length}
              fallback={<Text tone="secondary">No active assignments.</Text>}
            >
              <ItemList.Root aria-label="Active access">
                <For each={access().assignments}>
                  {(assignment) => (
                    <ItemList.Item>
                      <ItemList.Row>
                        <ItemList.Content>
                          <ItemList.Title>
                            {assignment.source._tag === "Role"
                              ? roleName(props.entry, assignment.source.roleId)
                              : assignment.source.grant.permission}
                          </ItemList.Title>
                          <ItemList.Description>
                            {assignment.source._tag === "Role"
                              ? assignment.source.scope._tag
                              : assignment.source.grant.scope._tag}{" "}
                            · {assignment.status}
                          </ItemList.Description>
                        </ItemList.Content>
                      </ItemList.Row>
                    </ItemList.Item>
                  )}
                </For>
              </ItemList.Root>
            </Show>
          </Column>
        )}
      </Show>
    </Column>
  );
}
export function MemberDetail(props: { memberId: string; backHref: string }) {
  const value = useSettingsScope();
  const selected = createMemo(() =>
    value.data()?.members.find((entry) => entry.member.id === props.memberId),
  );
  return (
    <Column gap={4}>
      <ListDetail.Back href={props.backHref}>Back to members</ListDetail.Back>
      <Show
        when={selected()}
        keyed
        fallback={
          <Show when={value.data()}>
            <Text role="status">This member is unavailable or you cannot view them.</Text>
          </Show>
        }
      >
        {(entry) => <MemberContent entry={entry} />}
      </Show>
    </Column>
  );
}
