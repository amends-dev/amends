import {
  useGroups,
  useNewThread,
  useReply,
  type ComposerController,
  type WorkspaceFailure,
} from "@amends/client";
import { Composer } from "@amends/ui/compositions/composer";
import { Button } from "@amends/ui/primitives/button";
import { createUniqueId, Show } from "solid-js";
import { useGroupLabel } from "./group-name.tsx";

const failures: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "This conversation changed while you were sending. Try again.",
  denied: "You can’t post here.",
  gone: "This conversation is no longer available to you.",
  invalid: "Write something to send.",
  failed: "We couldn’t send this. Try again when the host is reachable.",
};
function Writing(props: {
  readonly controller: ComposerController;
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
      label={`Message ${name()}`}
      placeholder={`Message ${name()}`}
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
  readonly threadId: string;
}
/** The thread composer: writing in it replies in the thread. Its draft is kept per thread. */
export function ReplyComposer(props: ReplyComposerProps) {
  const controller = useReply(props.workspaceId, props.threadId);
  return (
    <Writing
      controller={controller}
      label="Reply"
      placeholder="Reply in this thread"
      note="Replying here stays in this thread."
      send="Reply"
      density="compact"
    />
  );
}
