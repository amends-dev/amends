import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Group } from "@amends-dev/core/group"
import { Task } from "@amends-dev/core/task"
import { ThreadMessage } from "@amends-dev/core/thread"
import { Turn } from "@amends-dev/core/turn"
import { Invitation } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  ManagedResource,
  Subscription,
  click,
  expect,
  change,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import {
  AddConnection,
  CheckCode,
  CheckConnection,
  LoadIntegrations,
  LoadModels,
  LoadWorkspaces,
  SaveSession,
  SendCode,
  SignOut,
  TellTyping
} from "../src/command.ts"
import { Message } from "../src/message.ts"
import {
  AddGroupMember,
  ChangeRole,
  CreateAgent,
  CreateChannel,
  CreateTask,
  CreateTeam,
  Dismiss,
  Invite,
  JoinGroup,
  managedResources,
  MarkAllNotificationsSeen,
  PostReply,
  RedirectChannel,
  RemoveGroupMember,
  RetryTurn,
  RevokeInvitation,
  StopTurn,
  UpdateTask
} from "../src/store.ts"
import { update } from "../src/update.ts"
import { view } from "../src/view.ts"
import {
  aliceInDesign,
  aliceInGeneral,
  aliceOwns,
  apiUrl,
  bob,
  bobInDesign,
  bobIsMember,
  connectionOf,
  dana,
  design,
  general,
  integrationGiving,
  keylessConnection,
  membership,
  notificationOf,
  offered,
  opening,
  reply,
  roleOf,
  roles,
  scout,
  scoutAgent,
  scoutInGeneral,
  session,
  signedIn,
  signedOut,
  support,
  task,
  testApi,
  thread,
  turnOf
} from "./fixtures.ts"

