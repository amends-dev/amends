import { Assignment, BuiltinRoles, type Role, Scope } from "@amends-dev/core/authorization"
import { CoreError } from "@amends-dev/core/error"
import { Group, GroupFollow, GroupMembership } from "@amends-dev/core/group"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Request } from "@amends-dev/core/request"
import { Thread, ThreadId, ThreadMessage, ThreadParticipation } from "@amends-dev/core/thread"
import { Invitation, Member, MemberId, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as ThreadSync from "@amends-dev/sync/ThreadSync"
import { describe, expect, it } from "@effect/vitest"
import { DateTime, Effect, Option, Schema } from "effect"
import * as Pending from "../src/sync/Pending.ts"

const { cases } = ReplicaRecord.ReplicaRecord
const author = {
  workspaceId: WorkspaceId.WorkspaceId.make("workspace-1"),
  memberId: MemberId.MemberId.make("member-1")
}
const at = (minute: number) => DateTime.makeUnsafe(Date.UTC(2026, 9, 18, 12, minute))
const group = ReplicaRecord.Place.cases.Group.make({ groupId: "general" as never })

const thread = (id: string, title: string | null = null) =>
  cases.Thread.make({
    value: Schema.decodeSync(Thread.Thread)({
      id,
      workspaceId: "workspace-1",
      groupId: "general",
      title,
      origin: null,
      createdBy: { _tag: "Member", memberId: "member-1" },
      createdAt: "2026-10-18T12:00:00Z"
    })
  })
const message = (id: string, text: string) =>
  cases.ThreadMessage.make({
    value: Schema.decodeSync(ThreadMessage.ThreadMessage)({
      id,
      workspaceId: "workspace-1",
      threadId: "thread-1",
      author: { _tag: "Member", memberId: "member-1" },
      via: null,
      publishedAt: "2026-10-18T12:00:00Z",
      content: { _tag: "Text", text, mentions: [], revision: 1, editedAt: null }
    })
  })

/** An unfinished action `tag` with `payload`, written at `minute`, creating `creates`. */
const unfinished = (
  tag: string,
  payload: unknown,
  minute: number,
  creates: ReadonlyArray<ReplicaRecord.ReplicaRecord> = []
): Pending.Unfinished => ({
  action: { ...author, key: Request.Key.make(`action-${minute}`), writtenAt: at(minute) },
  payload,
  effects: Pending.effectsOf(tag),
  creates
})
const view = <Kind extends ReplicaRecord.Kind>(
  held: ReadonlyArray<Pending.Held<Pending.Held["record"] & { _tag: Kind }>>
) => held.map(({ record, pending }) => ({ value: record.value, pending }))

describe("Pending.overlay", () => {
  it("shows what an action creates until the server holds it, and its changes over what the server holds", () => {
    const server = thread("thread-1")
    const started = thread("thread-2", "New")
    const pending = [
      unfinished("ThreadRenamed", { threadId: "thread-1", title: "Plans", expectedTitle: null }, 1),
      unfinished("ThreadStarted", { groupId: "general", text: "Hi", mentions: [] }, 2, [started])
    ]
    expect(view(Pending.overlay("Thread", group, [server], pending))).toEqual([
      { value: { ...server.value, title: "Plans" }, pending: true },
      { value: started.value, pending: true }
    ])
    // Once the server holds the thread it started, the server's own shows, under the same ID.
    const arrived = thread("thread-2", "New, as the server made it")
    expect(view(Pending.overlay("Thread", group, [arrived], pending.slice(1)))).toEqual([
      { value: arrived.value, pending: false }
    ])
  })

  it("applies each action to what the ones before it left", () => {
    const started = thread("thread-2")
    const pending = [
      unfinished("ThreadStarted", { groupId: "general", text: "Hi", mentions: [] }, 1, [started]),
      unfinished("ThreadRenamed", { threadId: "thread-2", title: "Named", expectedTitle: null }, 2)
    ]
    expect(view(Pending.overlay("Thread", group, [], pending))).toEqual([
      { value: { ...started.value, title: "Named" }, pending: true }
    ])
  })

  it("edits and deletes the messages it names, as of when it was written", () => {
    const place = ReplicaRecord.Place.cases.Thread.make({ threadId: ThreadId.ThreadId.make("thread-1") })
    const first = message("message-1", "Draft")
    const second = message("message-2", "Oops")
    const pending = [
      unfinished(
        "ThreadMessageEdited",
        { messageId: "message-1", text: "Final", mentions: [], expectedRevision: 1 },
        3
      ),
      unfinished("ThreadMessageDeleted", { messageId: "message-2" }, 4)
    ]
    expect(view(Pending.overlay("ThreadMessage", place, [first, second], pending))).toEqual([
      {
        value: {
          ...first.value,
          content: ThreadMessage.Content.cases.Text.make({ text: "Final", mentions: [], revision: 2, editedAt: at(3) })
        },
        pending: true
      },
      {
        value: { ...second.value, content: ThreadMessage.Content.cases.Deleted.make({ deletedAt: at(4) }) },
        pending: true
      }
    ])
  })
})

describe("Pending.overlay, for a member's own part in a thread", () => {
  const place = ReplicaRecord.Place.cases.Thread.make({ threadId: ThreadId.ThreadId.make("thread-1") })
  const position = (readThrough: number) =>
    cases.ThreadPosition.make({ value: { ...author, threadId: ThreadId.ThreadId.make("thread-1"), readThrough } })
  const participation = (status: "active" | "ended") =>
    cases.ThreadParticipation.make({
      value: Schema.decodeSync(ThreadParticipation.ThreadParticipation)({
        id: "participation-1",
        workspaceId: "workspace-1",
        threadId: "thread-1",
        participant: {
          _tag: "Member",
          memberId: "member-1",
          groupMembershipId: "membership-1",
          identity: { _tag: "Human", id: "alice" }
        },
        joinedAt: "2026-10-18T12:00:00Z",
        joinedAtSequence: 1,
        status,
        endedAt: status === "ended" ? "2026-10-18T12:30:00Z" : null
      })
    })

  it("reads a thread through the furthest position, from none or from one the server holds", () => {
    const marked = (through: number, minute: number) =>
      unfinished("ThreadMarkedRead", { threadId: "thread-1", throughSequence: through }, minute, [position(through)])
    expect(view(Pending.overlay("ThreadPosition", place, [], [marked(3, 1)]))).toEqual([
      { value: position(3).value, pending: true }
    ])
    expect(view(Pending.overlay("ThreadPosition", place, [position(2)], [marked(5, 1)]))).toEqual([
      { value: position(5).value, pending: true }
    ])
    // A position behind the one the server holds leaves it as it is.
    expect(view(Pending.overlay("ThreadPosition", place, [position(6)], [marked(5, 1)]))).toEqual([
      { value: position(6).value, pending: false }
    ])
  })

  it("ends the member's participation, and takes up one they ended", () => {
    const unfollowed = unfinished("ThreadUnfollowed", { threadId: "thread-1", participationId: "participation-1" }, 2)
    expect(view(Pending.overlay("ThreadParticipation", place, [participation("active")], [unfollowed]))).toEqual([
      { value: { ...participation("active").value, status: "ended", endedAt: at(2) }, pending: true }
    ])
    const followed = unfinished("ThreadFollowed", { threadId: "thread-1" }, 3)
    expect(view(Pending.overlay("ThreadParticipation", place, [participation("ended")], [followed]))).toEqual([
      { value: participation("active").value, pending: true }
    ])
  })
})

describe("Pending.overlay, for groups", () => {
  const workspace = ReplicaRecord.Place.cases.Workspace.make({})
  const design = cases.Group.make({
    value: Schema.decodeSync(Group.Group)({
      id: "design",
      workspaceId: "workspace-1",
      kind: "Team",
      visibility: "Private",
      name: "Design",
      createdBy: "member-1",
      createdAt: "2026-10-18T12:00:00Z"
    })
  })
  const admission = (id: string, memberId: string) =>
    cases.GroupMembership.make({
      value: Schema.decodeSync(GroupMembership.GroupMembership)({
        id,
        workspaceId: "workspace-1",
        groupId: "design",
        memberId,
        admittedAt: "2026-10-18T12:00:00Z",
        status: "active"
      })
    })
  const following = (status: "active" | "ended") =>
    cases.GroupFollow.make({
      value: Schema.decodeSync(GroupFollow.GroupFollow)({
        id: "follow-1",
        workspaceId: "workspace-1",
        groupId: "design",
        memberId: "member-1",
        groupMembershipId: "membership-1",
        followedAt: "2026-10-18T12:00:00Z",
        status,
        endedAt: status === "ended" ? "2026-10-18T12:30:00Z" : null
      })
    })

  it("renames a team", () => {
    const renamed = unfinished("GroupRenamed", { groupId: "design", name: "Product", expectedName: "Design" }, 1)
    expect(view(Pending.overlay("Group", workspace, [design], [renamed]))).toEqual([
      { value: { ...design.value, name: "Product" }, pending: true }
    ])
  })

  it("removes a member, and the person when they leave, but only the membership each names", () => {
    const alice = admission("membership-1", "member-1")
    const bob = admission("membership-2", "member-2")
    const pending = [
      unfinished("GroupMemberRemoved", { groupId: "design", membershipId: "membership-2" }, 1),
      unfinished("GroupLeft", { groupId: "design", membershipId: "membership-1" }, 2)
    ]
    expect(view(Pending.overlay("GroupMembership", undefined, [alice, bob], pending.slice(0, 1)))).toEqual([
      { value: alice.value, pending: false },
      { value: { ...bob.value, status: "removed" }, pending: true }
    ])
    expect(view(Pending.overlay("GroupMembership", undefined, [alice, bob], pending))).toEqual([
      { value: { ...alice.value, status: "removed" }, pending: true },
      { value: { ...bob.value, status: "removed" }, pending: true }
    ])
  })

  it("ends the person's follow of a group, and takes up one they ended", () => {
    const unfollowed = unfinished("GroupUnfollowed", { groupId: "design", memberId: "member-1" }, 2)
    expect(view(Pending.overlay("GroupFollow", undefined, [following("active")], [unfollowed]))).toEqual([
      { value: { ...following("active").value, status: "ended", endedAt: at(2) }, pending: true }
    ])
    const followed = unfinished("GroupFollowed", { groupId: "design", memberId: "member-1" }, 3)
    expect(view(Pending.overlay("GroupFollow", undefined, [following("ended")], [followed]))).toEqual([
      { value: following("active").value, pending: true }
    ])
    // Following a group they never followed waits for the server.
    expect(view(Pending.overlay("GroupFollow", undefined, [], [followed]))).toEqual([])
  })
})

describe("Pending.overlay, for the workspace", () => {
  const place = ReplicaRecord.Place.cases.Workspace.make({})
  const studio = cases.Workspace.make({
    value: Schema.decodeSync(Workspace.Workspace)({
      id: "workspace-1",
      name: "Studio",
      createdBy: "alice",
      ownerMemberId: "member-1"
    })
  })
  const member = (id: string, name: string) =>
    cases.Member.make({
      value: Schema.decodeSync(Member.Member)({
        id,
        workspaceId: "workspace-1",
        identity: { _tag: "Human", id },
        name,
        status: "active"
      })
    })
  const holds = (id: string, memberId: string, roleId: Role.RoleId) =>
    cases.Assignment.make({
      value: Assignment.Assignment.make({
        id: Assignment.AssignmentId.make(id),
        workspaceId: author.workspaceId,
        memberId: MemberId.MemberId.make(memberId),
        status: "active",
        source: Assignment.Source.cases.Role.make({
          roleId,
          scope: Scope.Scope.cases.Workspace.make({ workspaceId: author.workspaceId })
        })
      })
    })

  it("renames the workspace and hands it to another member", () => {
    const pending = [
      unfinished("WorkspaceRenamed", { name: "Atelier", expectedName: "Studio" }, 1),
      unfinished("OwnershipTransferred", { memberId: "member-2", expectedOwnerAssignmentId: "assignment-1" }, 2)
    ]
    expect(view(Pending.overlay("Workspace", place, [studio], pending))).toEqual([
      { value: { ...studio.value, name: "Atelier", ownerMemberId: MemberId.MemberId.make("member-2") }, pending: true }
    ])
  })

  it("renames the person who wrote the action, and removes the member it names", () => {
    const alice = member("member-1", "Alice")
    const bob = member("member-2", "Bob")
    const pending = [
      unfinished("MemberRenamed", { name: "Ali" }, 1),
      unfinished("MemberRemoved", { memberId: "member-2" }, 2)
    ]
    expect(view(Pending.overlay("Member", place, [alice, bob], pending))).toEqual([
      { value: { ...alice.value, name: "Ali" }, pending: true },
      { value: { ...bob.value, status: "removed" }, pending: true }
    ])
  })

  it("replaces the roles the person saw a member hold, and revokes an invitation still pending", () => {
    const bobIsMember = holds("assignment-2", "member-2", BuiltinRoles.MemberId)
    const bobAdministers = holds("assignment-3", "member-2", BuiltinRoles.AdministratorId)
    const replaced = unfinished(
      "RolesReplaced",
      { memberId: "member-2", roleId: BuiltinRoles.AdministratorId, expectedAssignmentIds: ["assignment-2"] },
      1,
      [bobAdministers]
    )
    expect(view(Pending.overlay("Assignment", place, [bobIsMember], [replaced]))).toEqual([
      { value: { ...bobIsMember.value, status: "revoked" }, pending: true },
      { value: bobAdministers.value, pending: true }
    ])
    const invited = cases.Invitation.make({
      value: Schema.decodeSync(Invitation.Invitation)({
        details: {
          recipientId: "carol",
          roleId: BuiltinRoles.MemberId,
          expiresAt: "2026-10-25T12:00:00Z",
          id: "invitation-1",
          workspaceId: "workspace-1",
          inviterMemberId: "member-1",
          issuedAt: "2026-10-18T12:00:00Z"
        },
        state: { _tag: "Pending" }
      })
    })
    const revoked = unfinished("InvitationRevoked", { invitationId: "invitation-1" }, 2)
    expect(view(Pending.overlay("Invitation", place, [invited], [revoked]))).toEqual([
      {
        value: {
          ...invited.value,
          state: Invitation.State.cases.Revoked.make({ revokedBy: author.memberId, revokedAt: at(2) })
        },
        pending: true
      }
    ])
  })
})

describe("Pending.unfinished", () => {
  it.effect("decodes the actions still on their way, in the order written, and leaves out those refused", () =>
    Effect.gen(function* () {
      const renamed = ThreadSync.Actions.events.ThreadRenamed!
      const encode = Schema.encodeEffect(renamed.payloadSchemaBinary as Schema.Codec<unknown, Uint8Array>)
      const held = (key: string, title: string, refused: boolean) =>
        Effect.map(encode({ threadId: "thread-1", title, expectedTitle: null }), (payload) => ({
          key,
          tag: "ThreadRenamed",
          payload,
          writtenAt: at(0),
          creates: [],
          rejection: refused
            ? Option.some(new CoreError.Denied({ reason: new CoreError.HumanRequired() }))
            : Option.none()
        }))
      const actions = yield* Effect.all([
        held("b", "Second", false),
        held("a", "First", false),
        held("c", "Refused", true)
      ])
      const pending = yield* Pending.unfinished(actions, author)
      expect(pending.map(({ action, payload }) => [action.key, (payload as { title: string }).title])).toEqual([
        ["a", "First"],
        ["b", "Second"]
      ])
      expect(view(Pending.overlay("Thread", group, [thread("thread-1")], pending))).toEqual([
        { value: { ...thread("thread-1").value, title: "Second" }, pending: true }
      ])
    })
  )
})
