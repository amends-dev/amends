import { ChannelId } from "@amends-dev/core/channel"
import { Group, GroupId } from "@amends-dev/core/group"
import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import {
  aliceInDesign,
  aliceInGeneral,
  bob,
  design,
  general,
  integrationGiving,
  keylessConnection,
  membership,
  support
} from "../../../test/fixtures.ts"
import { connectionsGiving, Integrations } from "../../data/connections.ts"
import { CreateChannel, RedirectChannel, RemoveChannel } from "./command.ts"
import { destinations, Form, groupNameOf, Message, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }

const channelsIntegration = integrationGiving("test-channels", "Test channels", ["channels"])
const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
const chat = keylessConnection("channels-1", "test-channels", "Chat")
const providers = keylessConnection("models-1", "test-models", "Models")

/** A conversation between alice and bob. */
const withBob = Schema.decodeSync(Group.Group)({
  id: "direct-1",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-1", "member-2"],
  createdBy: "member-1",
  createdAt: "2026-10-18T12:00:00Z"
})

/** A conversation between bob and someone else, which alice does not belong to. */
const bobAndScout = Schema.decodeSync(Group.Group)({
  id: "direct-2",
  workspaceId: "workspace-1",
  kind: "Direct",
  memberIds: ["member-2", "member-3"],
  createdBy: "member-2",
  createdAt: "2026-10-18T12:00:00Z"
})

const listed = init(workspace.id, member.id).model

/** What alice reads of the workspace: a connection that gives channels and one that gives models, her groups, and the channel. */
const read = [
  message(Message.ReceivedIntegrations({ integrations: [channelsIntegration, modelsIntegration] })),
  message(
    Message.ReceivedConnections({
      connections: [
        { connection: chat, pending: false },
        { connection: providers, pending: false }
      ]
    })
  ),
  message(Message.ReceivedGroups({ groups: [general, design] })),
  message(Message.ReceivedMemberships({ memberships: [aliceInGeneral] })),
  message(Message.ReceivedMembers({ members: [member, bob] })),
  message(Message.ReceivedChannels({ channels: [{ channel: support, pending: false }] }))
] as const

