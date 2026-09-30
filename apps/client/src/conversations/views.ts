import { useAtomValue } from "@effect/atom-solid";
import { Option } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createEffect, createMemo, createSignal, on, type Accessor } from "solid-js";
import { agentsReads } from "../api/agents.ts";
import { useApiClient } from "../api/context.tsx";
import {
  Group,
  type GroupMembership,
  type Member,
  type Thread,
  ThreadMessage,
  type ThreadTimeline,
} from "../api/conversations.ts";
import type { WorkspaceFailure } from "../api/failures.ts";
import { useWorkspace } from "../session/directory.tsx";
import type { TurnState } from "../turns/views.ts";
import { useMarkGroupRead, useMarkThreadRead } from "./read.ts";
import {
  useGroupRoster,
  useGroupStream,
  useGroups,
  useMembers,
  useThreadTimeline,
} from "./reads.ts";
import { toDate } from "./time.ts";
import { useTyping } from "./typing.ts";

/**
 * What people in a workspace call a member: the name they chose there, or the identity they sign
 * in as until they choose one. Someone no longer in the workspace reads as "Former member".
 */
export const memberName = (member: Member.Record | undefined) =>
  member === undefined ? "Former member" : (member.name ?? member.identity.id);

/** Someone who wrote a message, as a timeline shows them. */
export interface Author {
  /** Their member ID; absent for a contact outside the workspace. */
  readonly id?: string;
  readonly name: string;
  readonly agent: boolean;
}
/** A member a message mentions, by the name the reader knows them by now. */
export interface MentionedMember {
  readonly id: string;
  readonly name: string;
}

/** Why a conversation shows no entries: still loading, closed to the reader, or failed. */
export type ConversationStatus = "loading" | "unavailable" | "failed";

/**
 * Whether a live read lost its access: a refresh answered that what it reads is gone or denied,
 * and nothing has loaded since. Its last value stays in the read, so a view that kept showing it
 * would show what the reader may no longer see. A later success clears it.
 */
function useLostAccess(read: {
  readonly value: Accessor<unknown>;
  readonly failure: Accessor<WorkspaceFailure | undefined>;
}): Accessor<boolean> {
  const [lost, setLost] = createSignal(false);
  // A read keeps its last success through refreshes and failures, so only a new value clears.
  const value = createMemo(() => read.value());
  createEffect(on(value, () => setLost(false), { defer: true }));
  createEffect(() => {
    const failure = read.failure();
    if (failure === "gone" || failure === "denied") setLost(true);
  });
  return lost;
}
/** A read's status for a conversation view, or undefined once it shows entries. */
function statusOf(
  read: {
    readonly value: Accessor<unknown>;
    readonly failure: Accessor<WorkspaceFailure | undefined>;
  },
  lost: Accessor<boolean>,
): Accessor<ConversationStatus | undefined> {
  return () => {
    if (lost()) return "unavailable";
    if (read.value() !== undefined) return undefined;
    const failure = read.failure();
    if (failure === "gone" || failure === "denied") return "unavailable";
    return failure ? "failed" : "loading";
  };
}

/** The members of a workspace by name, and the reader among them. */
export function usePeople(workspaceId: string) {
  const members = useMembers(workspaceId);
  const self = useWorkspace(() => workspaceId);
  const selfId = () => self()?.member.id as string | undefined;
  const authorOf = (author: Thread.Record["createdBy"]): Author => {
    if (author._tag === "Contact") return { name: "Contact", agent: false };
    const member = members.member(author.memberId);
    return {
      id: author.memberId,
      name: memberName(member),
      agent: member?.identity._tag === "Agent",
    };
  };
  /**
   * The members a message's text mentions, named as they are now. Someone no longer in the
   * workspace is left out, and shows by the name the text recorded.
   */
  const mentionsOf = (text: string): MentionedMember[] =>
    ThreadMessage.mentionedIn(text).flatMap((id) => {
      const member = members.member(id);
      return member === undefined ? [] : [{ id, name: memberName(member) }];
    });
  return {
    member: members.member,
    all: members.all,
    selfId,
    name: (memberId: string) => memberName(members.member(memberId)),
    authorOf,
    mentionsOf,
  };
}

