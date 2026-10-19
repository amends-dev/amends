import { Integration } from "@amends-dev/connection"
import { Core } from "@amends-dev/core"
import { Assignment, BuiltinRoles, GrantResolver, type Role, Scope } from "@amends-dev/core/authorization"
import { Channel, Contact } from "@amends-dev/core/channel"
import { Connection } from "@amends-dev/core/connection"
import { Group, GroupMembership } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { Notification } from "@amends-dev/core/notification"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { Task } from "@amends-dev/core/task"
import { Thread, ThreadMessage } from "@amends-dev/core/thread"
import type { Turn } from "@amends-dev/core/turn"
import { Invitation, Member, WorkspaceId } from "@amends-dev/core/workspace"
import { Accounts, type SignIn, WorkspaceDirectory } from "@amends-dev/gateway"
import { DateTime, Effect, Schema } from "effect"

export const apiUrl = "http://127.0.0.1:8787"

/** The time now, half past noon on the day the records below were made. */
export const now = DateTime.makeUnsafe("2026-10-18T12:30:00Z")

export const session: SignIn.Session = {
  token: "alice",
  account: { id: Identity.HumanId.make("alice"), email: Accounts.Email.make("alice@example.com") }
}

export const membership = Schema.decodeSync(WorkspaceDirectory.Membership)({
  workspace: { id: "workspace-1", name: "Studio", createdBy: "alice", ownerMemberId: "member-1" },
  member: {
    id: "member-1",
    workspaceId: "workspace-1",
    identity: { _tag: "Human", id: "alice" },
    name: "Alice",
    status: "active"
  },
  people: 1
})

export const general = Schema.decodeSync(Group.Group)({
  id: "general",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "General",
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** Another member of the workspace. */
export const bob = Schema.decodeSync(Member.Member)({
  id: "member-2",
  workspaceId: "workspace-1",
  identity: { _tag: "Human", id: "bob" },
  name: "Bob",
  status: "active"
})

/** A private team alice created. */
export const design = Schema.decodeSync(Group.Group)({
  id: "design",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Private",
  name: "Design",
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

const admission = (id: string, groupId: string, memberId: string) =>
  Schema.decodeSync(GroupMembership.GroupMembership)({
    id,
    workspaceId: "workspace-1",
    groupId,
    memberId,
    admittedAt: "2026-10-18T12:00:00Z",
    status: "active"
  })

/** Alice's admissions to general and to design, and bob's to design. */
export const aliceInGeneral = admission("membership-1", "general", "member-1")
export const aliceInDesign = admission("membership-2", "design", "member-1")
export const bobInDesign = admission("membership-3", "design", "member-2")

/** The workspace's built-in roles, as it was created with them. */
export const roles = BuiltinRoles.make(WorkspaceId.WorkspaceId.make("workspace-1"), Core.permissions)

/** `memberId`'s assignment of `roleId` across the workspace. */
export const roleOf = (id: string, memberId: Member.Member["id"], roleId: Role.RoleId) =>
  Assignment.Assignment.make({
    id: Assignment.AssignmentId.make(id),
    workspaceId: WorkspaceId.WorkspaceId.make("workspace-1"),
    memberId,
    status: "active",
    source: Assignment.Source.cases.Role.make({
      roleId,
      scope: Scope.Scope.cases.Workspace.make({ workspaceId: WorkspaceId.WorkspaceId.make("workspace-1") })
    })
  })

/** Alice owns the workspace; bob is a member of it. */
export const aliceOwns = roleOf("assignment-1", membership.member.id, BuiltinRoles.OwnerId)
export const bobIsMember = roleOf("assignment-2", bob.id, BuiltinRoles.MemberId)

/** What `assignments` let their member do, by the workspace's roles. */
export const grantsOf = (assignments: ReadonlyArray<Assignment.Assignment>) =>
  GrantResolver.grantsOf(assignments, (roleId) => roles.find((role) => role.id === roleId))

/** An invitation of carol@example.com as a member, which alice issued and carol has not accepted. */
export const invitation = Schema.decodeSync(Invitation.Invitation)({
  details: {
    id: "invitation-1",
    workspaceId: "workspace-1",
    recipientId: "carol",
    recipientEmail: "carol@example.com",
    roleId: BuiltinRoles.MemberId,
    expiresAt: "2026-10-25T12:00:00Z",
    inviterMemberId: "member-1",
    issuedAt: "2026-10-18T12:00:00Z"
  },
  state: { _tag: "Pending" }
})

export const thread = Schema.decodeSync(Thread.Thread)({
  id: "thread-1",
  workspaceId: "workspace-1",
  groupId: "general",
  title: null,
  origin: null,
  createdBy: { _tag: "Member", memberId: "member-1" },
  createdAt: "2026-10-18T12:00:00Z"
})

export const opening = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-1",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-1" },
  via: null,
  publishedAt: "2026-10-18T12:00:00Z",
  content: { _tag: "Text", text: "Plans for the week", mentions: [], revision: 1, editedAt: null }
})

/** Bob's reply in the thread. */
export const reply = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-2",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-2" },
  via: null,
  publishedAt: "2026-10-18T12:05:00Z",
  content: { _tag: "Text", text: "Sounds good", mentions: [], revision: 1, editedAt: null }
})