describe("the channels", () => {
  it("wait for the page to list the integrations, and keep what it informs them of or why it could not", () => {
    expect(init(workspace.id, member.id).commands ?? []).toEqual([])
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.cases.Loading.make({}))
      }),
      message(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." })),
      model((model) => {
        expect(model.integrations).toEqual(
          Integrations.cases.Failed.make({ error: "The host could not be reached. Try again." })
        )
      }),
      // Trying again shows they are loading and asks the page to list them again.
      message(Message.ClickedReloadIntegrations()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      Command.expectNone(),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.cases.Loading.make({}))
      }),
      message(Message.ReceivedIntegrations({ integrations: [channelsIntegration] })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.cases.Loaded.make({ integrations: [channelsIntegration] }))
      }),
      // Asking again once they are loaded asks nothing.
      message(Message.ClickedReloadIntegrations()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("add a channel as an action once its connection, group, and name are chosen, and refuse one that lacks any", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      model((model) => {
        expect(model.form).toEqual(
          Option.some(Form.Adding({ connectionId: "", groupId: "", name: "", opensTasks: false, error: Option.none() }))
        )
      }),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ error: Option.some("Choose the connection that receives its conversations.") })
        )
      }),
      // A connection that gives no channels is not one to choose.
      message(Message.ChoseConnection({ connectionId: providers.id })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ error: Option.some("Choose the connection that receives its conversations.") })
        )
      }),
      message(Message.ChoseConnection({ connectionId: chat.id })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ connectionId: chat.id, error: Option.none() }))
      }),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ error: Option.some("Choose the group its conversations open in.") })
        )
      }),
      // Nor is a group the person does not belong to.
      message(Message.ChoseGroup({ groupId: design.id })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ error: Option.some("Choose the group its conversations open in.") })
        )
      }),
      message(Message.ChoseGroup({ groupId: general.id })),
      message(Message.TypedName({ name: "  " })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ error: Option.some("Name the channel.") }))
      }),
      message(Message.TypedName({ name: "Sales" })),
      message(Message.ToggledOpensTasks({ opensTasks: true })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ name: "Sales", opensTasks: true, error: Option.none() }))
      }),
      message(Message.SubmittedForm()),
      Command.expectExact(
        CreateChannel({
          ...asMember,
          connectionId: chat.id,
          groupId: general.id,
          name: "Sales",
          opensTasks: true
        })
      ),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      Command.resolve(CreateChannel, Message.WroteAction())
    )
  })

  it("add a channel that opens conversations alone when the tasks are not asked for", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd()),
      message(Message.ChoseConnection({ connectionId: chat.id })),
      message(Message.ChoseGroup({ groupId: general.id })),
      message(Message.TypedName({ name: "Sales" })),
      message(Message.ToggledOpensTasks({ opensTasks: true })),
      message(Message.ToggledOpensTasks({ opensTasks: false })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        CreateChannel({
          ...asMember,
          connectionId: chat.id,
          groupId: general.id,
          name: "Sales",
          opensTasks: false
        })
      ),
      // What the store refuses to decode comes back as a notice, with the form already closed.
      Command.resolve(
        CreateChannel,
        Message.FailedWriteAction({ error: "A channel needs a connection, a group, and a name." })
      ),
      model((model) => {
        expect(model.form).toEqual(Option.none())
        expect(model.notice).toEqual(Option.some("A channel needs a connection, a group, and a name."))
      })
    )
  })

  it("offer only the connections that give channels and the groups the person belongs to, by name", () => {
    story(
      update,
      given(listed),
      message(
        Message.ReceivedConnections({
          connections: [
            { connection: chat, pending: false },
            { connection: providers, pending: false }
          ]
        })
      ),
      message(Message.ReceivedGroups({ groups: [general, design, withBob, bobAndScout] })),
      message(Message.ReceivedMemberships({ memberships: [aliceInGeneral] })),
      message(Message.ReceivedMembers({ members: [member, bob] })),
      // Until the host lists its integrations, no connection is known to give channels.
      model((model) => {
        expect(connectionsGiving(model, "channels")).toEqual([])
      }),
      message(Message.ReceivedIntegrations({ integrations: [channelsIntegration, modelsIntegration] })),
      model((model) => {
        expect(connectionsGiving(model, "channels")).toEqual([[chat.id, "Chat"]])
        expect(destinations(model)).toEqual([
          [general.id, "General"],
          [withBob.id, "Bob"]
        ])
      }),
      // A team joins them once the person is admitted to it.
      message(Message.ReceivedMemberships({ memberships: [aliceInGeneral, aliceInDesign] })),
      model((model) => {
        expect(destinations(model)).toEqual([
          [general.id, "General"],
          [design.id, "Design"],
          [withBob.id, "Bob"]
        ])
        expect(groupNameOf(model, withBob.id)).toBe("Bob")
        expect(groupNameOf(model, GroupId.GroupId.make("gone"))).toBe("a group you don’t see")
      })
    )
  })

  it("send a channel's conversations to come to another group of the person's, or remove the channel", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRedirect({ channelId: support.id })),
      model((model) => {
        expect(model.form).toEqual(
          Option.some(Form.Redirecting({ channelId: support.id, groupId: general.id, error: Option.none() }))
        )
      }),
      // A group the person does not belong to is not one to send them to.
      message(Message.ChoseGroup({ groupId: design.id })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ _tag: "Redirecting", error: Option.some("Choose the group its conversations open in.") })
        )
      }),
      message(Message.ReceivedMemberships({ memberships: [aliceInGeneral, aliceInDesign] })),
      message(Message.ChoseGroup({ groupId: design.id })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ groupId: design.id, error: Option.none() }))
      }),
      message(Message.SubmittedForm()),
      Command.expectExact(RedirectChannel({ ...asMember, channelId: support.id, groupId: design.id })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      Command.resolve(RedirectChannel, Message.WroteAction()),
      message(Message.ClickedRemove({ channelId: support.id })),
      Command.expectExact(RemoveChannel({ ...asMember, channelId: support.id })),
      Command.resolve(RemoveChannel, Message.WroteAction())
    )
  })

  it("open no form about a channel that is gone, close one when it goes, and keep the form for a new one", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedRedirect({ channelId: ChannelId.ChannelId.make("channel-9") })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      message(Message.ClickedAdd()),
      message(Message.ReceivedChannels({ channels: [] })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Adding" }))
      }),
      message(Message.ClickedCancelForm()),
      message(Message.ReceivedChannels({ channels: [{ channel: support, pending: false }] })),
      message(Message.ClickedRedirect({ channelId: support.id })),
      message(Message.ReceivedChannels({ channels: [] })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
        expect(model.channels).toEqual([])
      })
    )
  })

  it("say why a read or a write failed, until a write is kept", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.FailedRead({ error: "This browser could not read the workspace’s copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace’s copy."))
      }),
      message(Message.ClickedRemove({ channelId: support.id })),
      Command.resolve(
        RemoveChannel,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedRemove({ channelId: support.id })),
      Command.resolve(RemoveChannel, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })
})
