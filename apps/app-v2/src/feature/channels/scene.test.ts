import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Channel } from "@amends-dev/core/channel"
import { Group } from "@amends-dev/core/group"
import { describe, it } from "@effect/vitest"
import { Schema } from "effect"
import {
  Command,
  Subscription,
  change,
  click,
  expect,
  given,
  inside,
  label,
  role,
  scene,
  text,
  type
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceInDesign,
  aliceInGeneral,
  aliceOwns,
  bob,
  design,
  general,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  roleOf,
  support
} from "../../../test/fixtures.ts"
import { Integrations } from "../connections/definition.ts"
import { ChannelsBlock } from "./block.ts"
import { CreateChannel, LoadIntegrations, RedirectChannel, RemoveChannel } from "./command.ts"
import { Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }
const workspaceId = workspace.id

const ownerGrants = grantsOf([aliceOwns])
const memberGrants = grantsOf([roleOf("assignment-3", member.id, BuiltinRoles.MemberId)])

const channelsIntegration = integrationGiving("test-channels", "Test channels", ["channels"])
const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
const chat = keylessConnection("channels-1", "test-channels", "Chat")
const providers = keylessConnection("models-1", "test-models", "Models")

/** The workspace as its owner reads it, with no channel yet: two connections, one giving channels, and two groups, one hers. */
const opened: Model = modifyFields(init(workspace.id, member.id).model, {
  integrations: () => Integrations.Loaded({ integrations: [channelsIntegration, modelsIntegration] }),
  connections: () => [
    { connection: chat, pending: false },
    { connection: providers, pending: false }
  ],
  groups: () => [general, design],
  memberships: () => [aliceInGeneral],
  members: () => [member, bob],
  grants: () => ownerGrants
})

