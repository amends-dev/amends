/**
 * Who is present in a workspace: which members have the workspace open now, and where they are
 * typing. Presence is never recorded: a process hears it as signals, `Signal`, which a member's open
 * connections and their typing send to every process of the host, and keeps what it heard as a
 * `State`, in which each connection and each typing lapses unless it is heard again in time. This
 * module holds the signals, the state and how a signal or the time changes it, and who is present,
 * as a reader of the workspace sees it.
 *
 * @since 0.1.0
 */

import * as DateTime from "effect/DateTime"
import * as Duration from "effect/Duration"
import * as Schema from "effect/Schema"
import * as ThreadId from "../thread/ThreadId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * How long an open connection counts without being heard again, which its own signal repeats well
 * within.
 *
 * @category constants
 * @since 0.1.0
 */
export const connectionLasts = Duration.seconds(45)

/**
 * How often an open connection says it is still open.
 *
 * @category constants
 * @since 0.1.0
 */
export const connectionRepeats = Duration.seconds(15)

/**
 * How long a member counts as typing without typing again.
 *
 * @category constants
 * @since 0.1.0
 */
export const typingLasts = Duration.seconds(6)

/**
 * What a process tells every process of the host about a member of a workspace: a connection of
 * theirs is open, or closed; they are typing in a thread, or stopped.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Signal = Schema.TaggedUnion({
  Here: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, connectionId: Schema.String },
  Gone: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, connectionId: Schema.String },
  Typing: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId, threadId: ThreadId.ThreadId },
  StoppedTyping: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Signal = typeof Signal.Type

/** A member as a process last heard of them: their open connections, and where they type, with when each lapses. */
interface Heard {
  readonly connections: ReadonlyMap<string, DateTime.Utc>
  readonly typing: { readonly threadId: ThreadId.ThreadId; readonly until: DateTime.Utc } | undefined
}

/**
 * Who a process heard is present in one workspace, by member.
 *
 * @category models
 * @since 0.1.0
 */
export type State = ReadonlyMap<MemberId.MemberId, Heard>

/**
 * No one present.
 *
 * @category constructors
 * @since 0.1.0
 */
export const empty: State = new Map()

const nobody: Heard = { connections: new Map(), typing: undefined }

/** `state` with `memberId` as `change` leaves them, and without them once nothing of theirs is left. */
const withMember = (state: State, memberId: MemberId.MemberId, change: (heard: Heard) => Heard): State => {
  const heard = change(state.get(memberId) ?? nobody)
  const next = new Map(state)
  if (heard.connections.size === 0 && heard.typing === undefined) next.delete(memberId)
  else next.set(memberId, heard)
  return next
}

/**
 * `state` once `signal` is heard at `now`.
 *
 * @category transforming
 * @since 0.1.0
 */
export const apply = (state: State, signal: Signal, now: DateTime.Utc): State =>
  Signal.match(signal, {
    Here: ({ memberId, connectionId }) =>
      withMember(state, memberId, (heard) => ({
        ...heard,
        connections: new Map(heard.connections).set(connectionId, DateTime.addDuration(now, connectionLasts))
      })),
    Gone: ({ memberId, connectionId }) =>
      withMember(state, memberId, (heard) => {
        const connections = new Map(heard.connections)
        connections.delete(connectionId)
        return { ...heard, connections }
      }),
    Typing: ({ memberId, threadId }) =>
      withMember(state, memberId, (heard) => ({
        ...heard,
        typing: { threadId, until: DateTime.addDuration(now, typingLasts) }
      })),
    StoppedTyping: ({ memberId }) => withMember(state, memberId, (heard) => ({ ...heard, typing: undefined }))
  })

/**
 * `state` at `now`, without the connections and the typing that lapsed by then.
 *
 * @category transforming
 * @since 0.1.0
 */
export const expire = (state: State, now: DateTime.Utc): State => {
  const lapsed = (until: DateTime.Utc) => !DateTime.isGreaterThan(until, now)
  let next = state
  for (const [memberId, heard] of state)
    if ([...heard.connections.values()].some(lapsed) || (heard.typing !== undefined && lapsed(heard.typing.until)))
      next = withMember(next, memberId, ({ connections, typing }) => ({
        connections: new Map([...connections].filter(([, until]) => !lapsed(until))),
        typing: typing !== undefined && lapsed(typing.until) ? undefined : typing
      }))
  return next
}

/**
 * A member present in a workspace: they have it open, and are typing in a thread, or nowhere.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Present = Schema.Struct({ memberId: MemberId.MemberId, typingIn: Schema.NullOr(ThreadId.ThreadId) })

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Present extends Schema.Schema.Type<typeof Present> {}

/**
 * Who `state` holds present, by member ID: each member with an open connection, and the thread
 * they type in, if any.
 *
 * @category getters
 * @since 0.1.0
 */
export const presentOf = (state: State): ReadonlyArray<Present> =>
  [...state]
    .filter(([, heard]) => heard.connections.size > 0)
    .map(([memberId, heard]) => ({ memberId, typingIn: heard.typing?.threadId ?? null }))
    .toSorted((left, right) => (left.memberId < right.memberId ? -1 : left.memberId > right.memberId ? 1 : 0))

/**
 * Whether two lists of who is present are the same.
 *
 * @category predicates
 * @since 0.1.0
 */
export const samePresent = Schema.toEquivalence(Schema.Array(Present))
