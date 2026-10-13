import type { MentionCandidate } from "@amends-dev/ui/components/composer"
import type { MessageAuthor } from "@amends-dev/ui/components/message"
import type { Profile } from "@amends-dev/ui/components/profile-card"
import type { RichTextMention } from "@amends-dev/ui/components/rich-text"
import type { TurnState } from "@amends-dev/ui/components/turn-status"
import type { ConversationStatus, GroupVisibility, SettingsMember } from "@amends-dev/ui/screens/group"
import type { ParticipationChange, TimelineMessage, TimelineNote, TimelineTurn } from "@amends-dev/ui/screens/timeline"
import { useAtomValue } from "@effect/atom-solid/Hooks"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { createEffect, createMemo, createSignal, on, type Accessor } from "solid-js"
import { agentsReads } from "../agents/api.ts"
import type { WorkspaceFailure } from "../api/failures.ts"
import { useWorkspaceClient } from "../provider.tsx"
import { useWorkspace } from "../session/directory.tsx"
import {
  Group,
  type GroupMembership,
  type Member,
  type Thread,
  ThreadMessage,
  type ThreadTimeline,
  ThreadParticipation,
  Identity
} from "./api.ts"
import { useMarkGroupRead, useMarkThreadRead } from "./read.ts"
import { useGroupRoster, useGroupStream, useGroups, useMembers, useThreadTimeline } from "./reads.ts"
import { toDate } from "./time.ts"
import { useTyping } from "./typing.ts"

/**
 * What people in a workspace call a member. Someone no longer in the workspace reads as "Former
 * member".
 */
export const memberName = (member: Member.Member | undefined) => (member === undefined ? "Former member" : member.name)

/**
 * Whether a live read lost its access: a refresh answered that what it reads is gone or denied,
 * and nothing has loaded since. Its last value stays in the read, so a view that kept showing it
 * would show what the reader may no longer see. A later success clears it.
 */
function useLostAccess(read: {
  readonly value: Accessor<unknown>
  readonly failure: Accessor<WorkspaceFailure | undefined>
}): Accessor<boolean> {
  const [lost, setLost] = createSignal(false)
  // A read keeps its last success through refreshes and failures, so only a new value clears.
  const value = createMemo(() => read.value())
  createEffect(on(value, () => setLost(false), { defer: true }))
  createEffect(() => {
    const failure = read.failure()
    if (failure === "gone" || failure === "denied") setLost(true)
  })
  return lost
}
/** A read's status for a conversation view, or undefined once it shows entries. */
function statusOf(
  read: {
    readonly value: Accessor<unknown>
    readonly failure: Accessor<WorkspaceFailure | undefined>
  },
  lost: Accessor<boolean>
): Accessor<ConversationStatus | undefined> {
  return () => {
    if (lost()) return "unavailable"
    if (read.value() !== undefined) return undefined
    const failure = read.failure()
    if (failure === "gone" || failure === "denied") return "unavailable"
    return failure ? "failed" : "loading"
  }
}

/** The members of a workspace by name, and the reader among them. */
export function usePeople(workspaceId: string) {
  const members = useMembers(workspaceId)
  const self = useWorkspace(() => workspaceId)
  const selfId = () => self()?.member.id as string | undefined
  const authorOf = (author: Thread.Thread["createdBy"]): MessageAuthor => {
    if (ThreadMessage.Author.isAnyOf(["Contact"])(author)) return { name: "Contact", agent: false }
    const member = members.member(author.memberId)
    return {
      id: author.memberId,
      name: memberName(member),
      agent: Predicate.isTagged(member?.identity, "Agent")
    }
  }
  /**
   * The members a message's text mentions, named as they are now. Someone no longer in the
   * workspace is left out, and shows by the name the text recorded.
   */
  const mentionsOf = (text: string): Array<RichTextMention> =>
    ThreadMessage.mentionedIn(text).flatMap((id) => {
      const member = members.member(id)
      return member === undefined ? [] : [{ id, name: memberName(member) }]
    })
  return {
    member: members.member,
    all: members.all,
    selfId,
    name: (memberId: string) => memberName(members.member(memberId)),
    authorOf,
    mentionsOf
  }
}