/** One of the reader's groups, as navigation and headers show it. */
export interface GroupEntry {
  readonly id: string;
  readonly kind: "team" | "direct";
  /** A team's name, or a direct group's other people. */
  readonly name: string;
  readonly visibility?: "public" | "private";
  /** The workspace's general group, which everyone belongs to and people never leave. */
  readonly general: boolean;
  /** When any of its threads last had activity. */
  readonly latestAt: Date | undefined;
  /** For a direct group: its other members. */
  readonly memberIds: ReadonlyArray<string>;
  /** Notifications addressed to the reader from the group's threads. */
  readonly pending: number;
  /** Activity the reader has not seen. */
  readonly unread: boolean;
  readonly following: boolean;
  /** The reader may add people. */
  readonly manageable: boolean;
  /** The reader may remove others. */
  readonly membersRemovable: boolean;
  readonly renamable: boolean;
}

/** The reader's groups, teams by name and direct groups by their other people, live while mounted. */
export function useWorkspaceGroups(workspaceId: string) {
  const groups = useGroups(workspaceId);
  const people = usePeople(workspaceId);
  const entryOf = (item: Group.ListItem): GroupEntry => {
    const group = item.group;
    const others =
      group.kind === "Direct" ? group.memberIds.filter((id) => id !== people.selfId()) : [];
    return {
      id: group.id,
      kind: group.kind === "Team" ? "team" : "direct",
      name: group.kind === "Team" ? group.name : others.map(people.name).join(", ") || "Only you",
      visibility:
        group.kind === "Team" ? (group.visibility === "Public" ? "public" : "private") : undefined,
      general: Group.isGeneral(group),
      latestAt: item.latestActivityAt === null ? undefined : toDate(item.latestActivityAt),
      memberIds: others,
      pending: item.pending,
      unread: item.newActivity,
      following: item.following,
      manageable: item.manageable,
      membersRemovable: item.membersRemovable,
      renamable: item.renamable,
    };
  };
  const entries = createMemo(() => groups.value()?.map(entryOf));
  const latest = (entry: GroupEntry) => entry.latestAt?.getTime() ?? 0;
  return {
    /** Every group once loaded, in the host's order. */
    all: entries,
    /** Team groups, the general group first and then by name. */
    teams: () =>
      (entries() ?? [])
        .filter((entry) => entry.kind === "team")
        .toSorted(
          (left, right) =>
            Number(right.general) - Number(left.general) || left.name.localeCompare(right.name),
        ),
    /** Direct groups, the most recently active first. */
    directs: () =>
      (entries() ?? [])
        .filter((entry) => entry.kind === "direct")
        .toSorted(
          (left, right) => latest(right) - latest(left) || left.name.localeCompare(right.name),
        ),
    /** One group, once loaded. */
    group: (groupId: string) => entries()?.find((entry) => entry.id === groupId),
    /** The direct group of exactly these other members, if the reader has one. */
    directWith: (memberIds: ReadonlyArray<string>) => {
      const wanted = new Set(memberIds);
      return entries()?.find(
        (entry) =>
          entry.kind === "direct" &&
          entry.memberIds.length === wanted.size &&
          entry.memberIds.every((id) => wanted.has(id)),
      );
    },
    loading: groups.loading,
    failure: groups.failure,
    retry: groups.retry,
  };
}

/** A thread as its group's stream shows it: the message that opened it and its replies. */
export interface StreamEntry {
  readonly kind: "message";
  /** The thread's ID. */
  readonly id: string;
  readonly author: Author;
  readonly at: Date;
  /** Markdown, whose mentions link to members by id. */
  readonly text: string;
  readonly mentions: ReadonlyArray<MentionedMember>;
  readonly thread: {
    readonly replies: number;
    readonly unread: boolean;
    /** The names of people typing a reply now. */
    readonly typing: ReadonlyArray<string>;
  };
}

/**
 * A group's stream: each thread's opening message, oldest shown first and live while mounted, with
 * its replies, whether they are unread, and who is typing. While mounted and visible it catches
 * the reader up with the group whenever the group has something new.
 */