/** A conversation between alice and bob. */
const withBob = Schema.decodeSync(Group.Group)({
  id: "direct-1",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** The workspace's channel, over the chat connection, opening tasks in general. */
const withSupport: Model = modifyFields(opened, { channels: () => [{ channel: support, pending: false }] })

describe("the channels", () => {
  it("are added by an owner over a connection that gives channels, into a group they belong to", () => {
    scene(
      { update, view, subscriptions: ChannelsBlock.subscriptions },
      given(opened),
      expect(role("heading", { name: "No channels yet", level: 2 })).toExist(),
      click(role("button", { name: "Add a channel" })),
      expect(role("region", { name: "Add a channel" })).toExist(),
      inside(
        role("form", { name: "Add a channel" }),
        expect(role("option", { name: "Chat" })).toExist(),
        expect(role("option", { name: "Models" })).toBeAbsent(),
        expect(role("option", { name: "General" })).toExist(),
        expect(role("option", { name: "Design" })).toBeAbsent(),
        change(label("Connection"), chat.id),
        change(label("Opens conversations in"), general.id),
        type(label("Name"), "Sales"),
        click(role("switch", { name: "Each conversation is a task in triage" })),
        click(role("button", { name: "Add" }))
      ),
      Command.expectExact(
        CreateChannel({ ...asMember, connectionId: chat.id, groupId: general.id, name: "Sales", opensTasks: true })
      ),
      Command.resolve(CreateChannel, Message.WroteAction()),
      expect(role("form", { name: "Add a channel" })).toBeAbsent(),
      Subscription.emit(subscriptions.channels, Message.ReceivedChannels({ channels: withSupport.channels })),
      inside(
        role("list", { name: "Channels" }),
        expect(text("Support")).toExist(),
        expect(text("Opens tasks")).toExist(),
        expect(text("From Chat into General")).toExist()
      )
    )
  })

  it("refuse a channel that lacks its connection, its group, or its name, and say which", () => {
    scene(
      { update, view },
      given(opened),
      click(role("button", { name: "Add a channel" })),
      inside(role("form", { name: "Add a channel" }), click(role("button", { name: "Add" }))),
      expect(text("Choose the connection that receives its conversations.")).toExist(),
      inside(
        role("form", { name: "Add a channel" }),
        change(label("Connection"), chat.id),
        click(role("button", { name: "Add" }))
      ),
      expect(text("Choose the connection that receives its conversations.")).toBeAbsent(),
      expect(text("Choose the group its conversations open in.")).toExist(),
      inside(
        role("form", { name: "Add a channel" }),
        change(label("Opens conversations in"), general.id),
        click(role("button", { name: "Add" }))
      ),
      expect(text("Name the channel.")).toExist(),
      inside(role("form", { name: "Add a channel" }), click(role("button", { name: "Cancel" }))),
      expect(role("form", { name: "Add a channel" })).toBeAbsent()
    )
  })

  it("offer a team to open conversations in once the person is admitted to it", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { memberships: () => [aliceInGeneral, aliceInDesign] })),
      click(role("button", { name: "Add a channel" })),
      inside(
        role("form", { name: "Add a channel" }),
        expect(role("option", { name: "General" })).toExist(),
        expect(role("option", { name: "Design" })).toExist()
      )
    )
  })

  it("are sent to open their conversations in another group, and removed, by an owner", () => {
    scene(
      { update, view },
      given(modifyFields(withSupport, { memberships: () => [aliceInGeneral, aliceInDesign] })),
      expect(text("From Chat into General")).toExist(),
      click(role("button", { name: "Move" })),
      inside(
        role("form", { name: "Move the channel" }),
        change(label("Opens new conversations in"), design.id),
        click(role("button", { name: "Move" }))
      ),
      Command.expectExact(RedirectChannel({ ...asMember, channelId: support.id, groupId: design.id })),
      Command.resolve(
        RedirectChannel,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(text("This browser could not keep that. Try again.")).toExist(),
      click(role("button", { name: "Remove" })),
      Command.expectExact(RemoveChannel({ ...asMember, channelId: support.id })),
      Command.resolve(RemoveChannel, Message.WroteAction()),
      expect(text("This browser could not keep that. Try again.")).toBeAbsent()
    )
  })

  it("refuse to send them to a group the person does not belong to, and say so", () => {
    scene(
      { update, view },
      given(modifyFields(withSupport, { memberships: () => [] })),
      click(role("button", { name: "Move" })),
      inside(role("form", { name: "Move the channel" }), click(role("button", { name: "Move" }))),
      expect(text("Choose the group its conversations open in.")).toExist(),
      inside(role("form", { name: "Move the channel" }), click(role("button", { name: "Cancel" }))),
      expect(role("form", { name: "Move the channel" })).toBeAbsent()
    )
  })

  it("show an ordinary member each channel and where it opens, and none of the controls", () => {
    scene(
      { update, view, subscriptions: ChannelsBlock.subscriptions },
      given(modifyFields(withSupport, { grants: () => memberGrants })),
      inside(
        role("list", { name: "Channels" }),
        expect(text("Support")).toExist(),
        expect(text("Opens tasks")).toExist(),
        expect(text("From Chat into General")).toExist()
      ),
      expect(role("button", { name: "Add a channel" })).toBeAbsent(),
      expect(role("button", { name: "Move" })).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      // Once the person is given the role that manages them, the controls appear.
      Subscription.emit(subscriptions.channels, Message.ReceivedGrants({ grants: ownerGrants })),
      expect(role("button", { name: "Add a channel" })).toExist(),
      expect(role("button", { name: "Move" })).toExist(),
      expect(role("button", { name: "Remove" })).toExist()
    )
  })

  it("say where a channel's conversations come from and open even when the person no longer sees them", () => {
    scene(
      { update, view },
      given(modifyFields(withSupport, { connections: () => [], groups: () => [] })),
      expect(text("From a removed connection into a group you don't see")).toExist()
    )
  })

  it("name a conversation's group by the others in it", () => {
    scene(
      { update, view },
      given(
        modifyFields(withSupport, {
          groups: () => [withBob],
          channels: () => [{ channel: Channel.change(support, { groupId: withBob.id }), pending: false }]
        })
      ),
      expect(text("From Chat into Bob")).toExist()
    )
  })

  it("say a channel is changing while its change is on its way, and offer no control for it", () => {
    scene(
      { update, view },
      given(modifyFields(withSupport, { channels: () => [{ channel: support, pending: true }] })),
      inside(
        role("list", { name: "Channels" }),
        expect(text("Support")).toExist(),
        expect(text(" · Sending…")).toExist()
      ),
      expect(role("button", { name: "Move" })).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent()
    )
  })

  it("offer adding only over a connection that gives channels", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { connections: () => [{ connection: providers, pending: false }] })),
      expect(text("A channel needs a connection that gives channels.")).toExist(),
      expect(role("button", { name: "Add a channel" })).toBeAbsent()
    )
  })

  it("say why the integrations could not be listed, and ask again, offering to add only once they are", () => {
    scene(
      { update, view },
      given(
        modifyFields(opened, {
          integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(role("button", { name: "Add a channel" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadIntegrations({ workspaceId })),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(LoadIntegrations, Message.ReceivedIntegrations({ integrations: [channelsIntegration] })),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("button", { name: "Add a channel" })).toExist()
    )
  })

  it("ask an ordinary member nothing about the integrations", () => {
    scene(
      { update, view },
      given(modifyFields(init(workspace.id, member.id).model, { grants: () => memberGrants })),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("heading", { name: "No channels yet", level: 2 })).toExist()
    )
  })

  it("say why they could not be read", () => {
    scene(
      { update, view, subscriptions: ChannelsBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.channels,
        Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist(),
      expect(role("alert")).toExist()
    )
  })
})
