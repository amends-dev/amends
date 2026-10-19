import { GrantResolver } from "@amends-dev/core/authorization"
import { describe, it } from "@effect/vitest"
import { Option } from "effect"
import { Subscription, click, expect, given, inside, role, scene, text } from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceInGeneral,
  aliceOwns,
  bob,
  bobIsMember,
  connectionOf,
  general,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  notificationOf,
  opening,
  reply,
  roles,
  support,
  testApi,
  thread
} from "../../../test/fixtures.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { Integrations } from "../../feature/connections/definition.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { WorkspaceBlock } from "./block.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const opened = init(workspace.id, member.id, workspace.name).model

const workspaceSubscriptions = WorkspaceBlock.subscriptions

/** The inbox read, with a notification of Bob's reply in a thread of general. */
const withNotification = modifyFields(opened, {
  inbox: (inbox) =>
    modifyFields(inbox, {
      items: () => [
        {
          notification: notificationOf("notification-1", 2, 5),
          thread: Option.some(thread),
          opening: Option.some(opening),
          message: Option.some(reply)
        }
      ],
      groups: () => [general],
      members: () => [member, bob]
    })
})

/** The connections as an owner of the workspace sees them, once the host listed the test API. */
const asOwner = modifyFields(opened, {
  connections: (connections) =>
    modifyFields(connections, {
      integrations: () => Integrations.Loaded({ integrations: [testApi] }),
      grants: () => GrantResolver.grantsOf([aliceOwns], (roleId) => roles.find(({ id }) => id === roleId))
    })
})

/** The owner's view of the workspace, with one connection to the test API read. */
const withConnection = modifyFields(asOwner, {
  connections: (connections) =>
    modifyFields(connections, {
      connections: () => [{ connection: connectionOf("connection-1", "Models"), pending: false }]
    })
})

/** The channels as an owner of the workspace sees them: one over a connection that gives channels, in general. */
const withChannel = modifyFields(opened, {
  channels: (channels) =>
    modifyFields(channels, {
      integrations: () =>
        Integrations.Loaded({ integrations: [integrationGiving("test-channels", "Test channels", ["channels"])] }),
      connections: () => [{ connection: keylessConnection("channels-1", "test-channels", "Chat"), pending: false }],
      groups: () => [general],
      memberships: () => [aliceInGeneral],
      members: () => [member],
      channels: () => [{ channel: support, pending: false }],
      grants: () => grantsOf([aliceOwns])
    })
})

/** The settings read, as the owner of the workspace reads them, bob being a member of it. */
const withSettings = modifyFields(opened, {
  settings: (settings) =>
    modifyFields(settings, {
      workspace: () => Option.some({ workspace, pending: false }),
      members: () => [member, bob].map((item) => ({ member: item, pending: false })),
      roles: () => roles,
      assignments: () => [aliceOwns, bobIsMember].map((assignment) => ({ assignment, pending: false })),
      grants: () => grantsOf([aliceOwns])
    })
})

describe("a workspace", () => {
  it("shows how many notifications wait beside the inbox, which it shows on request", () => {
    scene(
      { update, view },
      given(withNotification),
      expect(role("button", { name: "Inbox (1)" })).toExist(),
      expect(role("region", { name: "Inbox" })).toBeAbsent(),
      click(role("button", { name: "Inbox (1)" })),
      expect(role("region", { name: "Inbox" })).toExist(),
      expect(text("Bob: Sounds good · Plans for the week in General")).toExist()
    )
  })

  it("names the inbox alone while nothing waits in it", () => {
    scene(
      { update, view },
      given(opened),
      expect(role("button", { name: "Inbox" })).toExist(),
      click(role("button", { name: "Inbox" })),
      expect(text("Nothing new.")).toExist()
    )
  })

  it("reads the inbox whichever destination it shows", () => {
    scene(
      { update, view, subscriptions: workspaceSubscriptions },
      given(opened),
      expect(role("region", { name: "Inbox" })).toBeAbsent(),
      Subscription.emit(
        workspaceSubscriptions["inbox/inbox"],
        InboxBlock.Message.ReceivedInbox({ items: withNotification.inbox.items })
      ),
      expect(role("button", { name: "Inbox (1)" })).toExist(),
      expect(role("region", { name: "Inbox" })).toBeAbsent()
    )
  })

  it("shows the connections on request, with what the person may do with them", () => {
    scene(
      { update, view },
      given(withConnection),
      expect(role("button", { name: "Connections" })).toExist(),
      expect(role("region", { name: "Connections" })).toBeAbsent(),
      click(role("button", { name: "Connections" })),
      expect(role("region", { name: "Connections" })).toExist(),
      expect(text(" · Test API · Ready")).toExist(),
      expect(role("button", { name: "Add a connection" })).toExist()
    )
  })

  it("reads the connections whichever destination it shows", () => {
    scene(
      { update, view, subscriptions: workspaceSubscriptions },
      given(asOwner),
      Subscription.emit(
        workspaceSubscriptions["connections/connections"],
        ConnectionsBlock.Message.ReceivedConnections({ connections: withConnection.connections.connections })
      ),
      expect(role("region", { name: "Connections" })).toBeAbsent(),
      click(role("button", { name: "Connections" })),
      expect(text(" · Test API · Ready")).toExist()
    )
  })

  it("shows the settings on request, as the owner reads them", () => {
    scene(
      { update, view },
      given(withSettings),
      expect(role("region", { name: "Settings" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(
        role("region", { name: "Settings" }),
        expect(role("button", { name: "Rename workspace" })).toExist(),
        expect(text("Bob")).toExist()
      )
    )
  })

  it("reads the settings whichever destination it shows", () => {
    scene(
      { update, view, subscriptions: workspaceSubscriptions },
      given(opened),
      Subscription.emit(
        workspaceSubscriptions["settings/settings"],
        SettingsBlock.Message.ReceivedSettings({
          workspace: withSettings.settings.workspace,
          members: withSettings.settings.members,
          roles: withSettings.settings.roles,
          assignments: withSettings.settings.assignments,
          invitations: withSettings.settings.invitations,
          grants: withSettings.settings.grants
        })
      ),
      expect(role("region", { name: "Settings" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(role("region", { name: "Settings" }), expect(role("button", { name: "Rename workspace" })).toExist())
    )
  })

  it("shows the channels on request, with what the person may do with them", () => {
    scene(
      { update, view },
      given(withChannel),
      expect(role("button", { name: "Channels" })).toExist(),
      expect(role("region", { name: "Channels" })).toBeAbsent(),
      click(role("button", { name: "Channels" })),
      inside(
        role("region", { name: "Channels" }),
        expect(text(" · from Chat into General · opens tasks")).toExist(),
        expect(role("button", { name: "Add a channel" })).toExist()
      )
    )
  })

  it("reads the channels whichever destination it shows", () => {
    scene(
      { update, view, subscriptions: workspaceSubscriptions },
      given(withChannel),
      Subscription.emit(
        workspaceSubscriptions["channels/channels"],
        ChannelsBlock.Message.ReceivedChannels({ channels: [] })
      ),
      expect(role("region", { name: "Channels" })).toBeAbsent(),
      click(role("button", { name: "Channels" })),
      expect(text("No channels yet.")).toExist()
    )
  })
})
