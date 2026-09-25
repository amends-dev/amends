import { type SettingsData, useWorkspace } from "@amends/client";
import { ItemList } from "@amends/ui/compositions/item-list";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { KeyValue } from "@amends/ui/compositions/key-value";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { Select } from "@amends/ui/primitives/select";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Status } from "@amends/ui/primitives/status";
import { Divider } from "@amends/ui/primitives/divider";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createSignal, For, on, Show, onMount } from "solid-js";
import { keyed } from "../internal/keyed.ts";
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
function MemberRow(props: { entry: Entry; href: string; selected: boolean; you: boolean }) {
  const active = () => props.entry.member.status === "active";
  return (
    <ItemList.Item>
      <ItemList.Link href={props.href} aria-current={props.selected ? "page" : undefined}>
        <ItemList.Leading>
          <Avatar.Root
            kind={props.entry.member.identity._tag === "Human" ? "human" : "agent"}
            decorative
          >
            <Avatar.Fallback>
              {props.entry.member.identity.id.slice(0, 1).toLocaleUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
        </ItemList.Leading>
        <ItemList.Content>
          <ItemList.Title>
            {props.entry.member.identity.id}
            {props.you ? " · You" : ""}
          </ItemList.Title>
          <ItemList.Description>
            {props.entry.access ? roleNames(props.entry) : "Access details unavailable"}
          </ItemList.Description>
        </ItemList.Content>
        <ItemList.Meta>
          <Status.Root tone={active() ? "success" : "idle"}>
            <Status.Indicator />
            <Status.Label>{active() ? "Active" : "Removed"}</Status.Label>
          </Status.Root>
        </ItemList.Meta>
      </ItemList.Link>
    </ItemList.Item>
  );
}
export function MemberList(props: { memberHref: (id: string) => string; selectedId?: string }) {
  const value = useSettingsScope();
  const membership = useWorkspace(() => value.data()?.settings.workspace.id ?? "");
  const members = keyed(
    () => value.data()?.members ?? [],
    (entry) => entry.member.id,
  );
  const entries = (status: "active" | "removed") =>
    members.ids().filter((id) => members.get(id)?.member.status === status);
  return (
    <Show when={value.data()}>
      <Column gap={6}>
        <For each={["active", "removed"] as const}>
          {(status) => (
            <Show when={status === "active" || entries(status).length}>
              <Column gap={3}>
                <Divider.Root>
                  <Divider.Label as="h2">
                    {status === "active" ? "People" : "Removed"}
                  </Divider.Label>
                  <Divider.Note>
                    {status === "active"
                      ? `${entries(status).length} ${entries(status).length === 1 ? "person" : "people"}`
                      : entries(status).length}
                  </Divider.Note>
                  <Divider.Line />
                  <Show when={status === "active"}>
                    <Divider.Note>1 owner</Divider.Note>
                  </Show>
                </Divider.Root>
                <Show
                  when={entries(status).length}
                  fallback={<Text tone="secondary">No visible members.</Text>}
                >
                  <ItemList.Root
                    aria-label={status === "active" ? "Active members" : "Removed members"}
                  >
                    <For each={entries(status)}>
                      {(id) => (
                        <Show when={members.get(id)}>
                          {(entry) => (
                            <MemberRow
                              entry={entry()}
                              href={props.memberHref(id)}
                              selected={props.selectedId === id}
                              you={id === membership()?.member.id}
                            />
                          )}
                        </Show>
                      )}
                    </For>
                  </ItemList.Root>
                </Show>
              </Column>
            </Show>
          )}
        </For>
      </Column>
    </Show>
  );
}
/**
 * The role follows the member's current assignment until chosen. A choice keeps the assignments
 * it was made against, so a change saved elsewhere meanwhile conflicts instead of being replaced.
 */
function MemberEditor(props: { entry: Entry }) {
  const value = useSettingsScope(),
    [draft, setDraft] = createSignal<{ role: string | null; expected: ReadonlyArray<string> }>(),
    [removeOpen, setRemoveOpen] = createSignal(false);
  const assigned = () => workspaceRoles(props.entry);
  const stored = () => {
    const first = assigned()[0];
    return first?.source._tag === "Role" ? first.source.roleId : null;
  };
  const role = () => {
    const chosen = draft();
    return chosen ? chosen.role : stored();
  };
  const expectedAssignmentIds = () => draft()?.expected ?? assigned().map((record) => record.id);
  const setRole = (next: string | null) =>
    setDraft({ role: next, expected: expectedAssignmentIds() });
  createEffect(() => {
    if (value.saved()) {
      setRemoveOpen(false);
      setDraft(undefined);
    }
  });
  createEffect(on(value.revision, () => setDraft(undefined), { defer: true }));
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
                expectedAssignmentIds: expectedAssignmentIds(),
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
      <Column gap={3}>
        <Divider.Root>
          <Divider.Label
            as="h2"
            ref={(element) => {
              heading = element;
            }}
            tabIndex={-1}
          >
            {props.entry.member.identity._tag === "Human" ? "Person" : "Agent"}
          </Divider.Label>
          <Divider.Line />
        </Divider.Root>
        <Row gap={2} wrap={false}>
          <Avatar.Root
            kind={props.entry.member.identity._tag === "Human" ? "human" : "agent"}
            decorative
          >
            <Avatar.Fallback>
              {props.entry.member.identity.id.slice(0, 1).toLocaleUpperCase()}
            </Avatar.Fallback>
          </Avatar.Root>
          <Text as="span">{props.entry.member.identity.id}</Text>
        </Row>
      </Column>
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
            <Divider.Root>
              <Divider.Label as="h3">Access</Divider.Label>
              <Divider.Line />
            </Divider.Root>
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
/** Selecting another member starts over; refreshes of the same member keep its focus and drafts. */
export function MemberDetail(props: { memberId: string; backHref: string }) {
  const value = useSettingsScope();
  return (
    <Column gap={4}>
      <ListDetail.Back href={props.backHref}>Back to members</ListDetail.Back>
      <Show when={props.memberId} keyed>
        {(memberId) => (
          <Show
            when={value.data()?.members.find((entry) => entry.member.id === memberId)}
            fallback={
              <Show when={value.data()}>
                <Text role="status">This member is unavailable or you cannot view them.</Text>
              </Show>
            }
          >
            {(entry) => <MemberContent entry={entry()} />}
          </Show>
        )}
      </Show>
    </Column>
  );
}
