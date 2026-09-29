import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  ThreadMessage,
  isMessageText,
  newPostKey,
  postRequest,
  type Post,
} from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { typingRequest } from "../api/typing.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

interface Draft {
  /** Markdown, whose mentions link to members. */
  readonly text: string;
  /**
   * The last message sent from this draft and its request key, until it is posted. It lives with
   * the draft rather than the composer, so sending the same message again after the composer
   * remounted, such as when a send was cut off by closing the thread, reuses the key and cannot
   * post it twice.
   */
  readonly attempt?: { readonly body: string; readonly key: ReturnType<typeof newPostKey> };
}
const empty: Draft = { text: "" };
/** How often a reply being written tells the thread's readers again; its signal lasts longer. */
const typingInterval = 2500;
/** One draft per composer target, kept in the credential scope's registry while it lasts. */
const draftOf = Atom.family((_key: string) => Atom.make(empty).pipe(Atom.keepAlive));
export interface ComposerController {
  /** The markdown being written, kept when the composer unmounts and remounts. */
  readonly draft: Accessor<string>;
  /** Replace the draft's text; a failure shown for the previous one clears. */
  readonly setDraft: (text: string) => void;
  /** The members the draft mentions: those its text still links to. */
  readonly mentions: Accessor<ReadonlyArray<string>>;
  /** The draft has text and nothing is sending. */
  readonly ready: Accessor<boolean>;
  readonly pending: Accessor<boolean>;
  /** Why the last send failed; the draft is kept for another try. */
  readonly error: Accessor<WorkspaceFailure | undefined>;
  /** Send the draft with its mentions; it clears once the message is posted. */
  readonly send: () => void;
}
type Target =
  | { readonly kind: "start"; readonly groupId: string }
  | { readonly kind: "direct"; readonly memberIds: ReadonlyArray<string> }
  | { readonly kind: "reply"; readonly threadId: string };
const targetKey = (target: Target) =>
  target.kind === "start"
    ? target.groupId
    : target.kind === "direct"
      ? target.memberIds.toSorted().join(",")
      : target.threadId;
function compose(
  workspaceId: string,
  target: Target,
  posted?: (groupId: string) => void,
): ComposerController {
  const session = useSession();
  const draftAtom = draftOf(`${workspaceId}\u0000${targetKey(target)}\u0000${target.kind}`);
  const draft = useAtomValue(() => draftAtom),
    write = useAtomSet(() => draftAtom);
  const [error, setError] = createSignal<WorkspaceFailure>();
  const mentions = () => ThreadMessage.mentionedIn(draft().text);
  const request = useRequest(
    postRequest(useApiClient(), workspaceId),
    (exit, post) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      if (draft().text === post.text) write(empty);
      else write({ text: draft().text });
      if (exit.value.groupId !== undefined) posted?.(exit.value.groupId);
    },
    { when: () => session.session !== undefined },
  );
  const ready = () => isMessageText(draft().text) && !request.pending();
  // Replying tells the thread's readers the reader is typing, at most every so often.
  const typing =
    target.kind === "reply"
      ? useRequest(typingRequest(useApiClient(), workspaceId), () => {}, {
          when: () => session.session !== undefined,
        })
      : undefined;
  let typedAt = 0;
  const typed = (previous: string, text: string) => {
    if (!typing || target.kind !== "reply" || text.length <= previous.length) return;
    const now = Date.now();
    if (now - typedAt < typingInterval || !isMessageText(text)) return;
    typedAt = now;
    typing.run(target.threadId);
  };
  return {
    draft: () => draft().text,
    setDraft: (text) => {
      const previous = draft().text;
      write({ ...draft(), text });
      setError(undefined);
      typed(previous, text);
    },
    mentions,
    ready,
    pending: request.pending,
    error,
    send: () => {
      if (!ready()) return;
      const text = draft().text,
        addressed = mentions();
      const body = JSON.stringify([text, addressed]);
      // A retry of the same message keeps its key, so a post that succeeded unseen is not repeated.
      const attempt =
        draft().attempt?.body === body ? draft().attempt! : { body, key: newPostKey() };
      write({ ...draft(), attempt });
      setError(undefined);
      request.run({ ...target, text, mentions: addressed, key: attempt.key } as Post);
    },
  };
}
/** Start a thread in a group from a kept draft. */
export const useNewThread = (workspaceId: string, groupId: string) =>
  compose(workspaceId, { kind: "start", groupId });
/**
 * Write the first message to some people, which starts a thread in their direct group, creating
 * the group when they have none. `started` receives the group once the message is posted.
 */
export const useDirectMessage = (
  workspaceId: string,
  memberIds: ReadonlyArray<string>,
  started: (groupId: string) => void,
) => compose(workspaceId, { kind: "direct", memberIds }, started);
/** Reply in a thread from a kept draft. */
export const useReply = (workspaceId: string, threadId: string) =>
  compose(workspaceId, { kind: "reply", threadId });
