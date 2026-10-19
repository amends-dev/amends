import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import { Command, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  bob,
  connectionOf,
  conversationWithBob,
  design,
  general,
  keylessConnection,
  notificationOf,
  now,
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
import { Integrations } from "../../feature/connections/definition.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { ThreadsBinding } from "../../feature/group/composition.ts"
import { init as initGroup } from "../../feature/group/init.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { waitingCount } from "../../feature/inbox/definition.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { Result } from "../../feature/search/definition.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { Renaming as SettingsRenaming } from "../../feature/settings/definition.ts"
import { ThreadsBlock } from "../../feature/threads/block.ts"
import * as Drafts from "../../store/Drafts.ts"
import { LoadIntegrations } from "./command.ts"
import {
  AgentsBinding,
  AsideBinding,
  ChannelsBinding,
  ConnectionsBinding,
  GroupBinding,
  GroupsBinding,
  InboxBinding,
  MenuBinding,
  SearchBinding,
  SettingsBinding
} from "./composition.ts"
import { isThreadOpen, Message, Open, OutMessage, openThreadTitle } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const otherGroupId = GroupId.GroupId.make("design")

const opened = init(workspaceId, memberId, "Studio", "Split").model

const unreachable = "The host could not be reached. Try again."

/** The state of the integrations in the connections, the agents, and the channels. */
const integrationsOf = (model: typeof opened) => [
  model.connections.integrations,
  model.agents.integrations,
  model.channels.integrations
]

/** What the groups report, as the workspace receives it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  GroupsBinding.embedView({
    slotId: "groups",
    model: opened.groups,
    viewInputs: { openThread: Option.none() }
  }).toParentMessage(message)

/** What the inbox reports, as the workspace receives it. */
const fromInbox = (message: typeof InboxBlock.Message.Type) =>
  InboxBinding.embedView({ slotId: "inbox", model: opened.inbox, viewInputs: { now } }).toParentMessage(message)

/** What the search reports, as the workspace receives it. */
const fromSearch = (message: typeof SearchBlock.Message.Type) =>
  SearchBinding.embedView({ slotId: "search", model: opened.search }).toParentMessage(message)

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

/** What the navigation drawer's dialog reports, as the workspace receives it. */
const fromMenu = (message: typeof DialogBlock.Message.Type) =>
  MenuBinding.embedView({ slotId: "menu", model: opened.menu, viewInputs: { toView: () => null } }).toParentMessage(
    message
  )

/** What the side pane's dialog reports, as the workspace receives it. */
const fromAside = (message: typeof DialogBlock.Message.Type) =>
  AsideBinding.embedView({ slotId: "aside", model: opened.aside, viewInputs: { toView: () => null } }).toParentMessage(
    message
  )

/** The open group, before it is read, with no thread open. */
const openGroupModel = initGroup(workspaceId, memberId, groupId, Option.none()).model

/** What the open group reports, as the workspace receives it. */
const fromGroup = (message: typeof GroupBlock.Message.Type) =>
  GroupBinding.embedView({ key: groupId, slotId: "group", model: openGroupModel, viewInputs: { now } }).toParentMessage(
    message
  )

/** What the open group's threads report, as the workspace receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  fromGroup(
    ThreadsBinding.embedView({
      slotId: "threads",
      model: openGroupModel.threads,
      viewInputs: { members: [], groupName: "General", openThreadId: Option.none(), now }
    }).toParentMessage(message)
  )

/** A dialog showing, as opening one asks it to, and closing, as closing one asks it to. */
const dialogShown = Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
const dialogClosed = Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())

/** The notification of activity in a thread of general, read by the inbox. */
const notification = notificationOf("notification-1", 2, 5)
const receivedNotification = message(
  fromInbox(
    InboxBlock.Message.ReceivedInbox({
      items: [{ notification, thread: Option.some(thread), opening: Option.some(opening), message: Option.some(reply) }]
    })
  )
)

const atDesktop = init(workspaceId, memberId, "Studio", "Desktop").model

/** The drafts read as a notification's thread opens its group: the group's new thread, and the thread's reply. */
const draftsRead = [
  Command.resolve(
    ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Thread.make({ groupId }) }),
    ComposerBlock.Message.ReceivedDraft({ text: "" })
  ),
  Command.resolve(
    ReadDraft({ workspaceId, memberId, place: Drafts.Place.cases.Reply.make({ threadId: thread.id }) }),
    ComposerBlock.Message.ReceivedDraft({ text: "" })
  )
] as const

