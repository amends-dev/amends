import { useDirectMessage, useGroups, useMembers, useWorkspace, type Group } from "@amends/client";
import { ChipPicker } from "@amends/ui/compositions/chip-picker";
import { Composer, type MentionCandidate } from "@amends/ui/compositions/composer";
import { Dialog } from "@amends/ui/compositions/dialog";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Field } from "@amends/ui/compositions/field";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createSignal, createUniqueId, Show } from "solid-js";
import { Writing } from "./composers.tsx";
import { initials, memberName } from "./presentation.ts";

/** Where messaging some people leads: their direct group, or the people when they have none. */
export type MessageTarget =
  | { readonly groupId: string }
  | { readonly memberIds: ReadonlyArray<string> };
/** The direct group of exactly these members, the reader among them, if they have one. */
const directGroupWith = (
  groups: ReadonlyArray<Group.ListItem>,
  members: ReadonlyArray<string>,
): string | undefined => {
  const wanted = new Set(members);
  return groups.find(
    ({ group }) =>
      group.kind === "Direct" &&
      group.memberIds.length === wanted.size &&
      group.memberIds.every((memberId) => wanted.has(memberId)),
  )?.group.id;
};
/** The other people's names, as a direct group is named. */
const namesOf = (
  memberIds: ReadonlyArray<string>,
  member: ReturnType<typeof useMembers>["member"],
) => memberIds.map((memberId) => memberName(member(memberId))).join(", ");

export interface NewMessageDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** The people chosen: their direct group, or the people when they have none yet. */
  readonly onChoose: (target: MessageTarget) => void;
}
/**
 * Choose people and agents to message. It leads to their direct group when the reader already has
 * one with exactly them, or to the people otherwise, whose first message will create it.
 */
export function NewMessageDialog(props: NewMessageDialogProps) {
  const form = createUniqueId();
  const members = useMembers(props.workspaceId);
  const groups = useGroups(props.workspaceId);
  const self = useWorkspace(() => props.workspaceId);
  const [chosen, setChosen] = createSignal<ReadonlyArray<string>>([]);
  const options = () =>
    (members.all() ?? [])
      .filter((member) => member.status === "active" && member.id !== self()?.member.id)
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
  const existing = () => {
    const id = self()?.member.id;
    if (id === undefined || chosen().length === 0) return undefined;
    return directGroupWith(groups.value() ?? [], [id, ...chosen()]);
  };
  const close = () => {
    props.onOpenChange(false);
    setChosen([]);
  };
  return (
    <Dialog.Root
      open={props.open}
      onOpenChange={(open) => {
        if (open) props.onOpenChange(true);
        else close();
      }}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>New message</Dialog.Title>
          <Dialog.Description>
            Everyone you choose sees every thread in your conversation together.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <form
            id={form}
            onSubmit={(event) => {
              event.preventDefault();
              if (chosen().length === 0) return;
              const groupId = existing();
              const target = groupId ? { groupId } : { memberIds: chosen() };
              close();
              props.onChoose(target);
            }}
          >
            <Column gap={3}>
              <Field label="To">
                {(control) => (
                  <ChipPicker.Root
                    options={options()}
                    value={chosen()}
                    onChange={setChosen}
                    chipsLabel="To"
                    input={{ ...control, placeholder: "Add someone…" }}
                    empty="nobody by that name"
                  />
                )}
              </Field>
              <Show when={existing()}>
                <Text role="status" tone="secondary">
                  You already have a conversation with them.
                </Text>
              </Show>
            </Column>
          </form>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close variant="secondary">Cancel</Dialog.Close>
          <Button type="submit" form={form} disabled={chosen().length === 0}>
            {existing() ? "Open conversation" : "Start conversation"}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export interface DirectDraftProps {
  readonly workspaceId: string;
  /** The people to message, besides the reader. */
  readonly memberIds: ReadonlyArray<string>;
  /** The first message started their direct group, or it turned out to exist already. */
  readonly onGroup: (groupId: string) => void;
}
/**
 * A conversation with some people that has no messages yet: its first message, written below,
 * creates their direct group. When the reader already has one with them, it hands over to it.
 */
export function DirectDraft(props: DirectDraftProps) {
  const members = useMembers(props.workspaceId);
  const groups = useGroups(props.workspaceId);
  const self = useWorkspace(() => props.workspaceId);
  const others = () => props.memberIds.filter((memberId) => memberId !== self()?.member.id);
  let handed = false;
  const hand = (groupId: string) => {
    if (handed) return;
    handed = true;
    props.onGroup(groupId);
  };
  // A conversation that exists, or appears meanwhile, is where writing to them belongs.
  createEffect(() => {
    const id = self()?.member.id;
    if (id === undefined || others().length === 0) return;
    const groupId = directGroupWith(groups.value() ?? [], [id, ...others()]);
    if (groupId) hand(groupId);
  });
  const controller = useDirectMessage(props.workspaceId, others(), hand);
  const names = () => namesOf(others(), members.member);
  const candidates = (): ReadonlyArray<MentionCandidate> =>
    others().map((memberId) => {
      const member = members.member(memberId);
      return {
        id: memberId,
        label: memberName(member),
        kind: member?.identity._tag === "Agent" ? "agent" : "human",
      };
    });
  return (
    <Show
      when={others().length > 0}
      fallback={
        <EmptyState.Root>
          <Drawing.Bare />
          <EmptyState.Text>
            <EmptyState.Title>Nobody to message</EmptyState.Title>
            <EmptyState.Description>
              Choose people from Direct in the sidebar to start a conversation.
            </EmptyState.Description>
          </EmptyState.Text>
        </EmptyState.Root>
      }
    >
      <EmptyState.Root>
        <Drawing.Bare />
        <EmptyState.Text>
          <EmptyState.Title>Nothing said yet</EmptyState.Title>
          <EmptyState.Description>
            Your first message starts your conversation with {names()}.
          </EmptyState.Description>
        </EmptyState.Text>
      </EmptyState.Root>
      <Composer.Dock>
        <Writing
          controller={controller}
          candidates={candidates()}
          label={`Message ${names()}`}
          placeholder={`Message ${names()} — @ to mention`}
          note={`Starts your conversation with ${names()}.`}
          send="Send"
        />
      </Composer.Dock>
    </Show>
  );
}
/** The people a draft conversation is with, as its title. */
export function DirectDraftName(props: {
  readonly workspaceId: string;
  readonly memberIds: ReadonlyArray<string>;
}) {
  const members = useMembers(props.workspaceId);
  const self = useWorkspace(() => props.workspaceId);
  return (
    <>
      {namesOf(
        props.memberIds.filter((memberId) => memberId !== self()?.member.id),
        members.member,
      ) || "New message"}
    </>
  );
}