/** One of the reader's groups, as navigation and headers show it. */
export interface GroupEntry {
  readonly id: string
  readonly kind: "team" | "direct"
  /** A team's name, or a direct group's other people. */
  readonly name: string
  readonly visibility?: GroupVisibility
  /** The workspace's general group, which everyone belongs to and people never leave. */
  readonly general: boolean
  /** When any of its threads last had activity. */
  readonly latestAt: Date | undefined
  /** For a direct group: its other members. */
  readonly memberIds: ReadonlyArray<string>
  /** Notifications addressed to the reader from the group's threads. */
  readonly pending: number
  /** Activity the reader has not seen. */
  readonly unread: boolean
  readonly following: boolean
  /** The reader may add people. */
  readonly manageable: boolean
  /** The reader may remove others. */
  readonly membersRemovable: boolean
  readonly renamable: boolean
}

/** The reader's groups, teams by name and direct groups by their other people, live while mounted. */
export function useWorkspaceGroups(workspaceId: string) {
  const groups = useGroups(workspaceId)
  const people = usePeople(workspaceId)
  const entryOf = (item: Group.ListItem): GroupEntry => {
    const group = item.group
    const others = group.kind === "Direct" ? group.memberIds.filter((id) => id !== people.selfId()) : []
    return {
      id: group.id,
      kind: group.kind === "Team" ? "team" : "direct",
      name: group.kind === "Team" ? group.name : others.map(people.name).join(", ") || "Only you",
      visibility: group.kind === "Team" ? (group.visibility === "Public" ? "public" : "private") : undefined,
      general: Group.isGeneral(group),
      latestAt: item.latestActivityAt === null ? undefined : toDate(item.latestActivityAt),
      memberIds: others,
      pending: item.pending,
      unread: item.newActivity,
      following: item.following,
      manageable: item.manageable,
      membersRemovable: item.membersRemovable,
      renamable: item.renamable
    }
  }
  const entries = createMemo(() => groups.value()?.map(entryOf))
  const latest = (entry: GroupEntry) => entry.latestAt?.getTime() ?? 0
  return {
    /** Every group once loaded, in the host's order. */
    all: entries,
    /** Team groups, the general group first and then by name. */
    teams: () =>
      (entries() ?? [])
        .filter((entry) => entry.kind === "team")
        .toSorted((left, right) => Number(right.general) - Number(left.general) || left.name.localeCompare(right.name)),
    /** Direct groups, the most recently active first. */
    directs: () =>
      (entries() ?? [])
        .filter((entry) => entry.kind === "direct")
        .toSorted((left, right) => latest(right) - latest(left) || left.name.localeCompare(right.name)),
    /** One group, once loaded. */
    group: (groupId: string) => entries()?.find((entry) => entry.id === groupId),
    /** The direct group of exactly these other members, if the reader has one. */
    directWith: (memberIds: ReadonlyArray<string>) => {
      const wanted = new Set(memberIds)
      return entries()?.find(
        (entry) =>
          entry.kind === "direct" &&
          entry.memberIds.length === wanted.size &&
          entry.memberIds.every((id) => wanted.has(id))
      )
    },
    loading: groups.loading,
    failure: groups.failure,
    retry: groups.retry
  }
}

/**
 * A group's stream: each thread's opening message, oldest shown first and live while mounted, with
 * its replies, whether they are unread, and who is typing. While mounted and visible it catches
 * the reader up with the group whenever the group has something new.
 */