export function useGroupConversation(workspaceId: string, groupId: string) {
  const stream = useGroupStream(workspaceId, groupId);
  const people = usePeople(workspaceId);
  const groups = useGroups(workspaceId);
  const typing = useTyping(workspaceId);
  const lost = useLostAccess(stream);
  useMarkGroupRead(workspaceId, groupId, () => {
    const item = groups.value()?.find((entry) => entry.group.id === groupId);
    return item?.newActivity && item.latestActivityAt
      ? toDate(item.latestActivityAt).getTime()
      : undefined;
  });
  const entryOf = (opening: Thread.Opening): StreamEntry => ({
    kind: "message",
    id: opening.thread.id,
    author: people.authorOf(opening.message.author),
    at: toDate(opening.message.publishedAt),
    text: opening.message.text,
    mentions: people.mentionsOf(opening.message.text),
    thread: {
      replies: opening.replies,
      unread: opening.unread,
      typing: typing(opening.thread.id).map(people.name),
    },
  });
  const entries = createMemo(() => (lost() ? [] : (stream.value() ?? []).map(entryOf)));
  return {
    entries,
    status: statusOf(stream, lost),
    /** Older threads remain to load. */
    earlier: () => !stream.complete() && stream.value() !== undefined && !lost(),
    loadingEarlier: stream.loadingEarlier,
    earlierFailed: stream.earlierFailed,
    loadEarlier: stream.loadEarlier,
    retry: stream.retry,
  };
}

/** A thread's message as its timeline shows it. */
export interface ThreadMessageEntry {
  readonly kind: "message";
  readonly id: string;
  readonly author: Author;
  readonly at: Date;
  /** Markdown, whose mentions link to members by id. */
  readonly text: string;
  readonly mentions: ReadonlyArray<MentionedMember>;
  /** For an agent's reply, the turn that posted it, whose log tells how it came about. */
  readonly turn?: { readonly id: string };
}
/** How someone's part in a thread changed. Joining by writing or a mention shows in the message. */
export type ParticipationChange =
  | "followed"
  | "unfollowed"
  | "left-group"
  | "removed-from-group"
  | "removed-from-workspace";
/** Someone following a thread or ending their part in it. */
export interface ThreadNoteEntry {
  readonly kind: "note";
  readonly id: string;
  readonly at: Date;
  readonly change: ParticipationChange;
  readonly who: string;
  /** It happened to the reader. */
  readonly self: boolean;
}
/**
 * An agent's turn where it took on the work, as it went since: waiting, working, or how it ended.
 * A turn that replied shows as its replies instead.
 */
export interface ThreadTurnEntry {
  readonly kind: "turn";
  /** The turn's ID. */
  readonly id: string;
  /** When the agent took on the work. */
  readonly at: Date;
  /** The agent, with its ID when the reader may see it. */
  readonly agent: { readonly id?: string; readonly memberId: string; readonly name: string };
  readonly state: TurnState;
  /** Why it failed, as the host worded it. */
  readonly failure?: string;
  /** Why it stopped or is stopping: someone asked, or its agent stopped taking part. */
  readonly stoppedBy?: "request" | "departure";
  /** The reader may ask it to stop now. */
  readonly stoppable: boolean;
  /**
   * The reader may run it again now: it failed or was stopped on request, it is its agent's latest
   * turn in the thread, and the agent still takes part.
   */
  readonly retryable: boolean;
}
export type ThreadEntry = ThreadMessageEntry | ThreadNoteEntry | ThreadTurnEntry;

type Published = Extract<ThreadTimeline.Item, { readonly message: unknown }>;
type Participation = Extract<ThreadTimeline.Item, { readonly participant: unknown }>;
type TurnItem = Exclude<ThreadTimeline.Item, Published | Participation>;
const isMessage = (item: ThreadTimeline.Item): item is Published => "message" in item;
const isParticipation = (item: ThreadTimeline.Item): item is Participation => "participant" in item;

/**
 * Which agents the reader may see, by member ID, with whether they may direct each, live while
 * mounted. It shares the Agents page's read.
 */
function useAgentAccess(workspaceId: string) {
  const reads = agentsReads(useApiClient(), workspaceId);
  const read = reads ? useAtomValue(() => reads.agents) : undefined;
  const byMember = createMemo(
    () =>
      new Map(
        (read === undefined ? [] : (Option.getOrUndefined(AsyncResult.value(read())) ?? [])).map(
          (view) => [view.memberId as string, { id: view.id as string, usable: view.usable }],
        ),
      ),
  );
  return { of: (memberId: string) => byMember().get(memberId) };
}