/** A public team alice does not belong to. */
const research = Schema.decodeSync(Group.Group)({
  id: "research",
  workspaceId: "workspace-1",
  kind: "Team",
  visibility: "Public",
  name: "Research",
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

describe("the app", () => {
  it("a person signs in, opens a thread, replies, sees what was refused, and signs out", () => {
    scene(
      { update, view },
      given(signedOut),
      type(label("Email"), "alice@example.com"),
      click(role("button", { name: "Send a code" })),
      Command.expectExact(SendCode({ apiUrl, email: "alice@example.com" })),
      Command.resolve(SendCode, Message.SucceededSendCode()),
      expect(text("Enter the code sent to alice@example.com.")).toExist(),
      type(label("Code"), "123456"),
      click(role("button", { name: "Sign in" })),
      Command.resolve(CheckCode, Message.SucceededSignIn({ session })),
      Command.resolve(SaveSession, Message.CompletedSaveSession()),
      expect(text("Loading your workspaces…")).toExist(),
      Command.resolve(LoadWorkspaces, Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      expect(text("Opening…")).toExist(),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      Subscription.emit(Message.GotMemberships({ memberships: [{ membership: aliceInGeneral, pending: false }] })),
      click(role("button", { name: "General" })),
      expect(text("No threads yet.")).toExist(),
      // A thread the person started shows at once, marked as sending.
      Subscription.emit(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), task: Option.none(), pending: true, unread: 0 }]
        })
      ),
      expect(text(" · Sending…")).toExist(),
      click(role("button", { name: "Plans for the week" })),
      Subscription.emit(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0,
          task: Option.none(),
          turns: []
        })
      ),
      expect(text("Plans for the week")).toExist(),
      type(label("Reply"), "Sounds good"),
      Command.resolve(TellTyping, Message.ToldTyping()),
      click(role("button", { name: "Reply" })),
      Command.expectExact(
        PostReply({ threadId: thread.id, text: "Sounds good" }),
        TellTyping({ apiUrl, token: session.token, workspaceId: membership.workspace.id, threadId: null })
      ),
      Command.resolve(PostReply, Message.WroteAction()),
      Command.resolve(TellTyping, Message.ToldTyping()),
      // One the server refused says why, until it is dismissed.
      Subscription.emit(
        Message.GotActions({
          actions: [
            {
              key: "refused",
              tag: "ThreadMessagePosted",
              what: "post a reply",
              text: Option.some("Sounds good"),
              rejection: Option.some("You may not post in this thread")
            }
          ]
        })
      ),
      expect(text("Couldn't post a reply: You may not post in this thread")).toExist(),
      click(role("button", { name: "Dismiss" })),
      Command.resolve(Dismiss, Message.CompletedDismiss()),
      Subscription.emit(Message.GotActions({ actions: [] })),
      expect(text("Couldn't post a reply: You may not post in this thread")).toBeAbsent(),
      click(role("button", { name: "Sign out" })),
      Command.resolve(SignOut, Message.CompletedSignOut()),
      expect(role("button", { name: "Send a code" })).toExist()
    )
  })

  it("a person joins a team they may, starts one, sees it at once, and admits and removes its members", () => {
    const groups = (pending: boolean) =>
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: design, pending },
            { group: research, pending: false }
          ]
        })
      )
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: research, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: aliceOwns, pending: false },
            { assignment: bobIsMember, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotMemberships({ memberships: [{ membership: aliceInGeneral, pending: false }] })),
      inside(role("list", { name: "Your groups" }), expect(role("button", { name: "General" })).toExist()),
      // A team the person may join shows its members, but not its threads, nor managing it.
      click(role("button", { name: "Research" })),
      expect(text("Join this team to read its threads.")).toExist(),
      expect(label("Add a member")).toBeAbsent(),
      inside(role("list", { name: "Other teams" }), click(role("button", { name: "Join" }))),
      Command.expectExact(JoinGroup({ groupId: research.id })),
      Command.resolve(JoinGroup, Message.WroteAction()),
      click(role("button", { name: "New team" })),
      type(label("Team name"), "Design"),
      click(role("checkbox", { name: "Anyone in the workspace can join" })),
      click(role("button", { name: "Create team" })),
      Command.expectExact(CreateTeam({ name: "Design", memberIds: [membership.member.id], visibility: "Public" })),
      Command.resolve(CreateTeam, Message.WroteAction()),
      expect(role("form", { name: "New team" })).toBeAbsent(),
      // The team shows at once among the person's groups, marked as sending.
      groups(true),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: true }
          ]
        })
      ),
      inside(role("list", { name: "Your groups" }), expect(text(" · Sending…")).toExist()),
      groups(false),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false }
          ]
        })
      ),
      click(role("button", { name: "Design" })),
      inside(
        role("region", { name: "Members" }),
        expect(text("Alice")).toExist(),
        change(label("Add a member"), bob.id),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(AddGroupMember({ groupId: design.id, memberId: bob.id })),
      Command.resolve(AddGroupMember, Message.WroteAction()),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: false }
          ]
        })
      ),
      // Everyone but the person can be removed; once each workspace member belongs, none is left to add.
      inside(
        role("region", { name: "Members" }),
        expect(label("Add a member")).toBeAbsent(),
        click(role("button", { name: "Remove" }))
      ),
      Command.expectExact(RemoveGroupMember({ groupId: design.id, membershipId: bobInDesign.id })),
      Command.resolve(RemoveGroupMember, Message.WroteAction())
    )
  })

  it("an owner manages the workspace from its settings, and a member sees only what they may change", () => {
    const invitation = Schema.decodeSync(Invitation.Invitation)({
      details: {
        recipientId: "carol",
        recipientEmail: "carol@example.com",
        roleId: BuiltinRoles.MemberId,
        expiresAt: "2026-10-25T12:00:00Z",
        id: "invitation-1",
        workspaceId: "workspace-1",
        inviterMemberId: "member-1",
        issuedAt: "2026-10-18T12:00:00Z"
      },
      state: { _tag: "Pending" }
    })
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: aliceOwns, pending: false },
            { assignment: bobIsMember, pending: false }
          ]
        })
      ),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Rename workspace" })).toExist(),
      inside(role("region", { name: "Workspace members" }), change(label("Role of Bob"), BuiltinRoles.AdministratorId)),
      Command.expectExact(
        ChangeRole({ memberId: bob.id, roleId: BuiltinRoles.AdministratorId, expectedAssignmentIds: [bobIsMember.id] })
      ),
      Command.resolve(ChangeRole, Message.WroteAction()),
      inside(
        role("region", { name: "Workspace members" }),
        expect(role("button", { name: "Remove" })).toExist(),
        expect(role("button", { name: "Make owner" })).toExist()
      ),
      inside(
        role("region", { name: "Invitations" }),
        type(label("Email"), "carol@example.com"),
        click(role("button", { name: "Invite" }))
      ),
      Command.expectExact(Invite({ email: "carol@example.com", roleId: BuiltinRoles.MemberId })),
      Command.resolve(Invite, Message.WroteAction()),
      // An invitation on its way shows by the address the person gave, until the server issues it.
      Subscription.emit(
        Message.GotActions({
          actions: [
            {
              key: "inviting",
              tag: "InvitationIssued",
              what: "invite someone",
              text: Option.some("carol@example.com"),
              rejection: Option.none()
            }
          ]
        })
      ),
      inside(role("region", { name: "Invitations" }), expect(text("carol@example.com")).toExist()),
      Subscription.emit(Message.GotActions({ actions: [] })),
      Subscription.emit(Message.GotInvitations({ invitations: [{ invitation, pending: false }] })),
      inside(
        role("region", { name: "Invitations" }),
        expect(text("carol@example.com · Member, until 2026-10-25")).toExist(),
        click(role("button", { name: "Revoke" }))
      ),
      Command.expectExact(RevokeInvitation({ invitationId: invitation.details.id })),
      Command.resolve(RevokeInvitation, Message.WroteAction()),
      // Once bob owns the workspace and alice is a member, she may change only her own name.
      Subscription.emit(
        Message.GotWorkspace({ workspace: { ...membership.workspace, ownerMemberId: bob.id }, pending: false })
      ),
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: roleOf("assignment-3", membership.member.id, BuiltinRoles.MemberId), pending: false },
            { assignment: roleOf("assignment-4", bob.id, BuiltinRoles.OwnerId), pending: false }
          ]
        })
      ),
      expect(role("button", { name: "Rename workspace" })).toBeAbsent(),
      expect(role("button", { name: "Change your name" })).toExist(),
      expect(label("Role of Bob")).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      expect(role("button", { name: "Make owner" })).toBeAbsent(),
      expect(role("region", { name: "Invitations" })).toBeAbsent()
    )
  })

  it("a person makes a thread a task and changes it, stops and retries its turns, and follows a turn's log", () => {
    const running = turnOf("turn-1", "running")
    const failed = turnOf("turn-2", "failed")
    const got = (taskOf: Option.Option<typeof task>, turns: ReadonlyArray<typeof running>) =>
      Subscription.emit(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: opening, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0,
          task: Option.map(taskOf, (value) => ({ task: value, pending: false })),
          turns: turns.map((turn) => ({ turn, pending: false, retryOpen: turn.status === "failed" }))
        })
      )
    const at = DateTime.makeUnsafe("2026-10-18T12:02:01Z")
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false },
            { member: scout, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(Message.GotAssignments({ assignments: [{ assignment: aliceOwns, pending: false }] })),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: scoutInGeneral, pending: false }
          ]
        })
      ),
      click(role("button", { name: "General" })),
      Subscription.emit(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), task: Option.some(task), pending: false, unread: 0 }]
        })
      ),
      expect(text(" · Triage")).toExist(),
      click(role("button", { name: "Plans for the week" })),
      got(Option.none(), [running, failed]),
      click(role("button", { name: "Make it a task" })),
      Command.expectExact(CreateTask({ threadId: thread.id })),
      Command.resolve(CreateTask, Message.WroteAction()),
      got(Option.some(task), [running, failed]),
      inside(role("region", { name: "Task" }), change(label("Status"), "doing")),
      Command.expectExact(
        UpdateTask({ threadId: thread.id, change: Task.Change.cases.Status.make({ from: "triage", to: "doing" }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      inside(role("region", { name: "Task" }), change(label("Assignee"), scout.id)),
      Command.expectExact(
        UpdateTask({ threadId: thread.id, change: Task.Change.cases.Assignee.make({ from: null, to: scout.id }) })
      ),
      Command.resolve(UpdateTask, Message.WroteAction()),
      inside(
        role("region", { name: "Turns" }),
        expect(text("The model was unavailable.")).toExist(),
        click(role("button", { name: "Stop" }))
      ),
      Command.expectExact(StopTurn({ turnId: running.id })),
      Command.resolve(StopTurn, Message.WroteAction()),
      inside(role("region", { name: "Turns" }), click(role("button", { name: "Retry" }))),
      Command.expectExact(RetryTurn({ turnId: failed.id })),
      Command.resolve(RetryTurn, Message.WroteAction()),
      got(Option.some(task), [running]),
      click(role("button", { name: "Show log" })),
      inside(role("region", { name: "Log" }), expect(text("Opening the log…")).toExist()),
      Subscription.emit(
        Message.GotTurnLog({
          turnId: running.id,
          message: Turn.LogMessage.cases.Opened.make({
            items: [Turn.LogItem.cases.InputTaken.make({ at, messages: 1 })]
          })
        })
      ),
      Subscription.emit(
        Message.GotTurnLog({
          turnId: running.id,
          message: Turn.LogMessage.cases.Changed.make({
            changes: [
              {
                index: 1,
                item: Turn.LogItem.cases.Responded.make({
                  at,
                  responseId: "response-1",
                  text: "Looks good.",
                  parts: [0],
                  reply: true
                })
              }
            ]
          })
        })
      ),
      Subscription.emit(Message.GotTurnLog({ turnId: running.id, message: Turn.LogMessage.cases.Ended.make({}) })),
      inside(
        role("region", { name: "Log" }),
        expect(text("Read 1 message")).toExist(),
        expect(text("Replied: Looks good.")).toExist(),
        expect(text("The turn has ended.")).toExist()
      ),
      click(role("button", { name: "Hide log" })),
      expect(role("region", { name: "Log" })).toBeAbsent(),
      // Without the grants to, the person sees the task and the turns, and changes neither.
      Subscription.emit(Message.GotAssignments({ assignments: [] })),
      got(Option.some({ ...task, status: "doing", assignee: scout.id }), [running]),
      inside(role("region", { name: "Task" }), expect(text("Doing · No priority · Assigned to Scout")).toExist()),
      expect(label("Status")).toBeAbsent(),
      expect(role("button", { name: "Stop" })).toBeAbsent(),
      expect(role("button", { name: "Show log" })).toExist()
    )
  })

  it("an owner adds and manages connections, and a member sees them without the controls", () => {
    const models = connectionOf("connection-1", "Models")
    const member = { apiUrl, token: session.token, workspaceId: membership.workspace.id }
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(Message.GotAssignments({ assignments: [{ assignment: aliceOwns, pending: false }] })),
      click(role("button", { name: "Connections" })),
      Command.expectExact(LoadIntegrations(member)),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(LoadIntegrations, Message.GotIntegrations({ integrations: [testApi] })),
      expect(text("No connections yet.")).toExist(),
      click(role("button", { name: "Add a connection" })),
      inside(
        role("form", { name: "Add a connection" }),
        change(label("Integration"), testApi.id),
        expect(label("API key")).toExist(),
        change(label("Authentication"), "none"),
        expect(label("API key")).toBeAbsent(),
        type(label("Base URL"), "http://127.0.0.1:9999"),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        AddConnection({
          ...member,
          integration: testApi.id,
          name: "Test API",
          auth: "none",
          apiKey: "",
          settings: { url: "http://127.0.0.1:9999" }
        })
      ),
      expect(text("Adding…")).toExist(),
      Command.resolve(AddConnection, Message.AddedConnection()),
      expect(role("form", { name: "Add a connection" })).toBeAbsent(),
      Subscription.emit(Message.GotConnections({ connections: [{ connection: models, pending: false }] })),
      inside(
        role("region", { name: "Connections" }),
        expect(text(" · Test API · Ready")).toExist(),
        click(role("button", { name: "Check" }))
      ),
      Command.expectExact(CheckConnection({ ...member, connectionId: models.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({
          connectionId: models.id,
          health: { status: "unauthorized", description: "The key was refused" }
        })
      ),
      expect(text("It refused the key: The key was refused")).toExist(),
      click(role("button", { name: "Change settings" })),
      inside(role("form", { name: "Change the connection's settings" }), expect(label("Base URL")).toExist()),
      click(role("button", { name: "Cancel" })),
      // An ordinary member reads the connections, and manages none of them.
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: roleOf("assignment-3", membership.member.id, BuiltinRoles.MemberId), pending: false }
          ]
        })
      ),
      expect(text(" · Test API · Ready")).toExist(),
      expect(role("button", { name: "Check" })).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      expect(role("button", { name: "Add a connection" })).toBeAbsent()
    )
  })

  it("an owner adds an agent on a connection's model and changes its setup, and a member reads how it runs", () => {
    const member = { apiUrl, token: session.token, workspaceId: membership.workspace.id }
    const models = keylessConnection("models-1", "test-models", "Models")
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(Message.GotAssignments({ assignments: [{ assignment: aliceOwns, pending: false }] })),
      Subscription.emit(Message.GotConnections({ connections: [{ connection: models, pending: false }] })),
      click(role("button", { name: "Agents" })),
      Command.resolve(
        LoadIntegrations,
        Message.GotIntegrations({ integrations: [integrationGiving("test-models", "Test models", ["models"])] })
      ),
      expect(text("No agents yet.")).toExist(),
      click(role("button", { name: "Add an agent" })),
      inside(
        role("form", { name: "Add an agent" }),
        type(label("Name"), "Scout"),
        change(label("Model connection"), models.id)
      ),
      Command.expectExact(LoadModels({ ...member, connectionId: models.id })),
      Command.resolve(LoadModels, Message.GotModels({ connectionId: models.id, models: offered })),
      inside(
        role("form", { name: "Add an agent" }),
        change(label("Model"), "test-model"),
        change(label("Effort"), "low"),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        CreateAgent({
          name: "Scout",
          roleId: BuiltinRoles.MemberId,
          configuration: {
            instructions: "",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model", effort: "low" },
            sandbox: null
          }
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction()),
      Subscription.emit(Message.GotMembers({ members: [{ member: scout, pending: true }] })),
      Subscription.emit(Message.GotAgents({ agents: [{ agent: scoutAgent, pending: true }] })),
      inside(role("region", { name: "Agents" }), expect(text(" · Sending…")).toExist()),
      Subscription.emit(Message.GotAgents({ agents: [{ agent: scoutAgent, pending: false }] })),
      inside(
        role("region", { name: "Agents" }),
        expect(text(" · Ready")).toExist(),
        expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist(),
        click(role("button", { name: "Change setup" }))
      ),
      Command.resolve(LoadModels, Message.GotModels({ connectionId: models.id, models: offered })),
      inside(role("form", { name: "Change the agent's setup" }), expect(label("Model ID")).toExist()),
      click(role("button", { name: "Cancel" })),
      // A member reads how the agent runs, and changes none of it.
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: roleOf("assignment-3", membership.member.id, BuiltinRoles.MemberId), pending: false }
          ]
        })
      ),
      expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist(),
      expect(role("button", { name: "Change setup" })).toBeAbsent(),
      expect(role("button", { name: "Add an agent" })).toBeAbsent()
    )
  })

  it("an owner adds a channel and moves it, a member reads where it opens, and a contact's message bears their name", () => {
    const channels = keylessConnection("channels-1", "test-channels", "Chat")
    const fromDana = Schema.decodeSync(ThreadMessage.ThreadMessage)({
      ...Schema.encodeSync(ThreadMessage.ThreadMessage)(opening),
      id: "message-3",
      author: { _tag: "Contact", contactId: dana.id }
    })
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotRoles({ roles })),
      Subscription.emit(Message.GotAssignments({ assignments: [{ assignment: aliceOwns, pending: false }] })),
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: design, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false }
          ]
        })
      ),
      Subscription.emit(Message.GotConnections({ connections: [{ connection: channels, pending: false }] })),
      click(role("button", { name: "Channels" })),
      Command.resolve(
        LoadIntegrations,
        Message.GotIntegrations({ integrations: [integrationGiving("test-channels", "Test channels", ["channels"])] })
      ),
      expect(text("No channels yet.")).toExist(),
      click(role("button", { name: "Add a channel" })),
      inside(
        role("form", { name: "Add a channel" }),
        change(label("Connection"), channels.id),
        change(label("Opens conversations in"), general.id),
        type(label("Name"), "Support"),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        CreateChannel({ connectionId: channels.id, groupId: general.id, name: "Support", opensTasks: false })
      ),
      Command.resolve(CreateChannel, Message.WroteAction()),
      Subscription.emit(Message.GotChannels({ channels: [{ channel: support, pending: false }] })),
      inside(
        role("region", { name: "Channels" }),
        expect(text(" · from Chat into General")).toExist(),
        click(role("button", { name: "Move" }))
      ),
      inside(
        role("form", { name: "Move the channel" }),
        change(label("Opens new conversations in"), design.id),
        click(role("button", { name: "Move" }))
      ),
      Command.expectExact(RedirectChannel({ channelId: support.id, groupId: design.id })),
      Command.resolve(RedirectChannel, Message.WroteAction()),
      // A member reads where it opens, and manages nothing.
      Subscription.emit(
        Message.GotAssignments({
          assignments: [
            { assignment: roleOf("assignment-3", membership.member.id, BuiltinRoles.MemberId), pending: false }
          ]
        })
      ),
      expect(role("button", { name: "Move" })).toBeAbsent(),
      expect(role("button", { name: "Add a channel" })).toBeAbsent(),
      // In a thread the channel opened, the contact's message bears the name they gave.
      Subscription.emit(Message.GotContacts({ contacts: [dana] })),
      click(role("button", { name: "General" })),
      Subscription.emit(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(fromDana), task: Option.none(), pending: false, unread: 0 }]
        })
      ),
      click(role("button", { name: "Plans for the week" })),
      Subscription.emit(
        Message.GotThread({
          threadId: thread.id,
          messages: [{ message: fromDana, pending: false }],
          following: Option.none(),
          latest: 0,
          readThrough: 0,
          task: Option.none(),
          turns: []
        })
      ),
      inside(role("region", { name: "Thread" }), expect(text("Dana")).toExist())
    )
  })

  it("a person sees who has the workspace open among a team's members, and who types in the open thread", () => {
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(
        Message.GotGroups({
          groups: [
            { group: general, pending: false },
            { group: design, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotMemberships({
          memberships: [
            { membership: aliceInGeneral, pending: false },
            { membership: aliceInDesign, pending: false },
            { membership: bobInDesign, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotPresence({
          present: [
            { memberId: membership.member.id, typingIn: null },
            { memberId: bob.id, typingIn: thread.id }
          ]
        })
      ),
      click(role("button", { name: "Design" })),
      inside(role("region", { name: "Members" }), expect(text(" · online")).toExist()),
      // Bob types in general's thread: whoever opens it sees him typing.
      click(role("button", { name: "General" })),
      Subscription.emit(
        Message.GotThreads({
          groupId: general.id,
          threads: [{ thread, opening: Option.some(opening), task: Option.none(), pending: false, unread: 0 }]
        })
      ),
      click(role("button", { name: "Plans for the week" })),
      expect(text("Bob is typing…")).toExist(),
      Subscription.emit(Message.GotPresence({ present: [{ memberId: bob.id, typingIn: null }] })),
      expect(text("Bob is typing…")).toBeAbsent()
    )
  })

  it("a person sees how many notifications wait, reads them in the inbox, and opens one's thread", () => {
    const notification = notificationOf("notification-1", 2, 5)
    scene(
      { update, view },
      given(signedIn),
      Subscription.emit(Message.SucceededLoadWorkspaces({ memberships: [membership] })),
      click(role("button", { name: "Studio" })),
      ManagedResource.acquire(managedResources.store),
      Subscription.emit(Message.GotGroups({ groups: [{ group: general, pending: false }] })),
      Subscription.emit(
        Message.GotMembers({
          members: [
            { member: membership.member, pending: false },
            { member: bob, pending: false }
          ]
        })
      ),
      Subscription.emit(
        Message.GotInbox({
          items: [
            {
              notification,
              pending: false,
              thread: Option.some(thread),
              opening: Option.some(opening),
              message: Option.some(reply)
            }
          ]
        })
      ),
      click(role("button", { name: "Inbox (1)" })),
      expect(text("Bob: Sounds good · Plans for the week in General")).toExist(),
      click(role("button", { name: "Mark all seen" })),
      Command.expectExact(
        MarkAllNotificationsSeen({ through: { recordedAt: notification.recordedAt, id: notification.id } })
      ),
      Command.resolve(MarkAllNotificationsSeen, Message.WroteAction()),
      click(role("button", { name: "Open" })),
      expect(role("region", { name: "Thread" })).toExist(),
      // Once nothing waits, the inbox says so.
      Subscription.emit(Message.GotInbox({ items: [] })),
      click(role("button", { name: "Inbox" })),
      expect(text("Nothing new.")).toExist()
    )
  })
})