export function useGroupConversation(workspaceId: string, groupId: string) {
  const stream = useGroupStream(workspaceId, groupId)
  const people = usePeople(workspaceId)
  const groups = useGroups(workspaceId)
  const typing = useTyping(workspaceId)
  const lost = useLostAccess(stream)
  useMarkGroupRead(workspaceId, groupId, () => {
    const item = groups.value()?.find((entry) => entry.group.id === groupId)
    return item?.newActivity && item.latestActivityAt ? toDate(item.latestActivityAt).getTime() : undefined
  })
  const entryOf = (opening: Thread.Opening): TimelineMessage => ({
    kind: "message",
    id: opening.thread.id,
    author: people.authorOf(opening.message.author),
    at: toDate(opening.message.publishedAt),
    ...shownContent(opening.message.content, people.mentionsOf),
    thread: {
      replies: opening.replies,
      unread: opening.unread,
      typing: typing(opening.thread.id).map(people.name)
    }
  })
  const entries = createMemo(() => (lost() ? [] : (stream.value() ?? []).map(entryOf)))
  return {
    entries,
    status: statusOf(stream, lost),
    /** Older threads remain to load. */
    earlier: () => !stream.complete() && stream.value() !== undefined && !lost(),
    loadingEarlier: stream.loadingEarlier,
    earlierFailed: stream.earlierFailed,
    loadEarlier: stream.loadEarlier,
    retry: stream.retry
  }
}

/** A thread's timeline entry; a turn carries its agent's ID, for the page that fixes its setup. */
export type ThreadEntry =
  | TimelineMessage
  | TimelineNote
  | (Omit<TimelineTurn, "agentHref"> & { readonly agentId?: string })

type MessageItem = Extract<ThreadTimeline.Item, { readonly message: unknown }>
type Published = Extract<MessageItem, { readonly activity: { readonly kind: "message.published" } }>
type Participation = Extract<ThreadTimeline.Item, { readonly participant: unknown }>
type TurnItem = Exclude<ThreadTimeline.Item, MessageItem | Participation>
/** A message's publication, which shows the message as it is now; its edits and deletion do not. */
const isMessage = (item: ThreadTimeline.Item): item is Published => item.activity.kind === "message.published"
const isMessageChange = (item: ThreadTimeline.Item): item is MessageItem => "message" in item
const isParticipation = (item: ThreadTimeline.Item): item is Participation => "participant" in item

/**
 * A message's content as the timeline shows it: its text and mentions, marked edited when they
 * were, or a deleted mark with no text.
 */
const shownContent = (
  content: ThreadMessage.Content,
  mentionsOf: (text: string) => ReadonlyArray<RichTextMention>
): Pick<TimelineMessage, "text" | "mentions" | "edited" | "deleted"> =>
  ThreadMessage.Content.isAnyOf(["Text"])(content)
    ? {
        text: content.text,
        mentions: mentionsOf(content.text),
        ...(content.editedAt === null ? {} : { edited: true })
      }
    : { text: "", deleted: true }

/**
 * Which agents the reader may see, by member ID, with whether they may direct each, live while
 * mounted. It shares the Agents page's read.
 */
function useAgentAccess(workspaceId: string) {
  const reads = agentsReads(useWorkspaceClient(workspaceId), workspaceId)
  const read = reads ? useAtomValue(() => reads.agents) : undefined
  const byMember = createMemo(
    () =>
      new Map(
        (read === undefined ? [] : (Option.getOrUndefined(AsyncResult.value(read())) ?? [])).map((view) => [
          view.memberId as string,
          { id: view.id as string, usable: view.usable }
        ])
      )
  )
  return { of: (memberId: string) => byMember().get(memberId) }
}

/** A turn as its timeline items tell it so far. */
interface TurnSoFar {
  readonly id: string
  readonly memberId: string
  readonly at: Date
  readonly sequence: number
  state: TurnState
  failure?: string
  stoppedBy?: "request" | "departure" | "task"
  replied: boolean
}
const stoppedBy = (reason: "requested" | "participation-ended" | "task-changed" | null) =>
  reason === null
    ? undefined
    : reason === "participation-ended"
      ? "departure"
      : reason === "task-changed"
        ? "task"
        : "request"