/** The group picked and a thread picked among its threads, which opens the side pane's dialog where it is one. */
const threadPicked = [
  message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
  Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
  message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId: thread.id }))),
  dialogShown,
  Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))
] as const

/** The thread of the notification opened from the inbox. */
const notificationOpened = [
  receivedNotification,
  message(Message.ClickedInbox()),
  message(fromInbox(InboxBlock.Message.ClickedOpen({ notificationId: notification.id })))
] as const

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

  it("opens the navigation drawer, and closes it again as its dialog asks", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(model.menu.isOpen).toBe(false)
      }),
      message(Message.ClickedMenu()),
      dialogShown,
      model((model) => {
        expect(model.menu.isOpen).toBe(true)
      }),
      message(fromMenu(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.menu.isOpen).toBe(false)
      })
    )
  })

  it("lays itself out for the width it is told of, and closes the drawer once the sidebar is in place", () => {
    for (const viewport of ["Desktop", "Split"] as const) {
      story(
        update,
        given(opened),
        message(Message.ClickedMenu()),
        dialogShown,
        message(Message.InformedOfViewport({ viewport })),
        dialogClosed,
        model((model) => {
          expect(model.viewport).toBe(viewport)
          expect(model.menu.isOpen).toBe(false)
        })
      )
    }
  })

  it("keeps the drawer open for a narrower width, and has none to close while it is shut", () => {
    for (const viewport of ["Phone", "Tablet"] as const) {
      story(
        update,
        given(opened),
        message(Message.ClickedMenu()),
        dialogShown,
        message(Message.InformedOfViewport({ viewport })),
        Command.expectNone(),
        model((model) => {
          expect(model.viewport).toBe(viewport)
          expect(model.menu.isOpen).toBe(true)
        })
      )
    }
    story(
      update,
      given(opened),
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      Command.expectNone(),
      model((model) => {
        expect(model.viewport).toBe("Desktop")
        expect(model.menu.isOpen).toBe(false)
      })
    )
  })

  it("closes the navigation drawer when the person goes home or to a destination", () => {
    for (const navigation of [
      Message.ClickedHome(),
      Message.ClickedInbox(),
      Message.ClickedConnections(),
      Message.ClickedAgents(),
      Message.ClickedSettings(),
      Message.ClickedChannels()
    ]) {
      story(
        update,
        given(opened),
        message(Message.ClickedMenu()),
        dialogShown,
        model((model) => {
          expect(model.menu.isOpen).toBe(true)
        }),
        message(navigation),
        dialogClosed,
        model((model) => {
          expect(model.menu.isOpen).toBe(false)
        })
      )
    }
  })

  it("closes the navigation drawer when the person picks a group", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedMenu()),
      dialogShown,
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      dialogClosed,
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.menu.isOpen).toBe(false)
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("shows the groups to browse in place of the open group, leaving no group marked, and opens one picked there", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(fromGroups(GroupsBlock.Message.ClickedBrowse())),
      model((model) => {
        expect(Open.isAnyOf(["Groups"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.none())
      }),
      // Picking a group from the page opens it, which leaves the page.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
        expect(model.groups.selected).toEqual(Option.some(groupId))
      })
    )
  })

  it("closes the navigation drawer when the person browses the groups", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedMenu()),
      dialogShown,
      message(fromGroups(GroupsBlock.Message.ClickedBrowse())),
      dialogClosed,
      model((model) => {
        expect(model.menu.isOpen).toBe(false)
        expect(Open.isAnyOf(["Groups"])(model.open)).toBe(true)
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

  it("lists the host's integrations once as it opens, and informs its connections, agents, and channels of them", () => {
    expect((init(workspaceId, memberId, "Studio", "Split").commands ?? []).map(({ name }) => name)).toEqual([
      LoadIntegrations.name
    ])
    story(
      update,
      given(opened),
      model((model) => {
        expect(integrationsOf(model)).toEqual([Integrations.Loading(), Integrations.Loading(), Integrations.Loading()])
      }),
      message(Message.ReceivedIntegrations({ integrations: [testApi] })),
      model((model) => {
        expect(integrationsOf(model)).toEqual(Array(3).fill(Integrations.Loaded({ integrations: [testApi] })))
      })
    )
  })

  it("tells its connections, agents, and channels when the host could not be reached", () => {
    story(
      update,
      given(opened),
      message(Message.FailedLoadIntegrations({ error: unreachable })),
      model((model) => {
        expect(integrationsOf(model)).toEqual(Array(3).fill(Integrations.Failed({ error: unreachable })))
      })
    )
  })

  it("lists them again when its connections, agents, or channels ask, and informs all three of the answer", () => {
    for (const reload of [
      fromConnections(ConnectionsBlock.Message.ClickedReloadIntegrations()),
      fromAgents(AgentsBlock.Message.ClickedReloadIntegrations()),
      fromChannels(ChannelsBlock.Message.ClickedReloadIntegrations())
    ]) {
      story(
        update,
        given(opened),
        message(Message.FailedLoadIntegrations({ error: unreachable })),
        message(reload),
        Command.expectExact(LoadIntegrations({ workspaceId })),
        Command.resolve(LoadIntegrations, Message.ReceivedIntegrations({ integrations: [testApi] })),
        model((model) => {
          expect(integrationsOf(model)).toEqual(Array(3).fill(Integrations.Loaded({ integrations: [testApi] })))
        })
      )
    }
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
      message(Message.ClickedMenu()),
      dialogShown,
      message(fromInbox(InboxBlock.Message.ClickedOpen({ notificationId: notification.id }))),
      dialogClosed,
      ...draftsRead,
      model((model) => {
        expect(
          Open.isAnyOf(["Group"])(model.open) && [
            model.open.groupId,
            Option.map(model.open.model.thread, (open) => [open.threadId, open.model.threadId])
          ]
        ).toEqual([groupId, Option.some([thread.id, thread.id])])
        expect(openThreadTitle(model.open)).toEqual(Option.some("A thread"))
        expect(model.groups.selected).toEqual(Option.some(groupId))
        expect(model.menu.isOpen).toBe(false)
      })
    )
  })

  it("opens the side pane's dialog for the thread of a notification where the pane is one, and not at Split", () => {
    for (const viewport of ["Phone", "Tablet", "Desktop"] as const) {
      story(
        update,
        given(init(workspaceId, memberId, "Studio", viewport).model),
        ...notificationOpened,
        dialogShown,
        ...draftsRead,
        model((model) => {
          expect(model.aside.isOpen).toBe(true)
          expect(isThreadOpen(model.open)).toBe(true)
        })
      )
    }
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...draftsRead,
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(true)
      })
    )
  })

  it("opens the side pane's dialog as a thread is picked in the group, and closes it as the thread closes", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(isThreadOpen(model.open)).toBe(true)
      }),
      message(fromGroup(GroupBlock.Message.ClickedAllThreads())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(false)
      })
    )
  })

  it("opens no dialog for a thread picked in the group beside the main pane", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(fromThreads(ThreadsBlock.Message.ClickedThread({ threadId: thread.id }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(true)
      }),
      message(fromGroup(GroupBlock.Message.ClickedAllThreads())),
      Command.expectNone(),
      model((model) => {
        expect(isThreadOpen(model.open)).toBe(false)
      })
    )
  })

  it("closes the thread as the side pane's dialog closes by itself, as by Escape or its scrim", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(fromAside(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(false)
        expect(Open.isAnyOf(["Group"])(model.open)).toBe(true)
      })
    )
  })

  it("moves the thread open between its dialog and the main pane's side as the window's width changes", () => {
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...draftsRead,
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      dialogShown,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(isThreadOpen(model.open)).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Tablet" })),
      Command.expectNone(),
      message(Message.InformedOfViewport({ viewport: "Phone" })),
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      dialogClosed,
      model((model) => {
        expect(model.viewport).toBe("Split")
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(true)
      })
    )
  })

  it("opens no dialog for the side pane as the window narrows while no thread is open", () => {
    story(
      update,
      given(opened),
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      Command.expectNone(),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      Command.expectNone(),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
      })
    )
  })

  it("closes the side pane's dialog with every navigation, which takes the thread with its group", () => {
    for (const navigation of [
      Message.ClickedHome(),
      Message.ClickedInbox(),
      Message.ClickedConnections(),
      Message.ClickedAgents(),
      Message.ClickedSettings(),
      Message.ClickedChannels(),
      fromGroups(GroupsBlock.Message.ClickedBrowse())
    ]) {
      story(
        update,
        given(atDesktop),
        ...threadPicked,
        message(navigation),
        dialogClosed,
        model((model) => {
          expect(model.aside.isOpen).toBe(false)
          expect(isThreadOpen(model.open)).toBe(false)
        })
      )
    }
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId: otherGroupId }))),
      dialogClosed,
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.open)).toBe(false)
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(otherGroupId)
      })
    )
  })

  it("opens its search when the person clicks the search in the sidebar, or its parent asks, from a fresh field", () => {
    for (const request of [Message.ClickedSearch(), Message.RequestedSearch()]) {
      story(
        update,
        given(opened),
        message(request),
        dialogShown,
        model((model) => {
          expect(model.search.dialog.isOpen).toBe(true)
          expect(model.search.query).toBe("")
        })
      )
    }
  })

  it("opens the group the search found without a thread, marks it in the list, and closes the dialogs it was over", () => {
    story(
      update,
      given(atDesktop),
      ...threadPicked,
      message(Message.ClickedSearch()),
      dialogShown,
      message(
        fromSearch(SearchBlock.Message.ClickedResult({ result: Result.Group({ group: design, name: "Design" }) }))
      ),
      Command.resolve(Dialog.test.CloseDialog({ id: "search" }), DialogBlock.Message.CompletedCloseDialog()),
      dialogClosed,
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(otherGroupId)
        expect(isThreadOpen(model.open)).toBe(false)
        expect(model.groups.selected).toEqual(Option.some(otherGroupId))
        expect(model.search.dialog.isOpen).toBe(false)
        expect(model.aside.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(opened),
      message(Message.ClickedMenu()),
      dialogShown,
      message(Message.ClickedSearch()),
      dialogShown,
      message(
        fromSearch(SearchBlock.Message.ClickedResult({ result: Result.Group({ group: design, name: "Design" }) }))
      ),
      Command.resolve(Dialog.test.CloseDialog({ id: "search" }), DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.CloseDialog({ id: "workspace-menu" }), DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.menu.isOpen).toBe(false)
        expect(model.search.dialog.isOpen).toBe(false)
      })
    )
  })

  it("opens the thread the search found in its group, as the inbox does, with the side pane's dialog where it is one", () => {
    for (const viewport of ["Desktop", "Split"] as const) {
      story(
        update,
        given(init(workspaceId, memberId, "Studio", viewport).model),
        message(Message.ClickedSearch()),
        dialogShown,
        message(
          fromSearch(
            SearchBlock.Message.ClickedResult({
              result: Result.Thread({ thread, groupName: "General", words: "Plans for the week" })
            })
          )
        ),
        dialogClosed,
        ...draftsRead,
        ...(viewport === "Split" ? [] : [dialogShown]),
        model((model) => {
          expect(
            Open.isAnyOf(["Group"])(model.open) && [
              model.open.groupId,
              Option.map(model.open.model.thread, (open) => open.threadId)
            ]
          ).toEqual([groupId, Option.some(thread.id)])
          expect(model.groups.selected).toEqual(Option.some(groupId))
          expect(model.aside.isOpen).toBe(viewport !== "Split")
          expect(model.search.dialog.isOpen).toBe(false)
        })
      )
    }
  })

  it("opens the conversation the search found with a person, or asks the groups to start one in their dialog", () => {
    const person = message(fromSearch(SearchBlock.Message.ClickedResult({ result: Result.Person({ member: bob }) })))
    const withConversation = modifyFields(opened, {
      groups: (groups) =>
        modifyFields(groups, {
          groups: () => [
            { group: general, pending: false, members: 2 },
            { group: conversationWithBob, pending: false, members: 2 }
          ]
        })
    })

    story(
      update,
      given(withConversation),
      message(Message.ClickedSearch()),
      dialogShown,
      person,
      dialogClosed,
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Group"])(model.open) && model.open.groupId).toBe(conversationWithBob.id)
        expect(model.groups.selected).toEqual(Option.some(conversationWithBob.id))
        expect(model.groups.dialog.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(opened),
      message(Message.ClickedSearch()),
      dialogShown,
      person,
      Command.resolve(Dialog.test.CloseDialog({ id: "search" }), DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(
        Dialog.test.ShowDialog({ id: "groups-starting", focusSelector: "[data-foldkit-dialog-initial-focus]" }),
        DialogBlock.Message.SucceededShowDialog()
      ),
      model((model) => {
        expect(Open.isAnyOf(["Nothing"])(model.open)).toBe(true)
        expect(model.groups.dialog.isOpen).toBe(true)
        expect(model.groups.starting).toEqual(
          Option.some({ _tag: "Conversation", memberId: Option.some(bob.id), text: "" })
        )
      })
    )
  })
})