/** A turn as its timeline items tell it so far. */
interface TurnSoFar {
  readonly id: string;
  readonly memberId: string;
  readonly at: Date;
  readonly sequence: number;
  state: TurnState;
  failure?: string;
  stoppedBy?: "request" | "departure";
  replied: boolean;
}
const stoppedBy = (reason: "requested" | "participation-ended" | null) =>
  reason === null ? undefined : reason === "participation-ended" ? "departure" : "request";

/** Carry a turn's later item into what it tells so far; its creation began it. */
function advance(turn: TurnSoFar, item: TurnItem) {
  const activity = item.activity;
  if (activity.kind === "turn.started") turn.state = "working";
  else if (activity.kind === "turn.stopping") {
    turn.state = "stopping";
    turn.stoppedBy = stoppedBy(activity.details.cancelReason);
  } else if (activity.kind === "turn.ended") {
    const details = activity.details;
    turn.state =
      details.outcome === "completed"
        ? "done"
        : details.outcome === "failed"
          ? "failed"
          : "stopped";
    turn.failure = details.reason ?? undefined;
    turn.stoppedBy = stoppedBy(details.cancelReason);
    turn.replied = details.messageIds.length > 0;
  }
}
const changes = {
  unfollowed: "unfollowed",
  "group-left": "left-group",
  "group-removed": "removed-from-group",
  "workspace-removed": "removed-from-workspace",
} as const satisfies Record<string, ParticipationChange>;

/**
 * One thread's timeline from its newest activity, oldest shown first and live while mounted: its
 * messages, notes where people followed it or stopped taking part, and agents' turns where they
 * took on work, until they reply. Pages read back from the newest, so a turn loaded with its start
 * has everything after it loaded too. While mounted and visible
 * it reads the thread through the newest activity shown. Given `focus`, a timeline position such
 * as the message that notified the reader, it reads back until that message is loaded.
 */