/** Carry a turn's later item into what it tells so far; its creation began it. */
function advance(turn: TurnSoFar, item: TurnItem) {
  const activity = item.activity
  if (activity.kind === "turn.started") turn.state = "working"
  else if (activity.kind === "turn.stopping") {
    turn.state = "stopping"
    turn.stoppedBy = stoppedBy(activity.details.cancelReason)
  } else if (activity.kind === "turn.ended") {
    const details = activity.details
    turn.state = details.outcome === "completed" ? "done" : details.outcome === "failed" ? "failed" : "stopped"
    turn.failure = details.reason ?? undefined
    turn.stoppedBy = stoppedBy(details.cancelReason)
    turn.replied = details.messageIds.length > 0
  }
}
const changes = {
  unfollowed: "unfollowed",
  "group-left": "left-group",
  "group-removed": "removed-from-group",
  "workspace-removed": "removed-from-workspace"
} as const satisfies Record<string, ParticipationChange>

/**
 * One thread's timeline from its newest activity, oldest shown first and live while mounted: its
 * messages, notes where people followed it or stopped taking part, and agents' turns where they
 * took on work, until they reply. Pages read back from the newest, so a turn loaded with its start
 * has everything after it loaded too. While mounted and visible
 * it reads the thread through the newest activity shown. Given `focus`, a timeline position such
 * as the message that notified the reader, it reads back until that message is loaded.
 */
export function useThreadConversation(workspaceId: string, threadId: string, focus?: Accessor<number | undefined>) {
  const timeline = useThreadTimeline(workspaceId, threadId)
  const people = usePeople(workspaceId)
  const typing = useTyping(workspaceId)
  const agents = useAgentAccess(workspaceId)
  const lost = useLostAccess(timeline)
  useMarkThreadRead(workspaceId, threadId, () => timeline.value()?.at(-1)?.activity.sequence)
  const noteOf = (item: Participation): TimelineNote => {
    const participant = item.participant.participant
    const self =
      ThreadParticipation.Reference.isAnyOf(["Member"])(participant) && participant.memberId === people.selfId()
    return {
      kind: "note",
      id: item.activity.id,
      at: toDate(item.activity.occurredAt),
      change: item.activity.kind === "participation.followed" ? "followed" : changes[item.activity.details.reason],
      who: ThreadParticipation.Reference.isAnyOf(["Member"])(participant)
        ? people.name(participant.memberId)
        : ThreadParticipation.Reference.isAnyOf(["Contact"])(participant)
          ? "A contact"
          : "Triage",
      self
    }
  }
  const entries = createMemo((): ReadonlyArray<ThreadEntry> => {
    if (lost()) return []
    const shown: Array<TimelineMessage | TimelineNote | TurnSoFar> = []
    const turns = new Map<string, TurnSoFar>()
    /** Each agent's latest turn, and the last time it stopped taking part. */
    const latest = new Map<string, string>()
    const departed = new Map<string, number>()
    for (const item of timeline.value() ?? []) {
      if (isMessage(item))
        shown.push({
          kind: "message",
          id: item.message.id,
          author: people.authorOf(item.message.author),
          at: toDate(item.message.publishedAt),
          ...shownContent(item.message.content, people.mentionsOf),
          ...(item.message.via !== null && ThreadMessage.Via.isAnyOf(["Turn"])(item.message.via)
            ? { turn: { id: item.message.via.turnId } }
            : {})
        })
      else if (isMessageChange(item)) {
        // An edit or deletion shows on the message's publication, which carries its content now.
      } else if (isParticipation(item)) {
        const participant = item.participant.participant
        if (
          item.activity.kind !== "participation.followed" &&
          ThreadParticipation.Reference.isAnyOf(["Member"])(participant)
        )
          departed.set(participant.memberId, item.activity.sequence)
        shown.push(noteOf(item))
      } else if (item.activity.kind === "turn.created") {
        const details = item.activity.details
        const turn: TurnSoFar = {
          id: details.turnId,
          memberId: details.memberId,
          at: toDate(item.activity.occurredAt),
          sequence: item.activity.sequence,
          state: "queued",
          replied: false
        }
        turns.set(turn.id, turn)
        latest.set(turn.memberId, turn.id)
        shown.push(turn)
      } else if (item.activity.kind === "thread.renamed") {
        // The thread's title shows in its pane's header; a rename has no entry of its own yet.
      } else if (item.activity.kind === "task.created" || item.activity.kind === "task.updated") {
        // A task's state shows with its thread; its changes have no entry of their own yet.
      } else {
        // A turn that began before the pages loaded shows once they reach its start.
        const turn = turns.get(item.activity.details.turnId)
        if (turn !== undefined) advance(turn, item)
      }
    }
    return shown.flatMap((entry): ReadonlyArray<ThreadEntry> => {
      if ("kind" in entry) return [entry]
      const turn = entry
      if (turn.state === "done" && turn.replied) return []
      const agent = agents.of(turn.memberId)
      const usable = agent?.usable === true
      return [
        {
          kind: "turn",
          id: turn.id,
          at: turn.at,
          agent: { name: people.name(turn.memberId) },
          ...(agent === undefined ? {} : { agentId: agent.id }),
          state: turn.state,
          ...(turn.failure === undefined ? {} : { failure: turn.failure }),
          ...(turn.stoppedBy === undefined ? {} : { stoppedBy: turn.stoppedBy }),
          stoppable: usable && (turn.state === "queued" || turn.state === "working"),
          retryable:
            usable &&
            (turn.state === "failed" || (turn.state === "stopped" && turn.stoppedBy === "request")) &&
            latest.get(turn.memberId) === turn.id &&
            (departed.get(turn.memberId) ?? 0) < turn.sequence
        }
      ]
    })
  })
  // Read back until the position to show is loaded, one page at a time. After a page fails, or
  // once access is lost, it waits for the reader to ask again.
  createEffect(() => {
    const target = focus?.(),
      first = timeline.value()?.[0]
    if (target === undefined || first === undefined || timeline.complete()) return
    if (lost() || timeline.earlierFailed()) return
    if (first.activity.sequence > target && !timeline.loadingEarlier()) timeline.loadEarlier()
  })
  return {
    entries,
    status: statusOf(timeline, lost),
    /** The message at `focus`, once loaded. */
    focusId: () => {
      const target = focus?.()
      const item = timeline.value()?.find((entry) => entry.activity.sequence === target)
      return item && isMessage(item) ? (item.message.id as string) : undefined
    },
    /**
     * Why the message at `focus` notified the reader, as the inbox says: it mentions them, it
     * started the thread, or it replied.
     */
    focusReason: (): "mention" | "reply" | "thread" | undefined => {
      const target = focus?.()
      const item = timeline.value()?.find((entry) => entry.activity.sequence === target)
      if (!item || !isMessage(item)) return undefined
      const self = people.selfId()
      const { content } = item.message
      if (ThreadMessage.Content.isAnyOf(["Text"])(content) && content.mentions.some((memberId) => memberId === self))
        return "mention"
      return item.activity.sequence === 1 ? "thread" : "reply"
    },
    /** The names of people typing a reply now. */
    typing: () => typing(threadId).map(people.name),
    earlier: () => !timeline.complete() && timeline.value() !== undefined && !lost(),
    loadingEarlier: timeline.loadingEarlier,
    earlierFailed: timeline.earlierFailed,
    loadEarlier: timeline.loadEarlier,
    retry: timeline.retry
  }
}

