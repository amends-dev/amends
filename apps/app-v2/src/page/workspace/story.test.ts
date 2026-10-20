import { BuiltinRoles } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  bobIsMember,
  bob,
  connectionOf,
  connectionTo,
  conversationWithBob,
  design,
  general,
  grantsOf,
  invitation,
  keylessConnection,
  membership,
  notificationOf,
  now,
  offered,
  opening,
  reply,
  reviewer,
  reviewerAgent,
  roles,
  scout,
  scoutAgent,
  searchApi,
  support,
  task,
  testApi,
  thread
} from "../../../test/fixtures.ts"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { ExpireConfirmation } from "../../feature/actions/command.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { LoadModels } from "../../feature/agents/command.ts"
import { Written as AgentWritten } from "../../feature/agents/definition.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { CheckConnection } from "../../feature/connections/command.ts"
import {
  Adding,
  Integrations,
  startConfiguring,
  Written as ConnectionWritten
} from "../../feature/connections/definition.ts"
import type { GroupBlock } from "../../feature/group/block.ts"
import { ThreadsBinding } from "../../feature/group/composition.ts"
import { init as initGroup } from "../../feature/group/init.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { MarkNotificationSeen } from "../../feature/inbox/command.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { Result } from "../../feature/search/definition.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { AccountBinding } from "../../feature/settings/composition.ts"
import {
  AccountEntry,
  AccountMenu,
  type ReportedAccountEntry,
  Written as SettingsWritten
} from "../../feature/settings/definition.ts"
import { TasksBlock } from "../../feature/tasks/block.ts"
import { ThreadsBlock } from "../../feature/threads/block.ts"
import * as Drafts from "../../store/Drafts.ts"
import { LoadIntegrations } from "./command.ts"
import {
  AgentsBinding,
  AsideBinding,
  ChannelsBinding,
  ConnectionsBinding,
  HomeBinding,
  MenuBinding,
  SearchBinding,
  SettingsBinding
} from "./composition.ts"
import { Message, Open, OutMessage, openMemberId } from "./definition.ts"
import { HomeBlock } from "./home/block.ts"
import { GroupBinding, GroupsBinding, InboxBinding, TasksBinding } from "./home/composition.ts"
import { isThreadOpen, Open as HomeOpen } from "./home/definition.ts"
import { view as homeView } from "./home/view.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const workspaceId = WorkspaceId.WorkspaceId.make("workspace-1")
const memberId = MemberId.MemberId.make("member-1")
const groupId = GroupId.GroupId.make("general")
const otherGroupId = GroupId.GroupId.make("design")

const opened = init(workspaceId, memberId, "Studio", "Split").model

const unreachable = "The host could not be reached. Try again."

const agentId = scoutAgent.id

const models = keylessConnection("models-1", "test-models", "Models")

/** The model with the dialog of the agents open. */
const openAgentsDialog = (model: typeof opened) =>
  modifyFields(model, {
    agents: (agents) => modifyFields(agents, { dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }) })
  })

/** The agents as alice reads them, scout among them. */
const readAgents = (agents: typeof opened.agents) =>
  modifyFields(agents, {
    isLoaded: () => true,
    agents: () => [{ agent: scoutAgent, pending: false }],
    members: () => [membership.member, bob, scout]
  })

/** Scout's page open among the agents alice reads. */
const withAgentPage = modifyFields(opened, { open: () => Open.Agent({ agentId }), agents: readAgents })

/** The form that adds Reviewer sent, and stored, among the agents alice reads, in the dialog. */
const addingAgent = openAgentsDialog(
  modifyFields(opened, {
    agents: (agents) =>
      modifyFields(readAgents(agents), {
        adding: () =>
          Option.some({
            name: "Reviewer",
            roleId: BuiltinRoles.MemberId,
            setup: {
              instructions: "",
              harness: "",
              modelConnectionId: "models-1",
              modelId: "test-model",
              effort: "",
              sandbox: ""
            },
            failure: Option.none(),
            creating: Option.some({ name: "Reviewer", knownAgentIds: [agentId], isWritten: true })
          })
      })
  })
)

/** The confirmation that removes scout, sent, in the dialog, over scout's page. */
const removingAgent = openAgentsDialog(
  modifyFields(opened, {
    open: () => Open.Agent({ agentId }),
    agents: (agents) =>
      modifyFields(readAgents(agents), {
        removing: () => Option.some({ agentId, name: "Scout", isSending: true, failure: Option.none() })
      })
  })
)

const searchConnection = connectionTo("connection-2", "search-api", "Search tools", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})
const connectionId = searchConnection.id