/** Bob's message in the thread that addresses alice. */
export const mention = Schema.decodeSync(ThreadMessage.ThreadMessage)({
  id: "message-3",
  workspaceId: "workspace-1",
  threadId: "thread-1",
  author: { _tag: "Member", memberId: "member-2" },
  via: null,
  publishedAt: "2026-10-18T12:06:00Z",
  content: { _tag: "Text", text: "Can you take a look?", mentions: ["member-1"], revision: 1, editedAt: null }
})

/** `message` saying `text` instead, in which `ThreadMessage.mentionText` writes a mention, and addressing whom it did. */
export const saying = (message: typeof opening, text: string): typeof opening => ({
  ...message,
  content: ThreadMessage.Content.matchOrElse(
    message.content,
    { Text: (content) => ({ ...content, text }) },
    (content) => content
  )
})

/** `message` after it was deleted, when it was published. */
export const deleted = (message: typeof opening): typeof opening => ({
  ...message,
  content: ThreadMessage.Content.cases.Deleted.make({ deletedAt: message.publishedAt })
})

/** The conversation between alice and bob. */
export const conversationWithBob = Schema.decodeSync(Group.Group)({
  id: "alice-and-bob",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** Alice's notification of activity in the thread at `sequence`, recorded at `minute` past noon. */
export const notificationOf = (id: string, sequence: number, minute: number) =>
  Schema.decodeSync(Notification.Notification)({
    id,
    workspaceId: "workspace-1",
    source: { logId: "thread-log", entryId: `entry-${id}` },
    thread: { threadId: "thread-1", groupId: "general", sequence },
    recipient: { _tag: "Human", id: "alice", memberId: "member-1" },
    recordedAt: `2026-10-18T12:${String(minute).padStart(2, "0")}:00Z`,
    state: { _tag: "Pending" }
  })

/** An agent of the workspace, a member of general. */
export const scout = Schema.decodeSync(Member.Member)({
  id: "member-3",
  workspaceId: "workspace-1",
  identity: { _tag: "Agent", id: "agent-1" },
  name: "Scout",
  status: "active"
})
export const scoutInGeneral = admission("membership-4", "general", "member-3")

/** The thread's task, in triage, which alice created. */
export const task = Schema.decodeSync(Task.Task)({
  threadId: "thread-1",
  workspaceId: "workspace-1",
  groupId: "general",
  status: "triage",
  priority: "none",
  assignee: null,
  createdBy: { _tag: "Member", memberId: "member-1" },
  createdAt: "2026-10-18T12:01:00Z"
})

/** Scout's turn `id` in the thread, in `status`. */
export const turnOf = (id: string, status: Turn.Status) =>
  Schema.decodeSync(ReplicaRecord.Turn)({
    id,
    workspaceId: "workspace-1",
    groupId: "general",
    threadId: "thread-1",
    agentId: "agent-1",
    memberId: "member-3",
    participationId: "participation-3",
    retry: null,
    status,
    acceptedThroughSequence: 1,
    selection: null,
    messageIds: [],
    failure: status === "failed" ? "The model was unavailable." : null,
    cancelReason: null,
    createdAt: "2026-10-18T12:02:00Z",
    startedAt: status === "queued" ? null : "2026-10-18T12:02:01Z",
    finishedAt: null
  })

/** An integration the host installs, which takes a base URL and a key or none, as its readers see it. */
export const testApi = Connection.integrationView(
  Integration.make({
    id: "test-api",
    name: "Test API",
    settings: Schema.Struct({ url: Schema.NonEmptyString.annotate({ title: "Base URL" }) }),
    auth: ["apiKey", "none"],
    check: () => Effect.succeed({ status: "healthy" })
  })
)

/** A connection to the test API called `name`, ready, which alice added. */
export const connectionOf = (id: string, name: string) =>
  Schema.decodeSync(ReplicaRecord.Connection)({
    id,
    workspaceId: "workspace-1",
    integration: "test-api",
    name,
    settings: { url: "https://api.example" },
    auth: "apiKey",
    status: "active",
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z",
    readiness: { _tag: "Ready" }
  })

/** An integration whose connections give `provides`, and take no settings or key, as its readers see it. */
export const integrationGiving = (id: string, name: string, provides: Connection.IntegrationView["provides"]) =>
  Schema.decodeSync(Connection.IntegrationView)({
    id,
    name,
    auth: ["none"],
    provides,
    requiresSandbox: false,
    settings: { type: "object", properties: {} }
  })

/** A ready connection called `name` to the integration `integration`, which takes no key. */
export const keylessConnection = (id: string, integration: string, name: string) =>
  Schema.decodeSync(ReplicaRecord.Connection)({
    id,
    workspaceId: "workspace-1",
    integration,
    name,
    settings: {},
    auth: "none",
    status: "active",
    createdBy: "member-1",
    createdAt: "2026-10-18T12:00:00Z",
    readiness: { _tag: "Ready" }
  })

/** Scout's setup: on any harness, the test model of the models connection, and no sandbox. */
export const scoutAgent = Schema.decodeSync(ReplicaRecord.Agent)({
  id: "agent-1",
  workspaceId: "workspace-1",
  memberId: "member-3",
  instructions: "Review what is asked.",
  harness: { _tag: "Auto" },
  model: { connectionId: "models-1", id: "test-model" },
  sandbox: null,
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z",
  readiness: { _tag: "Ready" }
})

/** What the models connection offers: the test model, which reasons with a low or high effort, and any other. */
export const offered = Schema.decodeSync(Connection.Models)({
  listed: [
    {
      id: "test-model",
      name: "Test model",
      protocol: "openai-chat",
      url: "https://models.example/v1",
      released: "2026-01",
      limits: { context: 100000, output: 8000 },
      modalities: { input: ["text"], output: ["text"] },
      tools: true,
      reasoning: { toggle: false, efforts: ["low", "high"] }
    }
  ],
  unlisted: true
})

/** A channel over the channels connection, opening tasks in general, which alice added. */
export const support = Schema.decodeSync(Channel.Channel)({
  id: "channel-1",
  workspaceId: "workspace-1",
  connectionId: "channels-1",
  groupId: "general",
  name: "Support",
  opensTasks: true,
  status: "active",
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** A person a channel's conversation brought in. */
export const dana = Schema.decodeSync(Contact.Contact)({
  id: "contact-1",
  workspaceId: "workspace-1",
  channelId: "channel-1",
  externalId: "dana",
  name: "Dana",
  createdAt: "2026-10-18T12:00:00Z"
})
