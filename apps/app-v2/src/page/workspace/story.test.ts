import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import {
  connectionOf,
  keylessConnection,
  notificationOf,
  opening,
  reply,
  scoutAgent,
  support,
  testApi,
  thread
} from "../../../test/fixtures.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { Renaming as SettingsRenaming } from "../../feature/settings/definition.ts"
import * as Drafts from "../../store/Drafts.ts"
import {
  AgentsBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupsBinding,
  InboxBinding,
  SettingsBinding
} from "./composition.ts"
import { Message, Open, OutMessage, openThreadTitle } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")

const opened = init(workspaceId, memberId, "Studio").model

/** What the groups report, as the workspace receives it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  GroupsBinding.embedView({
    slotId: "groups",
    model: opened.groups,
    viewInputs: { openThread: Option.none() }
  }).toParentMessage(message)

/** What the inbox reports, as the workspace receives it. */
const fromInbox = (message: typeof InboxBlock.Message.Type) =>
  InboxBinding.embedView({ slotId: "inbox", model: opened.inbox }).toParentMessage(message)

/** What the connections report, as the workspace receives it. */
const fromConnections = (message: typeof ConnectionsBlock.Message.Type) =>
  ConnectionsBinding.embedView({ slotId: "connections", model: opened.connections }).toParentMessage(message)

/** What the agents report, as the workspace receives it. */
const fromAgents = (message: typeof AgentsBlock.Message.Type) =>
  AgentsBinding.embedView({ slotId: "agents", model: opened.agents }).toParentMessage(message)

/** What the settings report, as the workspace receives it. */
const fromSettings = (message: typeof SettingsBlock.Message.Type) =>
  SettingsBinding.embedView({ slotId: "settings", model: opened.settings }).toParentMessage(message)

/** What the channels report, as the workspace receives it. */
const fromChannels = (message: typeof ChannelsBlock.Message.Type) =>
  ChannelsBinding.embedView({ slotId: "channels", model: opened.channels }).toParentMessage(message)

/** The notification of activity in a thread of general, read by the inbox. */
const notification = notificationOf("notification-1", 2, 5)
const receivedNotification = message(
  fromInbox(
    InboxBlock.Message.ReceivedInbox({
      items: [{ notification, thread: Option.some(thread), opening: Option.some(opening), message: Option.some(reply) }]
    })
  )
)