/** A group's other members, whom its messages can mention, live while mounted. */
export function useMentionCandidates(workspaceId: string, groupId: string): Accessor<ReadonlyArray<MentionCandidate>> {
  const roster = useGroupRoster(workspaceId, groupId)
  const people = usePeople(workspaceId)
  return createMemo(() =>
    (roster.value() ?? []).flatMap((admission) => {
      if (admission.memberId === people.selfId()) return []
      const member = people.member(admission.memberId)
      return [
        {
          id: admission.memberId,
          name: memberName(member),
          agent: Predicate.isTagged(member?.identity, "Agent")
        }
      ]
    })
  )
}

/**
 * A group's members for its settings, the reader first, then by name; and the workspace's other
 * active members, who can be added. `members` is a `useGroupMembers` controller for the group.
 */
export function useGroupPeople(
  workspaceId: string,
  members: {
    readonly roster: Accessor<ReadonlyArray<GroupMembership.GroupMembership> | undefined>
    readonly membersRemovable: Accessor<boolean>
    /** The workspace's general group, which nobody is removed from. */
    readonly general?: Accessor<boolean>
  }
) {
  const people = usePeople(workspaceId)
  const roster = createMemo((): ReadonlyArray<SettingsMember> =>
    (members.roster() ?? [])
      .map((admission) => {
        const member = people.member(admission.memberId)
        const you = admission.memberId === people.selfId()
        return {
          id: admission.id,
          name: memberName(member),
          agent: Predicate.isTagged(member?.identity, "Agent"),
          you,
          removable: !you && members.membersRemovable() && !members.general?.()
        }
      })
      .toSorted((left, right) => (left.you !== right.you ? (left.you ? -1 : 1) : left.name.localeCompare(right.name)))
  )
  const candidates = createMemo((): ReadonlyArray<MentionCandidate> => {
    const inGroup = new Set((members.roster() ?? []).map((admission) => admission.memberId))
    return (people.all() ?? [])
      .filter((member) => member.status === "active" && !inGroup.has(member.id))
      .map((member) => ({
        id: member.id,
        name: memberName(member),
        agent: Identity.MemberReference.isAnyOf(["Agent"])(member.identity)
      }))
  })
  return { roster, candidates }
}

