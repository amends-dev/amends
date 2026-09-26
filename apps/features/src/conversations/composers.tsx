import {
  useGroupRoster,
  useGroups,
  useMembers,
  useNewThread,
  useReply,
  useWorkspace,
  type ComposerController,
  type WorkspaceFailure,
} from "@amends/client";
import { Composer, type MentionCandidate } from "@amends/ui/compositions/composer";
import { Button } from "@amends/ui/primitives/button";
import { createUniqueId, Show } from "solid-js";
import { useGroupLabel } from "./group-name.tsx";
import { memberName } from "./presentation.ts";

const failures: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "This conversation changed while you were sending. Try again.",
  denied: "You can’t post here.",
  gone: "This conversation is no longer available to you.",
  invalid: "Write something to send.",
  failed: "We couldn’t send this. Try again when the host is reachable.",
};
/** The group's other members, as the composer suggests them after @. */
function useCandidates(workspaceId: string, groupId: string) {
  const roster = useGroupRoster(workspaceId, groupId);
  const members = useMembers(workspaceId);
  const self = useWorkspace(() => workspaceId);
  return (): ReadonlyArray<MentionCandidate> =>
    (roster.value() ?? []).flatMap((admission) => {
      if (admission.memberId === self()?.member.id) return [];
      const member = members.member(admission.memberId);
      return [
        {
          id: admission.memberId,
          label: memberName(member),
          kind: member?.identity._tag === "Agent" ? "agent" : "human",
        },
      ];
    });
}
function Writing(props: {
  readonly controller: ComposerController;
  readonly candidates: ReadonlyArray<MentionCandidate>;
  readonly label: string;
  readonly placeholder: string;
  readonly note: string;
  readonly send: string;
  readonly density?: "comfortable" | "compact";
}) {
  const id = createUniqueId();
  const control = props.controller;
  return (
    <Composer.Root density={props.density} onSend={control.send}>
      <Composer.Frame>
        <Composer.Input
          aria-label={props.label}
          aria-describedby={control.error() ? `${id}-error` : `${id}-note`}
          aria-invalid={control.error() ? "true" : undefined}
          placeholder={props.placeholder}
          readOnly={control.pending()}
          value={control.draft()}
          onInput={control.setDraft}
          mentions={{
            candidates: props.candidates,
            label: "People to mention",
            onMention: (candidate) => control.mention(candidate.id, candidate.label),
          }}
        />
        <Composer.Actions>
          <Button
            type="submit"
            variant="primary"
            pending={control.pending()}
            disabled={!control.ready() && !control.pending()}
          >
            {props.send}
          </Button>
        </Composer.Actions>
      </Composer.Frame>
      <Show
        when={control.error()}
        fallback={<Composer.Note id={`${id}-note`}>{props.note}</Composer.Note>}
      >
        {(failure) => <Composer.Error id={`${id}-error`}>{failures[failure()]}</Composer.Error>}
      </Show>
    </Composer.Root>
  );
}
export interface NewThreadComposerProps {
  readonly workspaceId: string;
  readonly groupId: string;
}
/**
 * The page composer: writing in it starts a new thread in the group. The draft is kept while
 * the reader moves around the workspace, and clears once the thread starts.
 */
export function NewThreadComposer(props: NewThreadComposerProps) {
  const controller = useNewThread(props.workspaceId, props.groupId);
  const candidates = useCandidates(props.workspaceId, props.groupId);
  const groups = useGroups(props.workspaceId);
  const label = useGroupLabel(props.workspaceId);
  const group = () => groups.value()?.find((item) => item.group.id === props.groupId)?.group;
  const name = () => {
    const current = group();
    if (!current) return "this group";
    return current.kind === "Team" ? `#${label(current)}` : label(current);
  };
  return (
    <Writing
      controller={controller}
      candidates={candidates()}
      label={`Message ${name()}`}
      placeholder={`Message ${name()} — @ to mention`}
      note={
        group()?.kind === "Direct"
          ? `Starts a new thread with ${name()}.`
          : `Starts a new thread in ${name()}.`
      }
      send="Send"
    />
  );
}
export interface ReplyComposerProps {
  readonly workspaceId: string;
  /** The thread's group, whose members its replies can mention. */
  readonly groupId: string;
  readonly threadId: string;
}
/** The thread composer: writing in it replies in the thread. Its draft is kept per thread. */
export function ReplyComposer(props: ReplyComposerProps) {
  const controller = useReply(props.workspaceId, props.threadId);
  const candidates = useCandidates(props.workspaceId, props.groupId);
  return (
    <Writing
      controller={controller}
      candidates={candidates()}
      label="Reply"
      placeholder="Reply in this thread — @ to mention"
      note="Replying here stays in this thread."
      send="Reply"
      density="compact"
    />
  );
}
