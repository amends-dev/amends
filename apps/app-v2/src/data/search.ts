/** Search normalization and destinations derived from workspace records. */

import type { Group } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { type Thread, type ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import type { Member, MemberId } from "@amends-dev/core/workspace"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { groupName } from "./groups.ts"
import { isAgent } from "./members.ts"
import { messageWords } from "./messages.ts"

/** `text` in lower case with its accents taken off, so that "José" and "jose" are the same when searched for. */
export const foldAccents = (text: string): string => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase()

/** A group the person can jump to, with its name as they read it. */
export interface NamedGroup {
  readonly group: Group.Group
  readonly name: string
}

/**
 * A thread the person can jump to, with the name of its group, the words they read it by, which are its title or, when
 * it has none, its opening's, and the words of its opening, which they may know it by as well.
 */
export interface WordedThread {
  readonly thread: Thread.Thread
  readonly groupName: string
  readonly words: string
  readonly openingWords: Option.Option<string>
}

/** An agent the person can jump to: the identity it works as, and the member it is, which has its name. */
export interface NamedAgent {
  readonly agentId: Identity.AgentId
  readonly member: Member.Member
}

/**
 * Where the person can jump to in the workspace, besides its pages: the groups, other than a conversation with one
 * other person, whom the people stand for, in the order of the records; the threads, with the words of their openings;
 * the active people other than the person; and the active agents.
 */
export interface JumpTargets {
  readonly groups: ReadonlyArray<NamedGroup>
  readonly threads: ReadonlyArray<WordedThread>
  readonly people: ReadonlyArray<Member.Member>
  readonly agents: ReadonlyArray<NamedAgent>
}

/** What the jump targets are read from in the replica, as the person's unfinished actions leave it. */
export interface JumpSource {
  readonly memberId: MemberId.MemberId
  readonly groups: ReadonlyArray<Group.Group>
  readonly members: ReadonlyArray<Member.Member>
  readonly threads: ReadonlyArray<Thread.Thread>
  readonly messages: ReadonlyArray<ThreadMessage.ThreadMessage>
}

/** The first message published in each thread among `messages`. */
const openingsOf = (
  messages: ReadonlyArray<ThreadMessage.ThreadMessage>
): ReadonlyMap<ThreadId.ThreadId, ThreadMessage.ThreadMessage> => {
  const openings = new Map<ThreadId.ThreadId, ThreadMessage.ThreadMessage>()
  for (const message of messages) {
    const opening = openings.get(message.threadId)
    if (opening === undefined || DateTime.isLessThan(message.publishedAt, opening.publishedAt))
      openings.set(message.threadId, message)
  }
  return openings
}

/** What the message says, as a reader hears it, while it has text to read; a deleted one has none. */
const wordsOfText = (message: ThreadMessage.ThreadMessage | undefined, members: ReadonlyArray<Member.Member>) =>
  message !== undefined && ThreadMessage.Content.isAnyOf(["Text"])(message.content)
    ? messageWords(message, members)
    : undefined

/**
 * Where in `source` the person can jump to: the groups by the names the person reads, other than a conversation with
 * one other person, who is among the people; the threads by their titles or their openings' words, a mention as the
 * member's current name, leaving out one whose group the replica lacks, since it could not be opened, and one with
 * neither; the active people other than the person; and the active agents.
 */
export const listJumpTargets = ({ memberId, groups, members, threads, messages }: JumpSource): JumpTargets => {
  const openings = openingsOf(messages)
  const named = groups.map((group): NamedGroup => ({ group, name: groupName(group, members, memberId) }))
  const people = members.filter((member) => member.id !== memberId && member.status === "active" && !isAgent(member))
  const isOnePersonsConversation = ({ group }: NamedGroup) =>
    group.kind === "Direct" &&
    group.memberIds.length === 2 &&
    group.memberIds.some((id) => people.some((person) => person.id === id))

  return {
    groups: named.filter((target) => !isOnePersonsConversation(target)),
    threads: threads.flatMap((thread): ReadonlyArray<WordedThread> => {
      const openingWords = Option.fromUndefinedOr(wordsOfText(openings.get(thread.id), members))
      const group = named.find((target) => target.group.id === thread.groupId)
      const words = thread.title ?? Option.getOrUndefined(openingWords)

      return group === undefined || words === undefined ? [] : [{ thread, groupName: group.name, words, openingWords }]
    }),
    people,
    agents: members.flatMap((member): ReadonlyArray<NamedAgent> =>
      member.status === "active"
        ? Identity.MemberReference.match(member.identity, {
            Human: () => [],
            Agent: ({ id }) => [{ agentId: id, member }]
          })
        : []
    )
  }
}