/**
 * Members as their profile cards show them, by member ID and never by name, live while mounted.
 * Undefined for someone the reader's workspace does not know.
 */
export function useMemberProfiles(workspaceId: string) {
  const people = usePeople(workspaceId)
  return (memberId: string): (Omit<Profile, "status"> & { readonly agentId?: string }) | undefined => {
    const member = people.member(memberId)
    if (member === undefined) return undefined
    return {
      id: member.id,
      name: memberName(member),
      kind: Identity.MemberReference.isAnyOf(["Agent"])(member.identity) ? "agent" : "person",
      you: member.id === people.selfId(),
      former: member.status === "removed",
      ...(Identity.MemberReference.isAnyOf(["Agent"])(member.identity) ? { agentId: member.identity.id } : {})
    }
  }
}

/** The workspace's other active members and agents, whom the reader can message or add. */
export function useWorkspacePeople(workspaceId: string): Accessor<ReadonlyArray<MentionCandidate>> {
  const people = usePeople(workspaceId)
  return createMemo(() =>
    (people.all() ?? [])
      .filter((member) => member.status === "active" && member.id !== people.selfId())
      .map((member) => ({
        id: member.id,
        name: memberName(member),
        agent: Identity.MemberReference.isAnyOf(["Agent"])(member.identity)
      }))
  )
}

/** A row under Direct messages: a conversation the reader has, or a teammate not yet messaged. */
export interface DirectEntry {
  /** The direct group's ID, or the teammate's member ID. */
  readonly id: string
  readonly kind: "conversation" | "teammate"
  /** The conversation's other people, or the teammate. */
  readonly name: string
  /** The conversation's other members, or the teammate alone. */
  readonly memberIds: ReadonlyArray<string>
  readonly pending: number
  readonly unread: boolean
}

/**
 * What Direct messages lists: the reader's conversations, the most recently active first, then
 * up to `suggestions` teammates, people and agents, whom the reader has no one-to-one
 * conversation with yet, by name. A teammate's row opens a first message; the conversation starts
 * when it is sent.
 */
export function useDirectMessages(workspaceId: string, suggestions = 6) {
  const groups = useWorkspaceGroups(workspaceId)
  const people = useWorkspacePeople(workspaceId)
  return createMemo((): ReadonlyArray<DirectEntry> => {
    const conversations = groups.directs()
    const messaged = new Set(conversations.flatMap((entry) => (entry.memberIds.length === 1 ? entry.memberIds : [])))
    const teammates = people()
      .filter((person) => !messaged.has(person.id))
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .slice(0, suggestions)
    return [
      ...conversations.map((entry) => ({
        id: entry.id,
        kind: "conversation" as const,
        name: entry.name,
        memberIds: entry.memberIds,
        pending: entry.pending,
        unread: entry.unread
      })),
      ...teammates.map((person) => ({
        id: person.id,
        kind: "teammate" as const,
        name: person.name,
        memberIds: [person.id],
        pending: 0,
        unread: false
      }))
    ]
  })
}
