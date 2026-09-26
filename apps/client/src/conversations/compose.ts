import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { Atom } from "effect/unstable/reactivity";
import { createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { isMessageText, newPostKey, postRequest, type Post } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { typingRequest } from "../api/typing.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

/** Someone a draft mentioned, and the name its text shows them by after `@`. */
export interface Mentioned {
  readonly memberId: string;
  readonly name: string;
}
interface Draft {
  readonly text: string;
  readonly mentioned: ReadonlyArray<Mentioned>;
}
const empty: Draft = { text: "", mentioned: [] };
/** How often a reply being written tells the thread's readers again; its signal lasts longer. */
const typingInterval = 2500;
/** One draft per composer target, kept in the credential scope's registry while it lasts. */
const draftOf = Atom.family((_key: string) => Atom.make(empty).pipe(Atom.keepAlive));
/** The members whose `@name` a text still contains, each once, in the order first mentioned. */
export const mentionsIn = (text: string, mentioned: ReadonlyArray<Mentioned>) => [
  ...new Set(
    mentioned
      .filter((entry) =>
        new RegExp(`(^|\\s)@${escape(entry.name)}(?=$|[\\s.,;:!?)])`, "u").test(text),
      )
      .map((entry) => entry.memberId),
  ),
];
const escape = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

export interface ComposerController {
  /** The text being written, kept when the composer unmounts and remounts. */
  readonly draft: Accessor<string>;
  /** Replace the draft's text; a failure shown for the previous one clears. */
  readonly setDraft: (text: string) => void;
  /** Record that the text now mentions a member by `@name`. */
  readonly mention: (memberId: string, name: string) => void;
  /** The members the draft mentions: those whose `@name` is still in its text. */
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
  | { readonly kind: "reply"; readonly threadId: string };
function compose(workspaceId: string, target: Target): ComposerController {
  const session = useSession();
  const draftAtom = draftOf(
    `${workspaceId}\u0000${target.kind === "start" ? target.groupId : target.threadId}\u0000${target.kind}`,
  );
  const draft = useAtomValue(() => draftAtom),
    write = useAtomSet(() => draftAtom);
  const [error, setError] = createSignal<WorkspaceFailure>();
  const mentions = () => mentionsIn(draft().text, draft().mentioned);
  // A retry of the same message keeps its key, so a post that succeeded unseen is not repeated.
  let attempt: { readonly body: string; readonly key: ReturnType<typeof newPostKey> } | undefined;
  const request = useRequest(
    postRequest(useApiClient(), workspaceId),
    (exit, post) => {
      if (Exit.isFailure(exit)) {
        setError(workspaceFailure(exit.cause));
        return;
      }
      attempt = undefined;
      if (draft().text === post.text) write(empty);
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
    mention: (memberId, name) =>
      write({
        ...draft(),
        mentioned: [
          ...draft().mentioned.filter((entry) => entry.memberId !== memberId),
          { memberId, name },
        ],
      }),
    mentions,
    ready,
    pending: request.pending,
    error,
    send: () => {
      if (!ready()) return;
      const text = draft().text,
        addressed = mentions();
      const body = JSON.stringify([text, addressed]);
      if (attempt?.body !== body) attempt = { body, key: newPostKey() };
      setError(undefined);
      request.run({ ...target, text, mentions: addressed, key: attempt.key } as Post);
    },
  };
}
/** Start a thread in a group from a kept draft. */
export const useNewThread = (workspaceId: string, groupId: string) =>
  compose(workspaceId, { kind: "start", groupId });
/** Reply in a thread from a kept draft. */
export const useReply = (workspaceId: string, threadId: string) =>
  compose(workspaceId, { kind: "reply", threadId });