describe("a workspace", () => {
  it("opens the group picked, and reports when the person leaves", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(Open.isAnyOf(["Nothing"])(model.open)).toBe(true)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(
          Open.isAnyOf(["Group"])(model.open) && [model.open.groupId, model.open.model.groupId, model.open.model.thread]
        ).toEqual([groupId, groupId, Option.none()])
      }),
      message(Message.ClickedAllWorkspaces()),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })

  it("asks the root to sign the person out", () => {
    story(update, given(opened), message(Message.ClickedSignOut()), expectOutMessage(OutMessage.RequestedSignOut()))
  })

  it("goes home from the group open or a destination, to nothing open and no group marked", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedHome()),
      model((model) => {
        expect(Open.isAnyOf(["Nothing"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      message(Message.ClickedConnections()),
      message(Message.ClickedHome()),
      model((model) => {
        expect(Open.isAnyOf(["Nothing"])(model.open)).toBe(true)
      })
    )
  })

  it("names the thread open in the group open by its title, and none while there is none", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(openThreadTitle(model.open)).toEqual(Option.none())
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(openThreadTitle(model.open)).toEqual(Option.none())
      }),
      message(Message.ClickedInbox()),
      model((model) => {
        expect(openThreadTitle(model.open)).toEqual(Option.none())
      })
    )
  })

  it("shows the inbox in place of the open group, and counts what waits in it", () => {
    story(
      update,
      given(opened),
      receivedNotification,
      model((model) => {
        expect(waitingCount(model.inbox)).toBe(1)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedInbox()),
      model((model) => {
        expect(Open.isAnyOf(["Inbox"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // With the inbox shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("asks the host for its integrations as it opens, which its connections, agents, and channels list", () => {
    expect((init(workspaceId, memberId, "Studio").commands ?? []).map(({ name }) => name)).toEqual([
      "connections/LoadIntegrations",
      "agents/LoadIntegrations",
      "channels/LoadIntegrations"
    ])
  })

  it("shows the connections in place of the open group, leaving no group marked, and reads them whichever shows", () => {
    story(
      update,
      given(opened),
      message(
        fromConnections(
          ConnectionsBlock.Message.ReceivedConnections({
            connections: [{ connection: connectionOf("connection-1", "Models"), pending: false }]
          })
        )
      ),
      message(fromConnections(ConnectionsBlock.Message.ReceivedIntegrations({ integrations: [testApi] }))),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedConnections()),
      model((model) => {
        expect(Open.isAnyOf(["Connections"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
        expect(model.connections.connections.map(({ connection }) => connection.name)).toEqual(["Models"])
      }),
      // With the connections shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("shows the agents in place of the open group, leaving no group marked, and reads them whichever shows", () => {
    const models = keylessConnection("models-1", "test-models", "Models")
    story(
      update,
      given(opened),
      message(
        fromAgents(
          AgentsBlock.Message.ReceivedAgents({
            agents: [{ agent: scoutAgent, pending: false }],
            members: [],
            connections: [{ connection: models, pending: false }],
            roles: [],
            workspace: Option.none(),
            grants: []
          })
        )
      ),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedAgents()),
      model((model) => {
        expect(Open.isAnyOf(["Agents"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
        expect(model.agents.agents.map(({ agent }) => agent.id)).toEqual([scoutAgent.id])
      }),
      // With the agents shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("shows the settings in place of the open group, with no group marked in the list", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedSettings()),
      model((model) => {
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // With the settings shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("hands the settings what the person does in them", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedSettings()),
      message(fromSettings(SettingsBlock.Message.ClickedRenameSelf())),
      model((model) => {
        expect(model.settings.renaming).toEqual(Option.some(SettingsRenaming.OwnName({ name: "" })))
      })
    )
  })

  it("shows the channels in place of the open group, leaving no group marked, and reads them whichever shows", () => {
    story(
      update,
      given(opened),
      message(
        fromChannels(ChannelsBlock.Message.ReceivedChannels({ channels: [{ channel: support, pending: false }] }))
      ),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedChannels()),
      model((model) => {
        expect(Open.isAnyOf(["Channels"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
        expect(model.channels.channels.map(({ channel }) => channel.name)).toEqual(["Support"])
      }),
      // With the channels shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("hands the channels what the person does in them", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedChannels()),
      message(fromChannels(ChannelsBlock.Message.ClickedAdd())),
      model((model) => {
        expect(model.channels.form).toMatchObject(Option.some({ _tag: "Adding" }))
      })
    )
  })

  it("opens the group of a notification's thread with the thread open, and marks the group in the list", () => {
    story(
      update,
      given(opened),
      receivedNotification,
      message(Message.ClickedInbox()),
      message(fromInbox(InboxBlock.Message.ClickedOpen({ notificationId: notification.id }))),
      Command.resolve(
        ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Thread.make({ groupId }) }),
        ComposerBlock.Message.ReceivedDraft({ text: "" })
      ),
      Command.resolve(
        ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Reply.make({ threadId: thread.id }) }),
        ComposerBlock.Message.ReceivedDraft({ text: "" })
      ),
      model((model) => {
        expect(
          Open.isAnyOf(["Group"])(model.open) && [
            model.open.groupId,
            Option.map(model.open.model.thread, (open) => [open.threadId, open.model.threadId])
          ]
        ).toEqual([groupId, Option.some([thread.id, thread.id])])
        expect(openThreadTitle(model.open)).toEqual(Option.some("A thread"))
        expect(model.groups.selected).toEqual(Option.some(groupId))
      })
    )
  })
})