const createdConnection = connectionTo("connection-9", "search-api", "MCP server", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})

/** The model with the dialog of the connections open. */
const openConnectionsDialog = (model: typeof opened) =>
  modifyFields(model, {
    connections: (connections) =>
      modifyFields(connections, { dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }) })
  })

/** The connections as alice, who owns the workspace, reads them: one to the search server, which the host lists. */
const readConnections = (connections: typeof opened.connections) =>
  modifyFields(connections, {
    isLoaded: () => true,
    integrations: () => Integrations.Loaded({ integrations: [searchApi] }),
    grants: () => grantsOf([aliceOwns]),
    connections: () => [{ connection: searchConnection, pending: false }]
  })

/** The page of the connection to the search server open among the connections alice reads. */
const withConnectionPage = modifyFields(opened, {
  open: () => Open.Connection({ connectionId }),
  connections: readConnections
})

/** The key of the search connection being replaced, its request on its way, in the dialog. */
const replacingKey = openConnectionsDialog(
  modifyFields(withConnectionPage, {
    connections: (connections) =>
      modifyFields(connections, {
        replacing: () =>
          Option.some({ connectionId, name: "Search tools", apiKey: "sk-new", isSending: true, failure: Option.none() })
      })
  })
)

/** The form that adds the MCP server made by the host, and not yet listed by the store, in the dialog. */
const addingConnection = openConnectionsDialog(
  modifyFields(opened, {
    connections: (connections) =>
      modifyFields(readConnections(connections), {
        adding: () =>
          Option.some(
            Adding.Configuring({
              ...startConfiguring(searchApi, Option.none()),
              creating: Option.some({ name: "MCP server", connectionId: Option.some(createdConnection.id) })
            })
          )
      })
  })
)

/** The confirmation that removes the search connection, its request on its way, in the dialog. */
const removingConnection = openConnectionsDialog(
  modifyFields(withConnectionPage, {
    connections: (connections) =>
      modifyFields(connections, {
        removing: () =>
          Option.some({ connectionId, name: "Search tools", hasKey: true, isSending: true, failure: Option.none() })
      })
  })
)

/** The state of the integrations in the connections, the agents, and the channels. */
const integrationsOf = (model: typeof opened) => [
  model.connections.integrations,
  model.agents.integrations,
  model.channels.integrations
]

/** What Home reports, as the workspace receives it. */
const fromHome = (message: typeof HomeBlock.Message.Type) =>
  HomeBinding.embedView({
    slotId: "home",
    model: opened.home,
    view: homeView,
    viewInputs: { now, workspaceName: "Studio" }
  }).toParentMessage(message)

/** What the groups report, as Home and then the workspace receive it. */
const fromGroups = (message: typeof GroupsBlock.Message.Type) =>
  fromHome(
    GroupsBinding.embedView({
      slotId: "groups",
      model: opened.home.groups,
      viewInputs: { openThread: Option.none(), isBrowsing: false }
    }).toParentMessage(message)
  )

/** What the inbox reports, as Home and then the workspace receive it. */
const fromInbox = (message: typeof InboxBlock.Message.Type) =>
  fromHome(
    InboxBinding.embedView({ slotId: "inbox", model: opened.home.inbox, viewInputs: { now } }).toParentMessage(message)
  )

/** What the tasks report, as Home and then the workspace receive it. */
const fromTasks = (message: typeof TasksBlock.Message.Type) =>
  fromHome(
    TasksBinding.embedView({ slotId: "tasks", model: opened.home.tasks, viewInputs: { now } }).toParentMessage(message)
  )

/** What the search reports, as the workspace receives it. */
const fromSearch = (message: typeof SearchBlock.Message.Type) =>
  SearchBinding.embedView({ slotId: "search", model: opened.search }).toParentMessage(message)

/** What the connections report, as the workspace receives it. */
const fromConnections = (message: typeof ConnectionsBlock.Message.Type) =>
  ConnectionsBinding.embedView({
    slotId: "connections",
    model: opened.connections,
    viewInputs: { workspaceName: "Studio" }
  }).toParentMessage(message)

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

/** The account menu, which the settings draw, reporting that the person chose `entry`, as the workspace receives it. */
const choseAccountEntry = (entry: AccountEntry) =>
  fromSettings(
    AccountBinding.embedView({
      slotId: "account",
      model: opened.settings.accountMenu,
      viewInputs: { items: [], itemToConfig: () => ({ content: null }), buttonContent: null }
    }).toParentMessage(AccountMenu.Message.SelectedItem({ index: AccountEntry.literals.indexOf(entry), item: entry }))
  )

