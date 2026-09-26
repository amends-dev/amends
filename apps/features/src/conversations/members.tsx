import { useGroupMembers, useMembers, useWorkspace, type WorkspaceFailure } from "@amends/client";
import { ChipPicker } from "@amends/ui/compositions/chip-picker";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { ItemList } from "@amends/ui/compositions/item-list";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, For, Show } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { GroupName } from "./group-name.tsx";
import { initials, memberName } from "./presentation.ts";

const messages: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "The members changed meanwhile. Check the list and try again.",
  denied: "You can no longer change this group's members.",
  gone: "That person is no longer in the workspace or this group.",
  invalid: "That change isn't possible here.",
  failed: "The change could not be made. Try again when the host is available.",
};
export interface GroupMembersProps {
  readonly workspaceId: string;
  readonly groupId: string;
  /** The reader left the group; the app decides where that leads. */
  readonly onLeft: () => void;
}
/**
 * A group's member count as a header action that opens its members: who belongs, adding and
 * removing people where the reader manages the group, and leaving a team group.
 */
export function GroupMembersAction(props: GroupMembersProps) {
  const [open, setOpen] = createSignal(false);
  const [chosen, setChosen] = createSignal<ReadonlyArray<string>>([]);
  const [confirming, setConfirming] = createSignal<string>();
  const members = useMembers(props.workspaceId);
  const self = useWorkspace(() => props.workspaceId);
  const group = useGroupMembers(props.workspaceId, props.groupId, {
    added: () => setChosen([]),
    left: () => {
      setOpen(false);
      props.onLeft();
    },
  });
  // Rows follow admission IDs, so a live refresh keeps each row, its focus, and its question.
  const nameOf = (memberId: string) => memberName(members.member(memberId));
  // The reader first, then everyone else by name.
  const ordered = () =>
    (group.roster() ?? []).toSorted(
      (left, right) =>
        Number(right.memberId === self()?.member.id) -
          Number(left.memberId === self()?.member.id) ||
        nameOf(left.memberId).localeCompare(nameOf(right.memberId)),
    );
  const rows = keyed(ordered, (admission) => admission.id);
  const count = () => group.roster()?.length;
  const current = () =>
    new Set<string>((group.roster() ?? []).map((admission) => admission.memberId));
  // Anyone active in the workspace who is not in the group yet can be added.
  const candidates = () =>
    (members.all() ?? [])
      .filter((member) => member.status === "active" && !current().has(member.id))
      .map((member) => {
        const name = memberName(member);
        const agent = member.identity._tag === "Agent";
        return {
          value: member.id as string,
          label: name,
          mark: initials(name).toLocaleLowerCase(),
          description: agent ? "agent" : "person",
          ring: agent ? ("dashed" as const) : ("solid" as const),
        };
      });
  // Someone added elsewhere meanwhile leaves the picker.
  const picked = () => chosen().filter((memberId) => !current().has(memberId));
  const busy = () => group.changing() !== undefined;
  return (
    <Show when={count() !== undefined}>
      <Dialog.Root
        open={open()}
        onOpenChange={(next) => {
          if (busy()) return;
          setOpen(next);
          if (!next) {
            setChosen([]);
            setConfirming(undefined);
          }
        }}
      >
        <Dialog.Trigger variant="secondary">
          {count()} {count() === 1 ? "member" : "members"}
        </Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>Members</Dialog.Title>
            <Dialog.Description>
              Everyone here reads{" "}
              <GroupName workspaceId={props.workspaceId} groupId={props.groupId} />
              ’s threads.
            </Dialog.Description>
          </Dialog.Header>
          <Dialog.Body>
            <Column gap={5}>
              <Show when={group.manageable()}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    group.add(picked());
                  }}
                >
                  <Column gap={3}>
                    <Field label="Add people">
                      {(control) => (
                        <ChipPicker.Root
                          options={candidates()}
                          value={picked()}
                          onChange={setChosen}
                          chipsLabel="To add"
                          input={{ ...control, placeholder: "Add someone…" }}
                          empty="nobody else to add"
                          disabled={busy()}
                        />
                      )}
                    </Field>
                    <Row>
                      <Button
                        type="submit"
                        variant="secondary"
                        pending={group.changing() === "add"}
                        disabled={picked().length === 0 || (busy() && group.changing() !== "add")}
                      >
                        Add
                      </Button>
                    </Row>
                  </Column>
                </form>
              </Show>
              <ItemList.Root aria-label="Members">
                <For each={rows.ids()}>
                  {(id) => {
                    const memberId = () => rows.get(id)?.memberId ?? "";
                    return (
                      <Entry
                        name={memberName(members.member(memberId()))}
                        agent={members.member(memberId())?.identity._tag === "Agent"}
                        self={memberId() === self()?.member.id}
                        removable={group.manageable() && memberId() !== self()?.member.id}
                        leavable={group.leavable() && id === group.own()?.id}
                        confirming={confirming() === id}
                        pending={group.changing() === id}
                        disabled={busy() && group.changing() !== id}
                        onAsk={() => setConfirming(id)}
                        onCancel={() => setConfirming(undefined)}
                        onConfirm={() => {
                          if (id === group.own()?.id) group.leave();
                          else group.remove(id);
                        }}
                      />
                    );
                  }}
                </For>
              </ItemList.Root>
              <Show when={group.error()}>
                {(failure) => (
                  <Text role="alert" tone="danger">
                    {messages[failure()]}
                  </Text>
                )}
              </Show>
            </Column>
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close variant="secondary" disabled={busy()}>
              Done
            </Dialog.Close>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Root>
    </Show>
  );
}
/** One member, with removing them or leaving as a two-step action. */
function Entry(props: {
  readonly name: string;
  readonly agent: boolean;
  readonly self: boolean;
  readonly removable: boolean;
  readonly leavable: boolean;
  readonly confirming: boolean;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onAsk: () => void;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const action = () => (props.leavable ? "Leave" : "Remove");
  let returning = false;
  const description = () => {
    if (props.confirming)
      return props.leavable
        ? "Leave this group? You’ll stop seeing its threads."
        : `Remove ${props.name}? They’ll stop seeing its threads.`;
    return props.self ? "you" : props.agent ? "agent" : "person";
  };
  return (
    <ItemList.Item>
      <ItemList.Row>
        <ItemList.Leading>
          <Avatar.Root kind={props.agent ? "agent" : "human"} decorative>
            <Avatar.Fallback>{initials(props.name)}</Avatar.Fallback>
          </Avatar.Root>
        </ItemList.Leading>
        <ItemList.Content>
          <ItemList.Title>{props.name}</ItemList.Title>
          <ItemList.Description>{description()}</ItemList.Description>
        </ItemList.Content>
        <Show when={props.removable || props.leavable}>
          <ItemList.Actions>
            <Show
              when={props.confirming}
              fallback={
                <Button
                  ref={(element) => {
                    // Cancelling brings focus back to the action it answered.
                    if (returning) queueMicrotask(() => element.focus());
                    returning = false;
                  }}
                  variant="secondary"
                  disabled={props.disabled}
                  onClick={props.onAsk}
                >
                  {action()}
                </Button>
              }
            >
              <Button
                ref={(element) => queueMicrotask(() => element.focus())}
                tone="danger"
                pending={props.pending}
                disabled={props.disabled}
                onClick={props.onConfirm}
              >
                {action()}
              </Button>
              <Button
                variant="ghost"
                disabled={props.pending}
                onClick={() => {
                  returning = true;
                  props.onCancel();
                }}
              >
                Cancel
              </Button>
            </Show>
          </ItemList.Actions>
        </Show>
      </ItemList.Row>
    </ItemList.Item>
  );
}