export function useThreadConversation(
  workspaceId: string,
  threadId: string,
  focus?: Accessor<number | undefined>,
) {
  const timeline = useThreadTimeline(workspaceId, threadId);
  const people = usePeople(workspaceId);
  const typing = useTyping(workspaceId);
  const agents = useAgentAccess(workspaceId);
  const lost = useLostAccess(timeline);
  useMarkThreadRead(workspaceId, threadId, () => timeline.value()?.at(-1)?.activity.sequence);
  const noteOf = (item: Participation): ThreadNoteEntry => {
    const participant = item.participant.participant;
    const self = participant._tag === "Member" && participant.memberId === people.selfId();
    return {
      kind: "note",
      id: item.activity.id,
      at: toDate(item.activity.occurredAt),
      change:
        item.activity.kind === "participation.followed"
          ? "followed"
          : changes[item.activity.details.reason],
      who:
        participant._tag === "Member"
          ? people.name(participant.memberId)
          : participant._tag === "Contact"
            ? "A contact"
            : "Triage",
      self,
    };
  };
  const entries = createMemo((): ReadonlyArray<ThreadEntry> => {
    if (lost()) return [];
    const shown: Array<ThreadMessageEntry | ThreadNoteEntry | TurnSoFar> = [];
    const turns = new Map<string, TurnSoFar>();
    /** Each agent's latest turn, and the last time it stopped taking part. */
    const latest = new Map<string, string>();
    const departed = new Map<string, number>();
    for (const item of timeline.value() ?? []) {
      if (isMessage(item))
        shown.push({
          kind: "message",
          id: item.message.id,
          author: people.authorOf(item.message.author),
          at: toDate(item.message.publishedAt),
          text: item.message.text,
          mentions: people.mentionsOf(item.message.text),
          ...(item.message.turnId === null ? {} : { turn: { id: item.message.turnId } }),
        });
      else if (isParticipation(item)) {
        const participant = item.participant.participant;
        if (item.activity.kind !== "participation.followed" && participant._tag === "Member")
          departed.set(participant.memberId, item.activity.sequence);
        shown.push(noteOf(item));
      } else if (item.activity.kind === "turn.created") {
        const details = item.activity.details;
        const turn: TurnSoFar = {
          id: details.turnId,
          memberId: details.memberId,
          at: toDate(item.activity.occurredAt),
          sequence: item.activity.sequence,
          state: "queued",
          replied: false,
        };
        turns.set(turn.id, turn);
        latest.set(turn.memberId, turn.id);
        shown.push(turn);
      } else {
        // A turn that began before the pages loaded shows once they reach its start.
        const turn = turns.get(item.activity.details.turnId);
        if (turn !== undefined) advance(turn, item);
      }
    }
    return shown.flatMap((entry): ReadonlyArray<ThreadEntry> => {
      if ("kind" in entry) return [entry];
      const turn = entry;
      if (turn.state === "done" && turn.replied) return [];
      const agent = agents.of(turn.memberId);
      const usable = agent?.usable === true;
      return [
        {
          kind: "turn",
          id: turn.id,
          at: turn.at,
          agent: {
            ...(agent === undefined ? {} : { id: agent.id }),
            memberId: turn.memberId,
            name: people.name(turn.memberId),
          },
          state: turn.state,
          ...(turn.failure === undefined ? {} : { failure: turn.failure }),
          ...(turn.stoppedBy === undefined ? {} : { stoppedBy: turn.stoppedBy }),
          stoppable: usable && (turn.state === "queued" || turn.state === "working"),
          retryable:
            usable &&
            (turn.state === "failed" ||
              (turn.state === "stopped" && turn.stoppedBy === "request")) &&
            latest.get(turn.memberId) === turn.id &&
            (departed.get(turn.memberId) ?? 0) < turn.sequence,
        },
      ];
    });
  });
  // Read back until the position to show is loaded, one page at a time.
  createEffect(() => {
    const target = focus?.(),
      first = timeline.value()?.[0];
    if (target === undefined || first === undefined || timeline.complete()) return;
    if (first.activity.sequence > target && !timeline.loadingEarlier()) timeline.loadEarlier();
  });
  return {
    entries,
    status: statusOf(timeline, lost),
    /** The message at `focus`, once loaded. */
    focusId: () => {
      const target = focus?.();
      const item = timeline.value()?.find((entry) => entry.activity.sequence === target);
      return item && isMessage(item) ? (item.message.id as string) : undefined;
    },
    /**
     * Why the message at `focus` notified the reader, as the inbox says: it mentions them, it
     * started the thread, or it replied.
     */
    focusReason: (): "mention" | "reply" | "thread" | undefined => {
      const target = focus?.();
      const item = timeline.value()?.find((entry) => entry.activity.sequence === target);
      if (!item || !isMessage(item)) return undefined;
      const self = people.selfId();
      if (item.message.mentions.some((memberId) => memberId === self)) return "mention";
      return item.activity.sequence === 1 ? "thread" : "reply";
    },
    /** The names of people typing a reply now. */
    typing: () => typing(threadId).map(people.name),
    earlier: () => !timeline.complete() && timeline.value() !== undefined && !lost(),
    loadingEarlier: timeline.loadingEarlier,
    earlierFailed: timeline.earlierFailed,
    loadEarlier: timeline.loadEarlier,
    retry: timeline.retry,
  };
}

/** Someone a message can mention, as a composer suggests them after `@`. */
export interface MentionCandidate {
  readonly id: string;
  readonly name: string;
  readonly agent: boolean;
}
/** A group's other members, whom its messages can mention, live while mounted. */
export function useMentionCandidates(
  workspaceId: string,
  groupId: string,
): Accessor<ReadonlyArray<MentionCandidate>> {
  const roster = useGroupRoster(workspaceId, groupId);
  const people = usePeople(workspaceId);
  return createMemo(() =>
    (roster.value() ?? []).flatMap((admission) => {
      if (admission.memberId === people.selfId()) return [];
      const member = people.member(admission.memberId);
      return [
        {
          id: admission.memberId,
          name: memberName(member),
          agent: member?.identity._tag === "Agent",
        },
      ];
    }),
  );
}

/** A group's member, as its settings list them. */
export interface RosterEntry {
  /** The membership's ID, which removing takes. */
  readonly id: string;
  readonly memberId: string;
  readonly name: string;
  readonly agent: boolean;
  /** The reader. */
  readonly you: boolean;
  /** The reader may remove them. */
  readonly removable: boolean;
}
/**
 * A group's members for its settings, the reader first, then by name; and the workspace's other
 * active members, who can be added. `members` is a `useGroupMembers` controller for the group.
 */