/** What the open group reports, as Home and then the workspace receive it. */
const fromGroup = (message: typeof GroupBlock.Message.Type) =>
  fromHome(
    GroupBinding.embedView({
      key: groupId,
      slotId: "group",
      model: openGroupModel,
      viewInputs: { now }
    }).toParentMessage(message)
  )

/** What the open group's threads report, as the workspace receives it. */
const fromThreads = (message: typeof ThreadsBlock.Message.Type) =>
  fromGroup(
    ThreadsBinding.embedView({
      slotId: "threads",
      model: openGroupModel.threads,
      viewInputs: { members: [], groupName: "General", isTeam: true, openThreadId: Option.none(), now }
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

/** The task of a thread of general, in triage, read by the tasks. */
const receivedTask = message(
  fromTasks(
    TasksBlock.Message.ReceivedTasks({
      items: [
        {
          task,
          thread,
          groupName: "General",
          opening: Option.some(opening),
          replies: 0,
          pending: false,
          lastActiveAt: opening.publishedAt
        }
      ]
    })
  )
)

const atDesktop = init(workspaceId, memberId, "Studio", "Desktop").model

/** The settings read as alice reads them, who owns the workspace, bob being a member of it. */
const settingsRead = modifyFields(opened, {
  settings: (settings) =>
    modifyFields(settings, {
      workspace: () => Option.some({ workspace: membership.workspace, pending: false }),
      members: () => [membership.member, bob].map((member) => ({ member, pending: false })),
      roles: () => roles,
      assignments: () => [aliceOwns, bobIsMember].map((assignment) => ({ assignment, pending: false })),
      grants: () => grantsOf([aliceOwns])
    })
})

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

/** The thread of the notification opened from the inbox, which opens beside it. */
const notificationOpened = [
  receivedNotification,
  message(fromHome(HomeBlock.Message.ClickedInbox())),
  message(fromInbox(InboxBlock.Message.ClickedOpen({ notificationId: notification.id })))
] as const

/** The write that marks the notification seen acknowledged, and the thread's reply draft read, as its thread opens. */
const threadBesideInboxOpened = [
  Command.resolve(MarkNotificationSeen, InboxBlock.Message.WroteAction()),
  Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))
] as const

describe("a workspace", () => {
  it("opens the group picked, and reports when the person leaves", () => {
    story(
      update,
      given(opened),
      model((model) => {
        expect(Open.isAnyOf(["Home"])(model.open)).toBe(true)
        expect(HomeOpen.isAnyOf(["Nothing"])(model.home.open)).toBe(true)
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(
          HomeOpen.isAnyOf(["Group"])(model.home.open) && [
            model.home.open.groupId,
            model.home.open.model.groupId,
            model.home.open.model.thread
          ]
        ).toEqual([groupId, groupId, Option.none()])
      }),
      message(Message.ClickedAllWorkspaces()),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })

  it("reports the entry the person chooses in the account menu that the app acts on, and nothing for a new name", () => {
    const reported: ReadonlyArray<ReportedAccountEntry> = [
      "System",
      "Light",
      "Dark",
      "SwitchWorkspace",
      "WorkspaceSettings",
      "SignOut"
    ]

    for (const entry of reported) {
      story(
        update,
        given(opened),
        message(choseAccountEntry(entry)),
        expectOutMessage(OutMessage.ChoseAccountEntry({ entry }))
      )
    }

    story(update, given(opened), message(choseAccountEntry("ChangeName")), expectNoOutMessage())
  })

  it("shows the workspace's settings page when the app asks, in place of what is open", () => {
    story(
      update,
      given(opened),
      message(Message.ClickedMembers()),
      message(Message.RequestedWorkspaceSettings()),
      model((model) => {
        expect(Open.matchOrElse(model.open, { Settings: ({ page }) => page }, () => undefined)).toBe("Workspace")
      }),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.RequestedWorkspaceSettings()),
      model((model) => {
        expect(Open.matchOrElse(model.open, { Settings: ({ page }) => page }, () => undefined)).toBe("Workspace")
        expect(model.home.groups.selected).toEqual(Option.none())
      })
    )
  })

  it("goes home from the group open or a destination, to nothing open in Home and no group marked", () => {
    story(
      update,
      given(opened),
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      message(Message.ClickedHome()),
      model((model) => {
        expect(Open.isAnyOf(["Home"])(model.open)).toBe(true)
        expect(HomeOpen.isAnyOf(["Nothing"])(model.home.open)).toBe(true)
        expect(model.home.groups.selected).toEqual(Option.none())
      }),
      message(Message.ClickedConnections()),
      message(Message.ClickedHome()),
      model((model) => {
        expect(Open.isAnyOf(["Home"])(model.open)).toBe(true)
        expect(HomeOpen.isAnyOf(["Nothing"])(model.home.open)).toBe(true)
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

  it("closes the navigation drawer when the person opens an item of a sidebar", () => {
    for (const navigation of [
      fromHome(HomeBlock.Message.ClickedInbox()),
      fromHome(HomeBlock.Message.ClickedTriage()),
      fromHome(HomeBlock.Message.ClickedTasks()),
      Message.ClickedWorkspace(),
      Message.ClickedMembers(),
      fromAgents(AgentsBlock.Message.ClickedBrowse()),
      fromAgents(AgentsBlock.Message.ClickedAgent({ agentId: scoutAgent.id })),
      fromConnections(ConnectionsBlock.Message.ClickedBrowse({ tab: "models" })),
      fromConnections(ConnectionsBlock.Message.ClickedConnection({ connectionId: models.id })),
      fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels())
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

  it("keeps the navigation drawer open when the person picks a destination on the rail, which shows it", () => {
    for (const [navigation, destination] of [
      [Message.ClickedHome(), "Home"],
      [Message.ClickedAgents(), "Agents"],
      [Message.ClickedConnections(), "Connections"],
      [Message.ClickedSettings(), "Settings"]
    ] as const) {
      story(
        update,
        given(opened),
        message(Message.ClickedMenu()),
        dialogShown,
        message(navigation),
        Command.expectNone(),
        model((model) => {
          expect(model.menu.isOpen).toBe(true)
          expect(Open.isAnyOf([destination])(model.open)).toBe(true)
        })
      )
    }
  })

  it("shows the connections, the agents, and the settings that an item of their sidebar opens", () => {
    story(
      update,
      given(opened),
      message(fromAgents(AgentsBlock.Message.ClickedBrowse())),
      model((model) => {
        expect(Open.isAnyOf(["Agents"])(model.open)).toBe(true)
      }),
      message(fromConnections(ConnectionsBlock.Message.ClickedBrowse({ tab: "tools" }))),
      model((model) => {
        expect(Open.isAnyOf(["Connections"])(model.open)).toBe(true)
        expect(model.connections.browse.tab).toBe("tools")
      }),
      message(fromConnections(ConnectionsBlock.Message.ClickedConnection({ connectionId: models.id }))),
      model((model) => {
        expect(Open.matchOrElse(model.open, { Connection: ({ connectionId }) => connectionId }, () => undefined)).toBe(
          models.id
        )
      }),
      message(fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels())),
      model((model) => {
        expect(Open.isAnyOf(["Channels"])(model.open)).toBe(true)
      }),
      message(Message.ClickedMembers()),
      model((model) => {
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
      }),
      message(fromAgents(AgentsBlock.Message.ClickedAdd())),
      dialogShown,
      model((model) => {
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
        expect(model.agents.dialog.isOpen).toBe(true)
      })
    )
  })

  it("confirms to the person in a toast that they saved an agent's name or setup, and stays on its page", () => {
    story(
      update,
      given(withAgentPage),
      message(fromAgents(AgentsBlock.Message.WroteAction({ written: AgentWritten.Rename({ agentId }) }))),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Name saved" }])
        expect(model.open).toEqual(Open.Agent({ agentId }))
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      message(fromAgents(AgentsBlock.Message.WroteAction({ written: AgentWritten.Configure({ agentId }) }))),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 2, text: "Setup saved" }])
        expect(model.open).toEqual(Open.Agent({ agentId }))
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 2 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([])
      })
    )
  })

  it("confirms an agent added in a toast and opens its page once the store lists it, closing the dialog", () => {
    story(
      update,
      given(addingAgent),
      message(
        fromAgents(
          AgentsBlock.Message.ReceivedAgents({
            agents: [scoutAgent, reviewerAgent].map((agent) => ({ agent, pending: false })),
            members: [membership.member, bob, scout, reviewer],
            connections: [{ connection: models, pending: false }],
            roles: [],
            workspace: Option.none(),
            grants: []
          })
        )
      ),
      Command.expectHas(
        Dialog.test.CloseDialog,
        ExpireConfirmation({ id: 1 }),
        LoadModels({ workspaceId, connectionId: models.id })
      ),
      model((model) => {
        expect(model.open).toEqual(Open.Agent({ agentId: reviewerAgent.id }))
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Reviewer created" }])
        expect(model.agents.adding).toEqual(Option.none())
      }),
      dialogClosed,
      Command.resolve(LoadModels, AgentsBlock.Message.ReceivedModels({ connectionId: models.id, models: offered })),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("confirms an agent removed in a toast and shows the list of agents, closing the dialog", () => {
    story(
      update,
      given(removingAgent),
      message(fromAgents(AgentsBlock.Message.WroteAction({ written: AgentWritten.Remove({ agentId }) }))),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(Open.isAnyOf(["Agents"])(model.open)).toBe(true)
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Scout removed" }])
        expect(model.agents.removing).toEqual(Option.none())
      }),
      dialogClosed,
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("confirms to the person in a toast that they saved a connection's name or settings or replaced its key, and stays on its page", () => {
    story(
      update,
      given(withConnectionPage),
      message(
        fromConnections(ConnectionsBlock.Message.WroteAction({ written: ConnectionWritten.Rename({ connectionId }) }))
      ),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Name saved" }])
        expect(model.open).toEqual(Open.Connection({ connectionId }))
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      message(
        fromConnections(
          ConnectionsBlock.Message.WroteAction({ written: ConnectionWritten.Configure({ connectionId }) })
        )
      ),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 2, text: "Settings saved" }])
        expect(model.open).toEqual(Open.Connection({ connectionId }))
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 2 }))
    )
    story(
      update,
      given(replacingKey),
      message(fromConnections(ConnectionsBlock.Message.ReplacedConnectionKey({ connectionId }))),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "API key replaced" }])
        expect(model.open).toEqual(Open.Connection({ connectionId }))
        expect(model.connections.replacing).toEqual(Option.none())
      }),
      dialogClosed,
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("confirms a connection added in a toast and opens its page once the store lists it, closing the dialog and checking it", () => {
    story(
      update,
      given(addingConnection),
      message(
        fromConnections(
          ConnectionsBlock.Message.ReceivedConnections({
            connections: [searchConnection, createdConnection].map((connection) => ({ connection, pending: false }))
          })
        )
      ),
      Command.expectHas(
        Dialog.test.CloseDialog,
        ExpireConfirmation({ id: 1 }),
        CheckConnection({ workspaceId, connectionId: createdConnection.id })
      ),
      model((model) => {
        expect(model.open).toEqual(Open.Connection({ connectionId: createdConnection.id }))
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "MCP server created" }])
        expect(model.connections.adding).toEqual(Option.none())
      }),
      dialogClosed,
      Command.resolve(
        CheckConnection,
        ConnectionsBlock.Message.CheckedConnection({
          connectionId: createdConnection.id,
          health: { status: "healthy" }
        })
      ),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("confirms a connection removed in a toast and shows the list of connections, closing the dialog", () => {
    story(
      update,
      given(removingConnection),
      message(
        fromConnections(ConnectionsBlock.Message.WroteAction({ written: ConnectionWritten.Remove({ connectionId }) }))
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(Open.isAnyOf(["Connections"])(model.open)).toBe(true)
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Search tools removed" }])
        expect(model.connections.removing).toEqual(Option.none())
      }),
      dialogClosed,
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("opens the dialog on the integrations for the sidebar's Create, whatever destination shows, and not the page's list", () => {
    story(
      update,
      given(withConnectionPage),
      message(fromConnections(ConnectionsBlock.Message.ClickedAdd({ capability: Option.some("tools") }))),
      dialogShown,
      model((model) => {
        expect(model.connections.dialog.isOpen).toBe(true)
        expect(model.connections.adding).toEqual(
          Option.some(Adding.Choosing({ capability: Option.some("tools"), query: "" }))
        )
        expect(model.open).toEqual(Open.Connection({ connectionId }))
      })
    )
  })

  it("shows the page of the agent that a row of the sidebar or the list opens, and the list again from it", () => {
    story(
      update,
      given(opened),
      message(fromAgents(AgentsBlock.Message.ClickedAgent({ agentId: scoutAgent.id }))),
      model((model) => {
        expect(model.open).toEqual(Open.Agent({ agentId: scoutAgent.id }))
        expect(model.home.groups.selected).toEqual(Option.none())
      }),
      message(fromAgents(AgentsBlock.Message.ClickedBrowse())),
      model((model) => {
        expect(Open.isAnyOf(["Agents"])(model.open)).toBe(true)
      }),
      message(fromAgents(AgentsBlock.Message.ClickedAgent({ agentId: scoutAgent.id }))),
      message(Message.ClickedAgents()),
      model((model) => {
        expect(Open.isAnyOf(["Agents"])(model.open)).toBe(true)
      })
    )
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
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
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
        expect(HomeOpen.isAnyOf(["Groups"])(model.home.open)).toBe(true)
        expect(model.home.groups.selected).toEqual(Option.none())
      }),
      // Picking a group from the page opens it, which leaves the page.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
        expect(model.home.groups.selected).toEqual(Option.some(groupId))
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
        expect(HomeOpen.isAnyOf(["Groups"])(model.home.open)).toBe(true)
      })
    )
  })

  it("opens the group of a task's thread with the thread open, and marks the group in the list", () => {
    for (const destination of [
      fromHome(HomeBlock.Message.ClickedTriage()),
      fromHome(HomeBlock.Message.ClickedTasks())
    ]) {
      story(
        update,
        given(opened),
        receivedTask,
        message(destination),
        message(Message.ClickedMenu()),
        dialogShown,
        message(fromTasks(TasksBlock.Message.ClickedTask({ groupId, threadId: thread.id }))),
        dialogClosed,
        ...draftsRead,
        model((model) => {
          expect(
            HomeOpen.isAnyOf(["Group"])(model.home.open) && [
              model.home.open.groupId,
              Option.map(model.home.open.model.thread, (open) => [open.threadId, open.model.threadId])
            ]
          ).toEqual([groupId, Option.some([thread.id, thread.id])])
          expect(model.home.groups.selected).toEqual(Option.some(groupId))
          expect(model.menu.isOpen).toBe(false)
        })
      )
    }
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
        expect(model.home.groups.selected).toEqual(Option.none())
        expect(model.connections.connections.map(({ connection }) => connection.name)).toEqual(["Models"])
      }),
      // With the connections shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
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
        expect(model.home.groups.selected).toEqual(Option.none())
        expect(model.agents.agents.map(({ agent }) => agent.id)).toEqual([scoutAgent.id])
      }),
      // With the agents shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
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
        expect(model.home.groups.selected).toEqual(Option.none())
      }),
      // With the settings shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
      })
    )
  })

  it("hands the settings what the person does in them, and shows the member they open beside their page", () => {
    story(
      update,
      given(settingsRead),
      message(Message.ClickedSettings()),
      message(fromSettings(SettingsBlock.Message.TypedMemberQuery({ query: "bo" }))),
      model((model) => {
        expect(model.settings.filter.query).toBe("bo")
        expect(openMemberId(model)).toEqual(Option.none())
      }),
      message(Message.ClickedMembers()),
      message(fromSettings(SettingsBlock.Message.ClickedMember({ memberId: bob.id }))),
      Command.expectNone(),
      model((model) => {
        expect(openMemberId(model)).toEqual(Option.some(bob.id))
        expect(Open.matchOrElse(model.open, { Settings: ({ page }) => page }, () => undefined)).toBe("Members")
        // Beside the page at Split, there is no dialog to open.
        expect(model.aside.isOpen).toBe(false)
      }),
      message(fromSettings(SettingsBlock.Message.ClickedCloseMember())),
      model((model) => {
        expect(openMemberId(model)).toEqual(Option.none())
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
      })
    )
  })

  it("opens the side pane's dialog for the member where the pane is one, and closes the member as it closes", () => {
    story(
      update,
      given(modifyFields(settingsRead, { viewport: () => "Desktop" })),
      message(Message.ClickedMembers()),
      message(fromSettings(SettingsBlock.Message.ClickedMember({ memberId: bob.id }))),
      dialogShown,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(openMemberId(model)).toEqual(Option.some(bob.id))
      }),
      message(fromAside(DialogBlock.Message.RequestedClose())),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(openMemberId(model)).toEqual(Option.none())
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
      })
    )
  })

  it("closes the member, and the dialog it is in, when another page or destination is shown", () => {
    for (const leaving of [Message.ClickedWorkspace(), Message.ClickedMembers(), Message.ClickedHome()]) {
      story(
        update,
        given(modifyFields(settingsRead, { viewport: () => "Desktop" })),
        message(Message.ClickedMembers()),
        message(fromSettings(SettingsBlock.Message.ClickedMember({ memberId: bob.id }))),
        dialogShown,
        message(leaving),
        dialogClosed,
        model((model) => {
          expect(model.aside.isOpen).toBe(false)
          expect(openMemberId(model)).toEqual(Option.none())
        })
      )
    }
  })

  it("puts the member where the window's width puts the side pane as the window changes", () => {
    story(
      update,
      given(settingsRead),
      message(Message.ClickedMembers()),
      message(fromSettings(SettingsBlock.Message.ClickedMember({ memberId: bob.id }))),
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      dialogShown,
      model((model) => {
        expect(model.aside.isOpen).toBe(true)
        expect(openMemberId(model)).toEqual(Option.some(bob.id))
      }),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      dialogClosed,
      model((model) => {
        expect(model.aside.isOpen).toBe(false)
        expect(openMemberId(model)).toEqual(Option.some(bob.id))
      })
    )
  })

  it("confirms to the person in a toast what they did in the settings, by name, and stays where they are", () => {
    story(
      update,
      given(settingsRead),
      message(Message.ClickedMembers()),
      message(fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.Rename() }))),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Workspace renamed" }])
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      message(fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.RenameSelf() }))),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 2, text: "Name saved" }])
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 2 })),
      message(
        fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.ChangeRole({ memberId: bob.id }) }))
      ),
      Command.expectExact(ExpireConfirmation({ id: 3 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 3, text: "Role saved for Bob" }])
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 3 })),
      message(
        fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.Transfer({ memberId: bob.id }) }))
      ),
      Command.expectExact(ExpireConfirmation({ id: 4 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 4, text: "Bob is now the owner" }])
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 4 })),
      message(fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.Invite() }))),
      Command.expectExact(ExpireConfirmation({ id: 5 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 5, text: "Invitation created" }])
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 5 })),
      message(
        fromSettings(
          SettingsBlock.Message.WroteAction({
            written: SettingsWritten.Revoke({ invitationId: invitation.details.id })
          })
        )
      ),
      Command.expectExact(ExpireConfirmation({ id: 6 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 6, text: "Invitation revoked" }])
        expect(Open.matchOrElse(model.open, { Settings: ({ page }) => page }, () => undefined)).toBe("Members")
      }),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 6 }))
    )
  })

  it("confirms a member removed in a toast, and closes the member and the dialog it was in", () => {
    story(
      update,
      given(modifyFields(settingsRead, { viewport: () => "Desktop" })),
      message(Message.ClickedMembers()),
      message(fromSettings(SettingsBlock.Message.ClickedMember({ memberId: bob.id }))),
      dialogShown,
      message(
        fromSettings(SettingsBlock.Message.WroteAction({ written: SettingsWritten.Remove({ memberId: bob.id }) }))
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      model((model) => {
        expect(model.actions.confirmations).toEqual([{ id: 1, text: "Bob was removed" }])
        expect(openMemberId(model)).toEqual(Option.none())
        expect(model.aside.isOpen).toBe(false)
        expect(Open.isAnyOf(["Settings"])(model.open)).toBe(true)
      }),
      dialogClosed,
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
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
      message(fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels())),
      model((model) => {
        expect(Open.isAnyOf(["Channels"])(model.open)).toBe(true)
        expect(model.home.groups.selected).toEqual(Option.none())
        expect(model.channels.channels.map(({ channel }) => channel.name)).toEqual(["Support"])
      }),
      // With the channels shown, picking the group opens it again.
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open)).toBe(true)
      })
    )
  })

  it("hands the channels what the person does in them", () => {
    story(
      update,
      given(opened),
      message(fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels())),
      message(fromChannels(ChannelsBlock.Message.ClickedAdd())),
      model((model) => {
        expect(model.channels.form).toMatchObject(Option.some({ _tag: "Adding" }))
      })
    )
  })

  it("closes the thread beside the inbox with every navigation that leaves the inbox, so returning shows none", () => {
    for (const navigation of [
      Message.ClickedHome(),
      fromHome(HomeBlock.Message.ClickedTriage()),
      fromHome(HomeBlock.Message.ClickedTasks()),
      Message.ClickedConnections(),
      Message.ClickedAgents(),
      Message.ClickedSettings(),
      Message.ClickedWorkspace(),
      Message.ClickedMembers(),
      fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels()),
      fromGroups(GroupsBlock.Message.ClickedBrowse())
    ]) {
      story(
        update,
        given(opened),
        ...notificationOpened,
        ...threadBesideInboxOpened,
        message(navigation),
        model((model) => {
          expect(model.home.inbox.selected).toEqual(Option.none())
          expect(isThreadOpen(model.home)).toBe(false)
        }),
        message(fromHome(HomeBlock.Message.ClickedInbox())),
        model((model) => {
          expect(HomeOpen.isAnyOf(["Inbox"])(model.home.open)).toBe(true)
          expect(model.home.inbox.selected).toEqual(Option.none())
          expect(isThreadOpen(model.home)).toBe(false)
        })
      )
    }
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(fromGroups(GroupsBlock.Message.ClickedGroup({ groupId }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(model.home.inbox.selected).toEqual(Option.none())
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open) && Option.isNone(model.home.open.model.thread)).toBe(true)
      }),
      message(fromHome(HomeBlock.Message.ClickedInbox())),
      model((model) => {
        expect(model.home.inbox.selected).toEqual(Option.none())
        expect(isThreadOpen(model.home)).toBe(false)
      })
    )
  })

  it("moves the thread open between its dialog and the main pane's side as the window's width changes", () => {
    story(
      update,
      given(opened),
      ...notificationOpened,
      ...threadBesideInboxOpened,
      message(Message.InformedOfViewport({ viewport: "Desktop" })),
      dialogShown,
      model((model) => {
        expect(model.home.aside.isOpen).toBe(true)
        expect(isThreadOpen(model.home)).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Tablet" })),
      Command.expectNone(),
      message(Message.InformedOfViewport({ viewport: "Phone" })),
      Command.expectNone(),
      model((model) => {
        expect(model.home.aside.isOpen).toBe(true)
      }),
      message(Message.InformedOfViewport({ viewport: "Split" })),
      dialogClosed,
      model((model) => {
        expect(model.viewport).toBe("Split")
        expect(model.home.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.home)).toBe(true)
      })
    )
  })

  it("closes the side pane's dialog with every navigation, which takes the thread with its group", () => {
    for (const navigation of [
      Message.ClickedHome(),
      fromHome(HomeBlock.Message.ClickedInbox()),
      fromHome(HomeBlock.Message.ClickedTriage()),
      fromHome(HomeBlock.Message.ClickedTasks()),
      Message.ClickedConnections(),
      Message.ClickedAgents(),
      Message.ClickedSettings(),
      Message.ClickedWorkspace(),
      Message.ClickedMembers(),
      fromConnections(ConnectionsBlock.Message.ClickedBrowseChannels()),
      fromGroups(GroupsBlock.Message.ClickedBrowse())
    ]) {
      story(
        update,
        given(atDesktop),
        ...threadPicked,
        message(navigation),
        dialogClosed,
        model((model) => {
          expect(model.home.aside.isOpen).toBe(false)
          expect(isThreadOpen(model.home)).toBe(false)
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
        expect(model.home.aside.isOpen).toBe(false)
        expect(isThreadOpen(model.home)).toBe(false)
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open) && model.home.open.groupId).toBe(otherGroupId)
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
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open) && model.home.open.groupId).toBe(otherGroupId)
        expect(isThreadOpen(model.home)).toBe(false)
        expect(model.home.groups.selected).toEqual(Option.some(otherGroupId))
        expect(model.search.dialog.isOpen).toBe(false)
        expect(model.home.aside.isOpen).toBe(false)
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

  it("opens the thread the search found in its group, as a task does, with the side pane's dialog where it is one", () => {
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
            HomeOpen.isAnyOf(["Group"])(model.home.open) && [
              model.home.open.groupId,
              Option.map(model.home.open.model.thread, (open) => open.threadId)
            ]
          ).toEqual([groupId, Option.some(thread.id)])
          expect(model.home.groups.selected).toEqual(Option.some(groupId))
          expect(model.home.aside.isOpen).toBe(viewport !== "Split")
          expect(model.search.dialog.isOpen).toBe(false)
        })
      )
    }
  })

  it("opens the conversation the search found with a person, or asks the groups to start one in their dialog", () => {
    const person = message(fromSearch(SearchBlock.Message.ClickedResult({ result: Result.Person({ member: bob }) })))
    const withConversation = modifyFields(opened, {
      home: (home) =>
        modifyFields(home, {
          groups: (groups) =>
            modifyFields(groups, {
              groups: () => [
                { group: general, pending: false, members: 2 },
                { group: conversationWithBob, pending: false, members: 2 }
              ]
            })
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
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open) && model.home.open.groupId).toBe(conversationWithBob.id)
        expect(model.home.groups.selected).toEqual(Option.some(conversationWithBob.id))
        expect(model.home.groups.dialog.isOpen).toBe(false)
      })
    )
    story(
      update,
      given(withConversation),
      message(Message.ClickedAgents()),
      message(Message.ClickedMenu()),
      dialogShown,
      message(Message.ClickedSearch()),
      dialogShown,
      person,
      Command.resolve(Dialog.test.CloseDialog({ id: "search" }), DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.CloseDialog({ id: "workspace-menu" }), DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      model((model) => {
        expect(Open.isAnyOf(["Home"])(model.open)).toBe(true)
        expect(HomeOpen.isAnyOf(["Group"])(model.home.open) && model.home.open.groupId).toBe(conversationWithBob.id)
        expect(model.menu.isOpen).toBe(false)
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
        expect(Open.isAnyOf(["Home"])(model.open)).toBe(true)
        expect(HomeOpen.isAnyOf(["Nothing"])(model.home.open)).toBe(true)
        expect(model.home.groups.dialog.isOpen).toBe(true)
        expect(model.home.groups.starting).toEqual(
          Option.some({ _tag: "Conversation", memberId: Option.some(bob.id), text: "" })
        )
      })
    )
  })
})
