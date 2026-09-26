import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isMessageText, newPostKey, postRequest, type Post } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

/** One draft per composer target, kept in the credential scope's registry while it lasts. */
const draftOf = Atom.family((_key: string) => Atom.make("").pipe(Atom.keepAlive));

export interface ComposerController {
  /** The text being written, kept when the composer unmounts and remounts. */
  readonly draft: Accessor<string>;
  /** Replace the draft; a failure shown for the previous one clears. */
  readonly setDraft: (text: string) => void;
  /** The draft has text and nothing is sending. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last send failed; the draft is kept for another try. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Send the draft; it clears once the message is posted. */
  readonly send: () => void;
}
type Target =
  | { readonly kind: "start"; readonly groupId: string }
  | { readonly kind: "reply"; readonly threadId: string };
function compose(workspaceId: string, target: Target): ComposerController {
  const session = useSession();
  const draftAtom = draftOf(
    `${workspaceId}\u0000${target.kind === "start" ? target.groupId : target.threadId}\u0000${target.kind}`,
  );
  const draft = useAtomValue(() => draftAtom),
    write = useAtomSet(() => draftAtom);
  const [error, setError] = createSignal<WorkspaceFailure>();
  // A retry of the same text keeps its key, so a post that succeeded unseen is not repeated.
  let attempt: { readonly text: string; readonly key: ReturnType<typeof newPostKey> } | undefined;
  const request = useRequest(
    postRequest(useApiClient(), workspaceId),
    (exit, post) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      attempt = undefined;
      if (draft() === post.text) write("");
    },
    { when: () => session.session !== undefined },
  );
  const ready = () => isMessageText(draft()) && !request.pending();
  return {
    draft,
    setDraft: (text) => {
      write(text);
      setError(undefined);
    },
    ready,
    pending: request.pending,
    error,
    send: () => {
      if (!ready()) return;
      const text = draft();
      if (attempt?.text !== text) attempt = { text, key: newPostKey() };
      setError(undefined);
      request.run({ ...target, text, key: attempt.key } as Post);
    },
  };
}
/** Start a thread in a group from a kept draft. */
export const useNewThread = (workspaceId: string, groupId: string) =>
  compose(workspaceId, { kind: "start", groupId });
/** Reply in a thread from a kept draft. */
export const useReply = (workspaceId: string, threadId: string) =>
  compose(workspaceId, { kind: "reply", threadId });