export function useGroupPeople(
  workspaceId: string,
  members: {
    readonly roster: Accessor<ReadonlyArray<GroupMembership.Record> | undefined>;
    readonly membersRemovable: Accessor<boolean>;
    /** The workspace's general group, which nobody is removed from. */
    readonly general?: Accessor<boolean>;
  },
) {
  const people = usePeople(workspaceId);
  const roster = createMemo((): ReadonlyArray<RosterEntry> =>
    (members.roster() ?? [])
      .map((admission) => {
        const member = people.member(admission.memberId);
        const you = admission.memberId === people.selfId();
        return {
          id: admission.id,
          memberId: admission.memberId,
          name: memberName(member),
          agent: member?.identity._tag === "Agent",
          you,
          removable: !you && members.membersRemovable() && !members.general?.(),
        };
      })
      .toSorted((left, right) =>
        left.you !== right.you ? (left.you ? -1 : 1) : left.name.localeCompare(right.name),
      ),
  );
  const candidates = createMemo((): ReadonlyArray<MentionCandidate> => {
    const inGroup = new Set(roster().map((entry) => entry.memberId));
    return (people.all() ?? [])
      .filter((member) => member.status === "active" && !inGroup.has(member.id))
      .map((member) => ({
        id: member.id,
        name: memberName(member),
        agent: member.identity._tag === "Agent",
      }));
  });
  return { roster, candidates };
}

/** A workspace member as their profile card shows them. */
export interface MemberProfile {
  readonly id: string;
  readonly name: string;
  readonly kind: "person" | "agent";
  /** The reader themself. */
  readonly you: boolean;
  /** Removed from the workspace; they keep their name. */
  readonly former: boolean;
  /** An agent's own ID, where its page is. */
  readonly agentId?: string;
}

/**
 * Members as their profile cards show them, by member ID and never by name, live while mounted.
 * Undefined for someone the reader's workspace does not know.
 */
export function useMemberProfiles(workspaceId: string) {
  const people = usePeople(workspaceId);
  return (memberId: string): MemberProfile | undefined => {
    const member = people.member(memberId);
    if (member === undefined) return undefined;
    return {
      id: member.id,
      name: memberName(member),
      kind: member.identity._tag === "Agent" ? "agent" : "person",
      you: member.id === people.selfId(),
      former: member.status === "removed",
      ...(member.identity._tag === "Agent" ? { agentId: member.identity.id } : {}),
    };
  };
}

/** The workspace's other active members and agents, whom the reader can message or add. */
export function useWorkspacePeople(workspaceId: string): Accessor<ReadonlyArray<MentionCandidate>> {
  const people = usePeople(workspaceId);
  return createMemo(() =>
    (people.all() ?? [])
      .filter((member) => member.status === "active" && member.id !== people.selfId())
      .map((member) => ({
        id: member.id,
        name: memberName(member),
        agent: member.identity._tag === "Agent",
      })),
  );
}

/** A row under Direct messages: a conversation the reader has, or a teammate not yet messaged. */
export interface DirectEntry {
  /** The direct group's ID, or the teammate's member ID. */
  readonly id: string;
  readonly kind: "conversation" | "teammate";
  /** The conversation's other people, or the teammate. */
  readonly name: string;
  /** The conversation's other members, or the teammate alone. */
  readonly memberIds: ReadonlyArray<string>;
  readonly pending: number;
  readonly unread: boolean;
}

/**
 * What Direct messages lists: the reader's conversations, the most recently active first, then
 * up to `suggestions` teammates, people and agents, whom the reader has no one-to-one
 * conversation with yet, by name. A teammate's row opens a first message; the conversation starts
 * when it is sent.
 */
export function useDirectMessages(workspaceId: string, suggestions = 6) {
  const groups = useWorkspaceGroups(workspaceId);
  const people = useWorkspacePeople(workspaceId);
  return createMemo((): ReadonlyArray<DirectEntry> => {
    const conversations = groups.directs();
    const messaged = new Set(
      conversations.flatMap((entry) => (entry.memberIds.length === 1 ? entry.memberIds : [])),
    );
    const teammates = people()
      .filter((person) => !messaged.has(person.id))
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .slice(0, suggestions);
    return [
      ...conversations.map((entry) => ({
        id: entry.id,
        kind: "conversation" as const,
        name: entry.name,
        memberIds: entry.memberIds,
        pending: entry.pending,
        unread: entry.unread,
      })),
      ...teammates.map((person) => ({
        id: person.id,
        kind: "teammate" as const,
        name: person.name,
        memberIds: [person.id],
        pending: 0,
        unread: false,
      })),
    ];
  });
}
