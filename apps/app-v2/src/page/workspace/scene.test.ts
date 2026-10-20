import { BuiltinRoles, GrantResolver } from "@amends-dev/core/authorization"
import { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  all,
  change,
  click,
  expect,
  expectAll,
  expectNoOutMessage,
  expectOutMessage,
  filter,
  first,
  given,
  inside,
  label,
  nth,
  role,
  scene,
  selector,
  text,
  type,
  within,
  withViewInputs
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceInGeneral,
  aliceOwns,
  bob,
  bobIsMember,
  connectionOf,
  connectionTo,
  design,
  general,
  grantsOf,
  invitation,
  integrationGiving,
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
  thread,
  turnOf
} from "../../../test/fixtures.ts"
import { acknowledgeMenuClosed, chooseMenuItem, closeMenu, openMenu } from "../../../test/menu.ts"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { Dismiss, ExpireConfirmation } from "../../feature/actions/command.ts"
import { Offer } from "../../feature/actions/definition.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RemoveAgent, RenameAgent } from "../../feature/agents/command.ts"
import { Written as AgentWritten } from "../../feature/agents/definition.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  FocusField,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "../../feature/connections/command.ts"
import { Integrations, Written as ConnectionWritten } from "../../feature/connections/definition.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { CreateTeam, JoinGroup } from "../../feature/groups/command.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { MarkNotificationSeen } from "../../feature/inbox/command.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { Search } from "../../feature/search/command.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { RenameSelf, SelectOnFocus } from "../../feature/settings/command.ts"
import { AccountMenu, Written as SettingsWritten } from "../../feature/settings/definition.ts"
import { TasksBlock } from "../../feature/tasks/block.ts"
import * as Drafts from "../../store/Drafts.ts"
import { WorkspaceBlock } from "./block.ts"
import { LoadIntegrations } from "./command.ts"
import { Message, Open, OutMessage } from "./definition.ts"
import { Open as HomeOpen } from "./home/definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const opened = init(workspace.id, member.id, workspace.name, "Split").model

/** The model with the window of the width `viewport`, as the workspace and Home both lay themselves out by it. */
const inWindow = (model: typeof opened, viewport: typeof opened.viewport) =>
  modifyFields(model, { viewport: () => viewport, home: (home) => modifyFields(home, { viewport: () => viewport }) })

/** The window as a phone: the rail and the sidebar are both in the navigation dialog. */
const onPhone = inWindow(opened, "Phone")

const workspaceSubscriptions = WorkspaceBlock.subscriptions

/** A button of the rail, which a section title of the sidebar with the same name is not. */
const railButton = (name: string) => within(role("navigation", { name: "Destinations" }), role("button", { name }))

/** The button of the account on the rail, which opens its menu. */
const railAccountButton = (name: string) =>
  within(role("navigation", { name: "Destinations" }), role("button", { name }))

/** A button of the sidebar, which a button of the rail with the same name is not. */
const sidebarButton = (name: string | RegExp) =>
  within(role("navigation", { name: "Studio" }), role("button", { name }))

const sceneView = withViewInputs(view, {
  email: "alice@example.com",
  appearance: "System",
  now,
  isApplePlatform: true
})()

/** The same page on a platform that is not Apple's, where a shortcut is made with Control. */
const sceneViewOffApple = withViewInputs(view, {
  email: "alice@example.com",
  appearance: "System",
  now,
  isApplePlatform: false
})()

/** The same page in the Appearance the person chose to be Dark. */
const sceneViewInDark = withViewInputs(view, {
  email: "alice@example.com",
  appearance: "Dark",
  now,
  isApplePlatform: true
})()

/** The button that opens the account menu on the rail, for a person who has no name yet. */
const accountButton = "Account: alice@example.com"

const threadId = ThreadId.ThreadId.make("thread-1")

/** The model with Home as `change` makes it. */
const atHome = (model: typeof opened, change: (home: typeof opened.home) => typeof opened.home) =>
  modifyFields(model, { home: change })

/** The general group open in Home, with a thread open in it that has a title, and general marked in the groups. */
const withThread = atHome(opened, (home) =>
  modifyFields(home, {
    groups: (groups) =>
      modifyFields(groups, {
        groups: () => [{ group: general, pending: false, members: 1 }],
        selected: () => Option.some(general.id)
      }),
    open: () =>
      HomeOpen.Group({
        groupId: general.id,
        model: modifyFields(GroupBlock.init(workspace.id, member.id, general.id, Option.some(threadId)).model, {
          group: () => Option.some({ group: general, pending: false }),
          memberships: () => [{ membership: aliceInGeneral, pending: false }],
          members: () => [member],
          thread: Option.map((open) => ({
            ...open,
            model: modifyFields(open.model, { title: () => Option.some("Composer paste crash") })
          }))
        })
      })
  })
)

/** The general group read, which Alice belongs to, with three members, and nothing open. */
const withBrowsableGroup = atHome(opened, (home) =>
  modifyFields(home, {
    groups: (groups) =>
      modifyFields(groups, {
        isLoaded: () => true,
        groups: () => [{ group: general, pending: false, members: 3 }],
        memberships: () => [aliceInGeneral]
      })
  })
)

/** A public team Alice does not belong to. */
const launches = { ...general, id: GroupId.GroupId.make("launches"), name: "launches" }

/** The groups read as above, with the public team `launches` to join beside the general group. */
const withJoinableGroup = atHome(withBrowsableGroup, (home) =>
  modifyFields(home, {
    groups: (groups) =>
      modifyFields(groups, {
        groups: (listed) => [...listed, { group: launches, pending: false, members: 1 }]
      })
  })
)

/** The thread open in general with Alice's opening and Bob's reply, and the group's threads listing it. */
const withConversation = atHome(withThread, (home) =>
  modifyFields(home, {
    open: (open) =>
      HomeOpen.matchOrElse(
        open,
        {
          Group: ({ groupId, model: group }) =>
            HomeOpen.Group({
              groupId,
              model: modifyFields(group, {
                members: () => [member, bob],
                threads: (threads) =>
                  modifyFields(threads, {
                    isLoaded: () => true,
                    threads: () => [
                      {
                        thread,
                        opening: Option.some(opening),
                        task: Option.none(),
                        replies: 1,
                        repliers: [ThreadMessage.Author.cases.Member.make({ memberId: bob.id })],
                        lastActiveAt: reply.publishedAt,
                        pending: false,
                        unread: 0
                      }
                    ]
                  }),
                thread: Option.map((openThread) => ({
                  ...openThread,
                  model: modifyFields(openThread.model, {
                    messages: () => [
                      { message: opening, pending: false },
                      { message: reply, pending: false }
                    ],
                    members: () => [member, bob]
                  })
                }))
              })
            })
        },
        () => open
      )
  })
)

/** The same, with no thread open, for one to be picked in the main pane. */
const withoutThread = atHome(withConversation, (home) =>
  modifyFields(home, {
    open: (open) =>
      HomeOpen.matchOrElse(
        open,
        {
          Group: ({ groupId, model: group }) =>
            HomeOpen.Group({ groupId, model: modifyFields(group, { thread: () => Option.none() }) })
        },
        () => open
      )
  })
)

/** A reply the server refused, with the text it carried. */
const withRefusal = modifyFields(opened, {
  actions: (actions) =>
    modifyFields(actions, {
      actions: () => [
        {
          key: "action-1",
          tag: "PostReply",
          what: "post the reply",
          text: Option.some("Thanks! I'll attach the image."),
          rejection: Option.some("You may not reply here.")
        }
      ]
    })
})

/** The inbox read, with a notification of Bob's reply in a thread of general. */
const withNotification = atHome(opened, (home) =>
  modifyFields(home, {
    inbox: (inbox) =>
      modifyFields(inbox, {
        isLoaded: () => true,
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
)

/** The write that marks the notification seen acknowledged, and the thread's reply draft read, as its thread opens. */
const notificationThreadOpened = [
  Command.resolve(MarkNotificationSeen, InboxBlock.Message.WroteAction()),
  Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" }))
] as const

/** The tasks read: one in triage, in general, and one to do, in design, titled Ship the release. */
const withTasks = atHome(opened, (home) =>
  modifyFields(home, {
    tasks: (tasks) =>
      modifyFields(tasks, {
        items: () => [
          {
            task,
            thread,
            place: "#General",
            opening: Option.some(opening),
            pending: false,
            lastActiveAt: opening.publishedAt
          },
          {
            task: {
              ...task,
              threadId: ThreadId.ThreadId.make("thread-2"),
              groupId: design.id,
              status: "todo" as const
            },
            thread: {
              ...thread,
              id: ThreadId.ThreadId.make("thread-2"),
              groupId: design.id,
              title: "Ship the release"
            },
            place: "#Design",
            opening: Option.none(),
            pending: false,
            lastActiveAt: reply.publishedAt
          }
        ],
        members: () => [member, bob]
      })
  })
)

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
      isLoaded: () => true,
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

const models = keylessConnection("models-1", "test-models", "Models")

/** The dialog of the agents acknowledged open: its element shown, and the resources it holds acquired. */
const agentsDialogOpened = () =>
  [
    Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

const connectionsDialogOpened = agentsDialogOpened

const searchConnection = connectionTo("connection-2", "search-api", "Search tools", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})

/** What a connection of the models integration is, which the host lists beside the search server. */
const createdConnection = connectionTo("connection-9", "test-models", "Test models")

/**
 * The connections as an owner reads them: the host lists a models integration and a search server, and one connection
 * to the latter is read.
 */
const withSearchConnection = modifyFields(opened, {
  connections: (connections) =>
    modifyFields(connections, {
      isLoaded: () => true,
      integrations: () =>
        Integrations.Loaded({
          integrations: [integrationGiving("test-models", "Test models", ["models"]), searchApi]
        }),
      grants: () => grantsOf([aliceOwns]),
      connections: () => [{ connection: searchConnection, pending: false }]
    })
})

/** The agents as an owner reads them: scout runs on the models connection, which the host listed. */
const withAgent = modifyFields(opened, {
  agents: (agents) =>
    modifyFields(agents, {
      isLoaded: () => true,
      agents: () => [{ agent: scoutAgent, pending: false }],
      members: () => [member, bob, scout],
      connections: () => [{ connection: models, pending: false }],
      integrations: () =>
        Integrations.Loaded({ integrations: [integrationGiving("test-models", "Test models", ["models"])] }),
      roles: () => roles,
      workspace: () => Option.some({ workspace, pending: false }),
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
      invitations: () => [{ invitation, pending: false }],
      grants: () => grantsOf([aliceOwns])
    })
})

describe("a workspace", () => {
  it("reads the inbox whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(opened),
      click(sidebarButton("Tasks")),
      expect(role("main", { name: "Inbox" })).toBeAbsent(),
      Subscription.emit(
        workspaceSubscriptions["home/inbox/inbox"],
        InboxBlock.Message.ReceivedInbox({ items: withNotification.home.inbox.items })
      ),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "1 unread"),
      expect(role("main", { name: "Inbox" })).toBeAbsent()
    )
  })

  it("reads the tasks whichever destination shows them", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(opened),
      expect(role("main", { name: "Triage" })).toBeAbsent(),
      Subscription.emit(
        workspaceSubscriptions["home/tasks/tasks"],
        TasksBlock.Message.ReceivedTasks({ items: withTasks.home.tasks.items })
      ),
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-description", "1 to triage"),
      expect(role("main", { name: "Triage" })).toBeAbsent()
    )
  })

  it("shows the connections on request, with what the person may do with them", () => {
    scene(
      { update, view: sceneView },
      given(withConnection),
      expect(role("button", { name: "Connections" })).toExist(),
      expect(role("main", { name: "Connections" })).toBeAbsent(),
      click(role("button", { name: "Connections" })),
      inside(
        role("main", { name: "Connections" }),
        expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "1"),
        expect(role("button", { name: "Models" })).toHaveAttr("aria-description", "Test API · API key")
      )
    )
  })

  it("reads the connections whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(asOwner),
      Subscription.emit(
        workspaceSubscriptions["connections/connections"],
        ConnectionsBlock.Message.ReceivedConnections({ connections: withConnection.connections.connections })
      ),
      expect(role("main", { name: "Connections" })).toBeAbsent(),
      click(role("button", { name: "Connections" })),
      inside(role("list", { name: "Connections" }), expect(role("button", { name: "Models" })).toExist())
    )
  })

  it("lists the integrations again for the connections when the person asks, after the host could not be reached", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, {
          connections: (connections) =>
            modifyFields(connections, {
              integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." }),
              grants: () => grantsOf([aliceOwns])
            })
        })
      ),
      click(role("button", { name: "Connections" })),
      expect(text("The host could not be reached. Try again.")).toExist(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadIntegrations({ workspaceId: workspace.id })),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(LoadIntegrations, Message.ReceivedIntegrations({ integrations: [testApi] })),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent()
    )
  })

  it("shows the agents on request, with what they run on and what the person may do with them", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      expect(role("button", { name: "Agents" })).toExist(),
      expect(role("main", { name: "Agents" })).toBeAbsent(),
      click(railButton("Agents")),
      inside(
        role("main", { name: "Agents" }),
        expect(text("Scout")).toExist(),
        expect(role("button", { name: "Scout" })).toHaveAttr(
          "aria-description",
          "Auto · No sandbox · test-model · Models"
        ),
        expect(role("button", { name: "Add agent" })).toExist()
      )
    )
  })

  it("reads the agents whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(withAgent),
      Subscription.emit(
        workspaceSubscriptions["agents/agents"],
        AgentsBlock.Message.ReceivedAgents({
          agents: withAgent.agents.agents,
          members: withAgent.agents.members,
          connections: withAgent.agents.connections,
          roles: withAgent.agents.roles,
          workspace: withAgent.agents.workspace,
          grants: withAgent.agents.grants
        })
      ),
      expect(role("main", { name: "Agents" })).toBeAbsent(),
      click(railButton("Agents")),
      expect(within(role("main", { name: "Agents" }), role("button", { name: "Scout" }))).toHaveAttr(
        "aria-description",
        "Auto · No sandbox · test-model · Models"
      )
    )
  })

  it("shows the workspace's settings on request, as the owner reads them", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      expect(role("main", { name: "Workspace" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(
        role("main", { name: "Workspace" }),
        expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio"),
        expect(role("region", { name: "Ownership" })).toExist()
      )
    )
  })

  it("reads the settings whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
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
      expect(role("main", { name: "Workspace" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(
        role("main", { name: "Workspace" }),
        expect(role("textbox", { name: "Workspace name" })).toHaveValue("Studio")
      )
    )
  })

  it("shows the channels on request from the connections' sidebar, with what the person may do with them", () => {
    scene(
      { update, view: sceneView },
      given(withChannel),
      expect(role("button", { name: "Channels" })).toBeAbsent(),
      click(railButton("Connections")),
      expect(role("main", { name: "Channels" })).toBeAbsent(),
      click(sidebarButton("Channels")),
      inside(
        role("main", { name: "Channels" }),
        expect(text("From Chat into General")).toExist(),
        expect(text("Opens tasks")).toExist(),
        expect(role("button", { name: "Add a channel" })).toExist()
      )
    )
  })

  it("reads the channels whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(withChannel),
      Subscription.emit(
        workspaceSubscriptions["channels/channels"],
        ChannelsBlock.Message.ReceivedChannels({ channels: [] })
      ),
      expect(role("main", { name: "Channels" })).toBeAbsent(),
      click(railButton("Connections")),
      click(sidebarButton("Browse channels")),
      expect(role("heading", { name: "No channels yet", level: 2 })).toExist()
    )
  })

  it("opens on the inbox in the main pane, with Home current and the sidebar named by the workspace", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(within(role("main", { name: "Inbox" }), role("tab", { name: "Unread" }))).toHaveAttr(
        "aria-selected",
        "true"
      ),
      expect(role("main", { name: "Studio" })).toBeAbsent(),
      expect(text("Pick a group, or open your inbox.")).toBeAbsent(),
      expect(role("navigation", { name: "Studio" })).toExist(),
      expect(sidebarButton("Inbox")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Tasks")).not.toHaveAttr("aria-current"),
      expect(role("complementary")).toBeAbsent(),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Connections" })).not.toHaveAttr("aria-current")
    )
  })

  it("names the workspace as the settings hold it, so the sidebar and the panes that name it follow a rename", () => {
    const renamed = modifyFields(opened, {
      settings: (settings) =>
        modifyFields(settings, {
          workspace: () => Option.some({ workspace: { ...workspace, name: "Atelier" }, pending: false })
        })
    })
    scene(
      { update, view: sceneView },
      given(renamed),
      expect(role("navigation", { name: "Atelier" })).toExist(),
      expect(within(role("navigation", { name: "Atelier" }), text("Atelier"))).toExist(),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      click(role("button", { name: "Connections" })),
      expect(within(role("main", { name: "Connections" }), text("Atelier"))).toExist(),
      expect(within(role("main", { name: "Connections" }), text("Studio"))).toBeAbsent()
    )
  })

  it("marks the destination shown in the rail, with Home for the inbox and the groups too", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(role("button", { name: "Connections" })),
      expect(role("button", { name: "Connections" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Home" })).not.toHaveAttr("aria-current"),
      click(railButton("Agents")),
      expect(railButton("Agents")).toHaveAttr("aria-current", "true"),
      expect(railButton("Connections")).not.toHaveAttr("aria-current"),
      click(railButton("Connections")),
      click(sidebarButton("Channels")),
      expect(railButton("Connections")).toHaveAttr("aria-current", "true"),
      expect(railButton("Agents")).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Settings" })).toHaveAttr("aria-current", "true"),
      click(railButton("Home")),
      click(role("button", { name: "Inbox" })),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Settings" })).not.toHaveAttr("aria-current")
    )
  })

  it("lists the logo, then Home, Agents, and Connections on the rail, then Search, and Settings at the bottom, with no Channels", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(nth(all.role("button"), 0)).toHaveAccessibleName("Amends home"),
      expect(nth(all.role("button"), 1)).toHaveAccessibleName("Home"),
      expect(nth(all.role("button"), 2)).toHaveAccessibleName("Agents"),
      expect(nth(all.role("button"), 3)).toHaveAccessibleName("Connections"),
      expect(nth(all.role("button"), 4)).toHaveAccessibleName("Search"),
      expect(nth(all.role("button"), 5)).toHaveAccessibleName("Settings"),
      expect(railButton("Channels")).toBeAbsent()
    )
  })

  it("opens the search from the rail, which never marks it current", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(railButton("Search")).not.toHaveAttr("aria-current"),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent(),
      click(railButton("Search")),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Find anything" })).toExist(),
      expect(railButton("Search")).not.toHaveAttr("aria-current"),
      expect(railButton("Home")).toHaveAttr("aria-current", "true")
    )
  })

  it("shows the agents' section for Agents, with its rows, its title current, and not Home's items", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      expect(sidebarButton("Scout")).toBeAbsent(),
      click(railButton("Agents")),
      expect(sidebarButton("Agents")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Browse agents")).toExist(),
      expect(sidebarButton("Add agent")).toExist(),
      expect(sidebarButton("Scout")).toExist(),
      expect(sidebarButton("Inbox")).toBeAbsent(),
      expect(sidebarButton("Find anything…")).toExist()
    )
  })

  it("opens the dialog to add an agent from the agents' sidebar, over the destination that shows", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      click(railButton("Agents")),
      click(sidebarButton("Add agent")),
      ...agentsDialogOpened(),
      expect(role("dialog", { name: "Add agent" })).toExist(),
      inside(role("dialog", { name: "Add agent" }), expect(text(workspace.name)).toExist()),
      expect(role("main", { name: "Agents" })).toExist()
    )
  })

  it("adds an agent in the dialog, confirms it in a toast that goes by itself, and opens its page", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(withAgent),
      click(railButton("Agents")),
      click(sidebarButton("Add agent")),
      ...agentsDialogOpened(),
      inside(
        role("dialog", { name: "Add agent" }),
        type(label("Agent name"), "Reviewer"),
        change(label("Model connection"), models.id)
      ),
      Command.resolve(LoadModels, AgentsBlock.Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        role("dialog", { name: "Add agent" }),
        change(label("Model"), "test-model"),
        click(role("button", { name: "Create agent" }))
      ),
      Command.resolve(
        CreateAgent,
        AgentsBlock.Message.WroteAction({ written: AgentWritten.Create({ name: "Reviewer" }) })
      ),
      Subscription.emit(
        workspaceSubscriptions["agents/agents"],
        AgentsBlock.Message.ReceivedAgents({
          agents: [scoutAgent, reviewerAgent].map((agent) => ({ agent, pending: false })),
          members: [...withAgent.agents.members, reviewer],
          connections: withAgent.agents.connections,
          roles: withAgent.agents.roles,
          workspace: withAgent.agents.workspace,
          grants: withAgent.agents.grants
        })
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      expect(role("dialog", { name: "Add agent" })).toBeAbsent(),
      expect(within(role("status"), text("Reviewer created"))).toExist(),
      inside(
        role("main", { name: "Reviewer" }),
        expect(role("heading", { name: "Reviewer", level: 1 })).toExist(),
        expect(label("Agent name")).toHaveValue("Reviewer")
      ),
      expect(sidebarButton("Reviewer")).toHaveAttr("aria-current", "page"),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(role("status")).toBeAbsent()
    )
  })

  it("confirms saving an agent's name in a toast that goes by itself, and keeps its page", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withAgent, { open: () => Open.Agent({ agentId: scoutAgent.id }) })),
      type(label("Agent name"), "Scout Prime"),
      click(role("button", { name: "Save name" })),
      Command.resolve(
        RenameAgent,
        AgentsBlock.Message.WroteAction({ written: AgentWritten.Rename({ agentId: scoutAgent.id }) })
      ),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      expect(within(role("status"), text("Name saved"))).toExist(),
      expect(role("main", { name: "Scout" })).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(role("status")).toBeAbsent()
    )
  })

  it("confirms saving an agent's setup in a toast, whichever destination shows its page", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withAgent, { open: () => Open.Agent({ agentId: scoutAgent.id }) })),
      type(label("Instructions"), "Review it twice."),
      click(role("button", { name: "Save setup" })),
      Command.resolve(
        ConfigureAgent,
        AgentsBlock.Message.WroteAction({ written: AgentWritten.Configure({ agentId: scoutAgent.id }) })
      ),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      expect(within(role("status"), text("Setup saved"))).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(role("status")).toBeAbsent()
    )
  })

  it("removes an agent from its page after a question, confirms it in a toast, and shows the list", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withAgent, { open: () => Open.Agent({ agentId: scoutAgent.id }) })),
      click(role("button", { name: "Remove agent" })),
      ...agentsDialogOpened(),
      expect(role("dialog", { name: "Remove agent?" })).toExist(),
      click(within(role("dialog", { name: "Remove agent?" }), role("button", { name: "Remove agent" }))),
      Command.resolve(
        RemoveAgent,
        AgentsBlock.Message.WroteAction({ written: AgentWritten.Remove({ agentId: scoutAgent.id }) })
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      expect(role("dialog", { name: "Remove agent?" })).toBeAbsent(),
      expect(within(role("status"), text("Scout removed"))).toExist(),
      expect(role("main", { name: "Agents" })).toExist(),
      expect(sidebarButton("Agents")).toHaveAttr("aria-current", "page"),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("opens an agent's page from its row in the sidebar, which is then current in place of the title", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      click(railButton("Agents")),
      expect(sidebarButton("Scout")).not.toHaveAttr("aria-current"),
      click(sidebarButton("Scout")),
      Command.resolve(LoadModels, AgentsBlock.Message.ReceivedModels({ connectionId: models.id, models: offered })),
      expect(role("main", { name: "Agents" })).toBeAbsent(),
      inside(
        role("main", { name: "Scout" }),
        expect(role("heading", { name: "Scout", level: 1 })).toExist(),
        expect(label("Agent name")).toHaveValue("Scout"),
        expect(text(workspace.name)).toExist()
      ),
      expect(sidebarButton("Scout")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Agents")).not.toHaveAttr("aria-current"),
      expect(railButton("Agents")).toHaveAttr("aria-current", "true"),
      click(sidebarButton("Agents")),
      expect(role("main", { name: "Scout" })).toBeAbsent(),
      expect(role("main", { name: "Agents" })).toExist(),
      expect(sidebarButton("Agents")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Scout")).not.toHaveAttr("aria-current")
    )
  })

  it("opens an agent's page from its row in the list, and offers the list again when the agent is not there", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      click(railButton("Agents")),
      inside(role("main", { name: "Agents" }), click(role("button", { name: "Scout" }))),
      Command.resolve(LoadModels, AgentsBlock.Message.ReceivedModels({ connectionId: models.id, models: offered })),
      expect(role("main", { name: "Scout" })).toExist(),
      expect(sidebarButton("Scout")).toHaveAttr("aria-current", "page"),
      expect(role("heading", { name: "This agent isn't here" })).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(modifyFields(withAgent, { open: () => Open.Agent({ agentId: Identity.AgentId.make("agent-9") }) })),
      expect(role("main", { name: "Agent" })).toExist(),
      expect(role("heading", { name: "This agent isn't here", level: 2 })).toExist(),
      click(role("button", { name: "Show all agents" })),
      expect(role("main", { name: "Agents" })).toExist()
    )
  })

  it("takes what a confirmation offers: Open opens the group in Home, from any destination, and the confirmation goes", () => {
    const offering = (model: typeof opened) =>
      modifyFields(model, {
        actions: (actions) =>
          modifyFields(actions, {
            confirmations: () => [
              { id: 1, text: "Joined #General", offer: Option.some(Offer.OpenGroup({ groupId: general.id })) }
            ],
            nextConfirmationId: () => 2
          })
      })

    scene(
      { update, view: sceneView },
      given(offering(modifyFields(withBrowsableGroup, { open: () => Open.Agents() }))),
      expect(role("main", { name: "Agents" })).toExist(),
      expect(within(role("list", { name: "Notifications" }), text("Joined #General"))).toExist(),
      click(within(role("list", { name: "Notifications" }), role("button", { name: "Open" }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      expect(role("main", { name: "Agents" })).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(text("Joined #General")).toBeAbsent()
    )
  })

  it("opens the thread of a turn an agent has under way from its page, in its group in Home, beside the threads", () => {
    const atWork = modifyFields(withAgent, {
      open: () => Open.Agent({ agentId: scoutAgent.id }),
      agents: (agents) =>
        modifyFields(agents, {
          groups: () => [general],
          turns: () => [{ ...turnOf("turn-1", "running"), groupId: general.id }]
        })
    })

    scene(
      { update, view: sceneView },
      given(inWindow(atWork, "Desktop")),
      inside(role("main", { name: "Scout" }), click(role("button", { name: "Working in #General: open its log" }))),
      Command.resolve(
        ReadDraft({
          workspaceId: workspace.id,
          memberId: member.id,
          place: Drafts.Place.cases.Thread.make({ groupId: general.id })
        }),
        ComposerBlock.Message.ReceivedDraft({ text: "" })
      ),
      Command.resolve(
        ReadDraft({
          workspaceId: workspace.id,
          memberId: member.id,
          place: Drafts.Place.cases.Reply.make({ threadId: thread.id })
        }),
        ComposerBlock.Message.ReceivedDraft({ text: "" })
      ),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("main", { name: "Scout" })).toBeAbsent(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(railButton("Home")).toHaveAttr("aria-current", "true"),
      expect(railButton("Agents")).not.toHaveAttr("aria-current")
    )
  })

  it("shows the connections' sections for Connections, by what they give, and the Channels section", () => {
    const withModelsAndTools = modifyFields(opened, {
      connections: (connections) =>
        modifyFields(connections, {
          isLoaded: () => true,
          integrations: () =>
            Integrations.Loaded({
              integrations: [integrationGiving("test-models", "Test models", ["models", "tools"])]
            }),
          connections: () => [{ connection: keylessConnection("models-1", "test-models", "Hosted"), pending: false }],
          grants: () => grantsOf([aliceOwns])
        })
    })
    scene(
      { update, view: sceneView },
      given(withModelsAndTools),
      click(railButton("Connections")),
      expect(sidebarButton("Models")).toExist(),
      expect(sidebarButton("Tools")).toExist(),
      expect(sidebarButton("Sandboxes")).toExist(),
      expect(sidebarButton("Harnesses")).toExist(),
      expect(sidebarButton("Channels")).toExist(),
      expect(sidebarButton("Hosted")).toExist(),
      expectAll(filter(all.role("listitem"), { hasText: "None yet" })).toHaveCount(2),
      expect(sidebarButton("Browse models")).toExist(),
      expect(sidebarButton("Browse tools")).toExist(),
      expect(sidebarButton("Browse channels")).toExist(),
      expect(sidebarButton("Add channel connection")).toBeAbsent(),
      expect(sidebarButton("Models")).not.toHaveAttr("aria-current"),
      expect(sidebarButton("Channels")).not.toHaveAttr("aria-current"),
      expect(sidebarButton("Inbox")).toBeAbsent()
    )
  })

  it("opens a connection's page from its row in the list and from the sidebar, and offers the list again when the connection is not there", () => {
    const hosted = keylessConnection("models-1", "test-models", "Hosted")
    const withHosted = modifyFields(opened, {
      connections: (connections) =>
        modifyFields(connections, {
          isLoaded: () => true,
          integrations: () =>
            Integrations.Loaded({
              integrations: [integrationGiving("test-models", "Test models", ["models", "tools"])]
            }),
          connections: () => [{ connection: hosted, pending: false }],
          grants: () => grantsOf([aliceOwns])
        })
    })
    scene(
      { update, view: sceneView },
      given(withHosted),
      click(railButton("Connections")),
      inside(role("main", { name: "Connections" }), click(role("button", { name: "Hosted" }))),
      expect(role("main", { name: "Hosted" })).toExist(),
      expect(role("main", { name: "Connections" })).toBeAbsent(),
      expect(first(all.role("button", { name: "Hosted" }))).toHaveAttr("aria-current", "page"),
      expect(railButton("Connections")).toHaveAttr("aria-current", "true"),
      expect(sidebarButton("Models")).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sceneView },
      given(withHosted),
      click(railButton("Connections")),
      click(sidebarButton("Hosted")),
      expect(role("main", { name: "Hosted" })).toExist(),
      click(sidebarButton("Tools")),
      expect(role("main", { name: "Connections" })).toExist(),
      expect(sidebarButton("Tools")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Models")).not.toHaveAttr("aria-current"),
      expect(role("tab", { name: "Tools" })).toHaveAttr("aria-selected", "true"),
      click(sidebarButton("Browse models")),
      expect(role("tab", { name: "Models" })).toHaveAttr("aria-selected", "true")
    )
    scene(
      { update, view: sceneView },
      given(
        modifyFields(withHosted, {
          open: () => Open.Connection({ connectionId: keylessConnection("gone-1", "test-models", "Gone").id })
        })
      ),
      expect(role("main", { name: "Connection" })).toExist(),
      expect(role("heading", { name: "This connection isn't here", level: 2 })).toExist(),
      click(role("button", { name: "Show all connections" })),
      expect(role("main", { name: "Connections" })).toExist()
    )
  })

  it("adds a connection in the dialog, confirms it in a toast that goes by itself, opens its page, and checks it", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(withSearchConnection),
      click(railButton("Connections")),
      click(sidebarButton("Add model connection")),
      ...connectionsDialogOpened(),
      inside(
        role("dialog", { name: "Add model connection" }),
        expect(text(workspace.name)).toExist(),
        click(role("button", { name: "Test models" }))
      ),
      Command.resolve(FocusField, ConnectionsBlock.Message.CompletedFocusField()),
      inside(role("dialog", { name: "Configure connection" }), click(role("button", { name: "Create connection" }))),
      Command.expectExact(
        AddConnection({
          workspaceId: workspace.id,
          integration: "test-models",
          name: "Test models",
          auth: "none",
          apiKey: "",
          settings: {},
          key: Option.none()
        })
      ),
      Command.resolve(
        AddConnection,
        ConnectionsBlock.Message.AddedConnection({ connectionId: createdConnection.id, name: "Test models" })
      ),
      Subscription.emit(
        workspaceSubscriptions["connections/connections"],
        ConnectionsBlock.Message.ReceivedConnections({
          connections: [searchConnection, createdConnection].map((connection) => ({ connection, pending: false }))
        })
      ),
      Command.expectHas(
        Dialog.test.CloseDialog,
        ExpireConfirmation({ id: 1 }),
        CheckConnection({ workspaceId: workspace.id, connectionId: createdConnection.id })
      ),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(
        CheckConnection,
        ConnectionsBlock.Message.CheckedConnection({
          connectionId: createdConnection.id,
          health: { status: "healthy" }
        })
      ),
      expect(role("dialog", { name: "Configure connection" })).toBeAbsent(),
      expect(text("Test models created")).toExist(),
      inside(
        role("main", { name: "Test models" }),
        expect(role("heading", { name: "Test models", level: 1 })).toExist(),
        expect(role("note", { name: "Working" })).toExist()
      ),
      expect(sidebarButton("Test models")).toHaveAttr("aria-current", "page"),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(text("Test models created")).toBeAbsent()
    )
  })

  it("opens the dialog on the integrations from the list's Add connection, which the shell keeps over the page", () => {
    scene(
      { update, view: sceneView },
      given(withSearchConnection),
      click(railButton("Connections")),
      click(within(role("main", { name: "Connections" }), role("button", { name: "Add connection" }))),
      ...connectionsDialogOpened(),
      inside(
        role("dialog", { name: "Add connection" }),
        expect(text(workspace.name)).toExist(),
        expect(role("button", { name: "MCP server" })).toExist(),
        expect(role("button", { name: "Test models" })).toExist()
      ),
      expect(role("main", { name: "Connections" })).toExist()
    )
  })

  it("confirms saving a connection's name and settings in a toast that goes by itself, and keeps its page", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withSearchConnection, { open: () => Open.Connection({ connectionId: searchConnection.id }) })),
      type(label("Connection name"), "Search"),
      click(role("button", { name: "Save name" })),
      Command.resolve(
        RenameConnection,
        ConnectionsBlock.Message.WroteAction({
          written: ConnectionWritten.Rename({ connectionId: searchConnection.id })
        })
      ),
      Command.expectExact(ExpireConfirmation({ id: 1 })),
      expect(text("Name saved")).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      type(label("Server URL"), "https://search.example.com/v2/mcp"),
      click(role("button", { name: "Save settings" })),
      Command.resolve(
        ConfigureConnection,
        ConnectionsBlock.Message.WroteAction({
          written: ConnectionWritten.Configure({ connectionId: searchConnection.id })
        })
      ),
      Command.expectExact(ExpireConfirmation({ id: 2 })),
      expect(text("Settings saved")).toExist(),
      expect(role("main", { name: "Search tools" })).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 2 })),
      expect(text("Settings saved")).toBeAbsent()
    )
  })

  it("replaces a connection's key from its page in a dialog, and confirms it in a toast", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withSearchConnection, { open: () => Open.Connection({ connectionId: searchConnection.id }) })),
      click(role("button", { name: "Replace key" })),
      ...connectionsDialogOpened(),
      inside(
        role("dialog", { name: "Replace API key" }),
        type(label("New API key"), "sk-new"),
        click(role("button", { name: "Replace key" }))
      ),
      Command.expectExact(
        ReplaceConnectionKey({ workspaceId: workspace.id, connectionId: searchConnection.id, apiKey: "sk-new" })
      ),
      Command.resolve(
        ReplaceConnectionKey,
        ConnectionsBlock.Message.ReplacedConnectionKey({ connectionId: searchConnection.id })
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      expect(role("dialog", { name: "Replace API key" })).toBeAbsent(),
      expect(text("API key replaced")).toExist(),
      expect(role("main", { name: "Search tools" })).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("removes a connection from its page after a question, confirms it in a toast, and shows the list", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withSearchConnection, { open: () => Open.Connection({ connectionId: searchConnection.id }) })),
      click(role("button", { name: "Remove connection" })),
      ...connectionsDialogOpened(),
      expect(role("dialog", { name: "Remove connection?" })).toExist(),
      click(within(role("dialog", { name: "Remove connection?" }), role("button", { name: "Remove connection" }))),
      Command.expectExact(
        RemoveConnection({
          workspaceId: workspace.id,
          memberId: membership.member.id,
          connectionId: searchConnection.id
        })
      ),
      Command.resolve(
        RemoveConnection,
        ConnectionsBlock.Message.WroteAction({
          written: ConnectionWritten.Remove({ connectionId: searchConnection.id })
        })
      ),
      Command.expectHas(Dialog.test.CloseDialog, ExpireConfirmation({ id: 1 })),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      expect(role("dialog", { name: "Remove connection?" })).toBeAbsent(),
      expect(text("Search tools removed")).toExist(),
      expect(role("main", { name: "Connections" })).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 }))
    )
  })

  it("marks the Channels title current while the channels show, with Connections current on the rail", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(railButton("Connections")),
      click(sidebarButton("Channels")),
      expect(role("main", { name: "Channels" })).toExist(),
      expect(sidebarButton("Channels")).toHaveAttr("aria-current", "page"),
      expect(railButton("Connections")).toHaveAttr("aria-current", "true")
    )
  })

  it("shows the settings' section for Settings, with Workspace and Members, each opening its own page", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      click(railButton("Settings")),
      expect(within(role("navigation", { name: "Studio" }), text("Settings"))).toExist(),
      expect(sidebarButton("Workspace")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Members")).not.toHaveAttr("aria-current"),
      expect(sidebarButton("Inbox")).toBeAbsent(),
      expect(role("main", { name: "Workspace" })).toExist(),
      click(sidebarButton("Members")),
      expect(role("main", { name: "Members" })).toExist(),
      expect(role("main", { name: "Workspace" })).toBeAbsent(),
      expect(sidebarButton("Members")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Workspace")).not.toHaveAttr("aria-current"),
      click(sidebarButton("Workspace")),
      expect(role("main", { name: "Workspace" })).toExist(),
      expect(sidebarButton("Workspace")).toHaveAttr("aria-current", "page")
    )
  })

  it("opens a member in the side pane beside the members, and closes it with the pane's Close", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      click(railButton("Settings")),
      click(sidebarButton("Members")),
      expect(role("complementary")).toBeAbsent(),
      click(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))),
      inside(
        role("complementary", { name: "Member details" }),
        expect(role("heading", { name: "Member details" })).toExist(),
        expect(role("combobox", { name: "Workspace role" })).toHaveValue(BuiltinRoles.MemberId),
        expect(role("button", { name: "Save role" })).toExist()
      ),
      expect(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))).toHaveAttr(
        "aria-current",
        "true"
      ),
      click(within(role("complementary", { name: "Member details" }), role("button", { name: "Close" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(role("main", { name: "Members" })).toExist()
    )
  })

  it("lists the invitations waiting on the Members page, and lends the settings' dialog to the shell to invite from", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      click(railButton("Settings")),
      click(sidebarButton("Members")),
      inside(
        role("main", { name: "Members" }),
        expect(within(role("region", { name: "Pending invitations" }), text("carol@example.com"))).toExist(),
        click(role("button", { name: "Invite people" }))
      ),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Invite member" }),
        expect(role("textbox", { name: "Sign-in email" })).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Invite member" })).toBeAbsent()
    )
  })

  it("leaves the member when another page or destination is picked", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      click(railButton("Settings")),
      click(sidebarButton("Members")),
      click(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))),
      expect(role("complementary", { name: "Member details" })).toExist(),
      click(sidebarButton("Workspace")),
      expect(role("complementary")).toBeAbsent(),
      click(sidebarButton("Members")),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))).not.toHaveAttr("aria-current"),
      click(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))),
      click(railButton("Home")),
      expect(role("complementary")).toBeAbsent(),
      click(railButton("Settings")),
      click(sidebarButton("Members")),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))).not.toHaveAttr("aria-current")
    )
  })

  it("opens a member in the side pane's dialog below Split, which closes the member with it", () => {
    scene(
      { update, view: sceneView },
      given(inWindow(withSettings, "Desktop")),
      click(railButton("Settings")),
      click(sidebarButton("Members")),
      click(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Member details" }),
        expect(role("heading", { name: "Member details", level: 2 })).toExist(),
        expect(role("complementary", { name: "Member details" })).toExist()
      ),
      click(within(role("dialog", { name: "Member details" }), role("button", { name: "Close" }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Member details" })).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("main", { name: "Members" }), role("button", { name: "Bob" }))).not.toHaveAttr("aria-current")
    )
  })

  it("marks Triage or Tasks in the sidebar while it shows, with Home in the rail, and neither anywhere else", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "Triage" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Triage" })),
      expect(role("button", { name: "Triage" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Inbox" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      click(role("button", { name: "Tasks" })),
      expect(role("button", { name: "Tasks" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Triage" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      click(role("button", { name: "Connections" })),
      expect(role("button", { name: "Tasks" })).toBeAbsent(),
      expect(role("button", { name: "Home" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Home" })),
      expect(role("button", { name: "Tasks" })).not.toHaveAttr("aria-current")
    )
  })

  it("goes home from a destination, to the inbox, whatever Home showed when the person left", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(sidebarButton("Tasks")),
      expect(role("main", { name: "Tasks" })).toExist(),
      click(role("button", { name: "Connections" })),
      expect(role("main", { name: "Connections" })).toExist(),
      click(role("button", { name: "Home" })),
      expect(role("main", { name: "Connections" })).toBeAbsent(),
      expect(role("main", { name: "Tasks" })).toBeAbsent(),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(sidebarButton("Inbox")).toHaveAttr("aria-current", "page"),
      expect(sidebarButton("Tasks")).not.toHaveAttr("aria-current")
    )
  })

  it("keeps the sidebar in place from Desktop, with no Menu button and no navigation dialog", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("navigation", { name: "Studio" })).toExist(),
      expect(role("navigation", { name: "Destinations" })).toExist(),
      expect(role("button", { name: "Menu" })).toBeAbsent(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent()
    )
  })

  it("opens the navigation drawer from the menu button as a dialog, and closes it from the scrim", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      expect(role("button", { name: "Menu" })).toExist(),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      expect(role("navigation", { name: "Destinations" })).toBeAbsent(),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Navigation" }),
        expect(role("navigation", { name: "Destinations" })).toExist(),
        expect(role("navigation", { name: "Studio" })).toExist()
      ),
      // The scrim has no role to find it by; it is the first element in the dialog.
      click(selector("#workspace-menu div")),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      expect(role("navigation", { name: "Studio" })).toBeAbsent()
    )
  })

  it("closes the navigation drawer when an item of the sidebar is followed", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      click(sidebarButton("Inbox")),
      Command.expectExact(Dialog.test.CloseDialog),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent()
    )
  })

  it("keeps the navigation drawer open when a destination is picked on the rail, which shows its sidebar", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(within(role("dialog", { name: "Navigation" }), text("Inbox"))).toExist(),
      click(railButton("Connections")),
      Command.expectNone(),
      expect(role("dialog", { name: "Navigation" })).toExist(),
      expect(within(role("dialog", { name: "Navigation" }), text("Inbox"))).toBeAbsent(),
      expect(within(role("dialog", { name: "Navigation" }), text("Models"))).toExist(),
      expect(role("main", { name: "Connections" })).toExist(),
      click(sidebarButton("Browse models")),
      Command.expectExact(Dialog.test.CloseDialog),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      expect(role("main", { name: "Connections" })).toExist()
    )
  })

  it("closes the navigation drawer when a group is picked from the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(
        atHome(onPhone, (home) =>
          modifyFields(home, {
            groups: (groups) =>
              modifyFields(groups, {
                groups: () => [{ group: general, pending: false, members: 1 }],
                memberships: () => [aliceInGeneral]
              })
          })
        )
      ),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Navigation" })).toExist(),
      click(role("button", { name: "General" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist()
    )
  })
  it("draws the logo as the rail's brand, a button that goes Home, and the workspaces one click away from the sidebar's header", () => {
    scene(
      { update, view: sceneView },
      given(withNotification),
      expect(role("button", { name: "Amends home" })).toExist(),
      expect(within(role("button", { name: "Amends home" }), selector("svg"))).toHaveAttr("viewBox", "0 0 64 64"),
      expect(within(role("button", { name: "Amends home" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(role("main", { name: "Inbox" })).toExist(),
      click(sidebarButton("Tasks")),
      expect(role("main", { name: "Inbox" })).toBeAbsent(),
      click(role("button", { name: "Amends home" })),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(railButton("Home")).toHaveAttr("aria-current", "true"),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "All workspaces" }))).toExist(),
      click(role("button", { name: "All workspaces" })),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })

  it("has no footer in the sidebar: who is signed in, and signing out, are in the account menu on the rail", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(within(role("navigation", { name: "Studio" }), text("alice@example.com"))).toBeAbsent(),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "Sign out" }))).toBeAbsent(),
      expect(role("button", { name: "Sign out" })).toBeAbsent(),
      expect(railAccountButton(accountButton)).toHaveAttr("aria-haspopup", "menu")
    )
  })

  it("ends the rail with the person's account: their initials, named by the address they signed in with until they have a name", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(railAccountButton(accountButton)).toHaveAttr("aria-expanded", "false"),
      expect(within(railAccountButton(accountButton), text("A"))).toHaveAttr("aria-hidden", "true"),
      expect(role("menu")).toBeAbsent()
    )
    scene(
      { update, view: sceneView },
      given(withSettings),
      expect(railAccountButton("Account: Alice")).toExist(),
      expect(role("button", { name: accountButton })).toBeAbsent()
    )
  })

  it("opens the account menu to the right of the rail with their address alone, until they have a name", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      ...openMenu(AccountMenu, accountButton),
      expect(railAccountButton(accountButton)).toHaveAttr("aria-expanded", "true"),
      expect(within(role("menu"), text("alice@example.com"))).toExist(),
      expect(within(role("menu"), text("Alice"))).toBeAbsent()
    )
  })

  it("names the person over the address they signed in with in the account menu, once they have a name", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      ...openMenu(AccountMenu, "Account: Alice"),
      expect(within(role("menu"), text("Alice"))).toExist(),
      expect(within(role("menu"), text("alice@example.com"))).toExist()
    )
  })

  it("lists the Appearances with the current one checked, then the way to another workspace, the settings, a name, and out", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      ...openMenu(AccountMenu, accountButton),
      expect(within(role("menu"), text("Appearance"))).toExist(),
      expectAll(all.role("menuitem")).toHaveCount(7),
      expect(role("menuitem", { name: "System (selected)" })).toExist(),
      expect(role("menuitem", { name: "Light" })).toExist(),
      expect(role("menuitem", { name: "Dark" })).toExist(),
      expect(role("menuitem", { name: "Switch workspace" })).toExist(),
      expect(role("menuitem", { name: "Workspace settings" })).toExist(),
      expect(role("menuitem", { name: "Change your name…" })).toExist(),
      expect(role("menuitem", { name: "Sign out" })).toExist()
    )
    scene(
      { update, view: sceneViewInDark },
      given(opened),
      ...openMenu(AccountMenu, accountButton),
      expect(role("menuitem", { name: "Dark (selected)" })).toExist(),
      expect(role("menuitem", { name: "System" })).toExist(),
      expect(role("menuitem", { name: "Light" })).toExist()
    )
  })

  it("closes the account menu with no choice when the person presses its button again", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      ...openMenu(AccountMenu, accountButton),
      ...closeMenu(AccountMenu, accountButton),
      expect(role("menu")).toBeAbsent()
    )
  })

  it("reports to the app each entry of the account menu that it acts on, and closes the menu", () => {
    const entries = [
      ["System (selected)", "System"],
      ["Light", "Light"],
      ["Dark", "Dark"],
      ["Switch workspace", "SwitchWorkspace"],
      ["Sign out", "SignOut"]
    ] as const

    for (const [item, entry] of entries) {
      scene(
        { update, view: sceneView },
        given(opened),
        ...openMenu(AccountMenu, accountButton),
        click(role("menuitem", { name: item })),
        expectOutMessage(OutMessage.ChoseAccountEntry({ entry })),
        ...acknowledgeMenuClosed(AccountMenu),
        expect(role("menu")).toBeAbsent()
      )
    }
  })

  it("shows the workspace's settings from the account menu, as the rail's Settings does, and closes the menu", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("main", { name: "Workspace" })).toBeAbsent(),
      ...openMenu(AccountMenu, accountButton),
      click(role("menuitem", { name: "Workspace settings" })),
      expectNoOutMessage(),
      ...acknowledgeMenuClosed(AccountMenu),
      expect(role("menu")).toBeAbsent(),
      expect(role("main", { name: "Workspace" })).toExist(),
      expect(sidebarButton("Workspace")).toHaveAttr("aria-current", "page")
    )
  })

  it("changes the person's name from the account menu in a compact dialog, and confirms it in a toast", () => {
    const nameDialog = role("dialog", { name: "Your name" })

    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      // The inbox Home opens on is read, so that its line saying it is loading is not the status the toast is looked for in.
      given(
        atHome(withSettings, (home) =>
          modifyFields(home, { inbox: (inbox) => modifyFields(inbox, { isLoaded: () => true }) })
        )
      ),
      expect(nameDialog).toBeAbsent(),
      ...openMenu(AccountMenu, "Account: Alice"),
      ...chooseMenuItem(AccountMenu, "Change your name…"),
      expectNoOutMessage(),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      Mount.resolve(SelectOnFocus, SettingsBlock.Message.CompletedSelectOnFocus()),
      inside(
        nameDialog,
        expect(role("textbox", { name: "Name" })).toHaveValue("Alice"),
        expect(role("button", { name: "Save name" })).toBeDisabled(),
        type(role("textbox", { name: "Name" }), "Alice M."),
        click(role("button", { name: "Save name" }))
      ),
      Command.expectExact(RenameSelf({ workspaceId: workspace.id, memberId: member.id, name: "Alice M." })),
      Command.resolve(RenameSelf, SettingsBlock.Message.WroteAction({ written: SettingsWritten.RenameSelf() })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Mount.expectEnded(SelectOnFocus),
      expect(within(role("status"), text("Name saved"))).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(role("status")).toBeAbsent()
    )
  })

  it("opens a thread picked in the main pane in the side pane's dialog below Split, closed with the pane's Close", () => {
    scene(
      { update, view: sceneView },
      given(inWindow(withoutThread, "Desktop")),
      expect(role("complementary")).toBeAbsent(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Thread" }),
        expect(role("heading", { name: "Thread", level: 2 })).toExist(),
        expect(role("complementary", { name: "Thread" })).toExist(),
        expect(role("heading", { name: "A thread", level: 2 })).toExist()
      ),
      expect(
        within(role("list", { name: "Threads" }), within(selector('[aria-current="true"]'), text("Plans for the week")))
      ).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Close thread" }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("list", { name: "Threads" }), selector('[aria-current="true"]'))).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist()
    )
  })

  it("fills the window with the side pane's dialog on a phone, which its Back closes", () => {
    scene(
      { update, view: sceneView },
      given(inWindow(withoutThread, "Phone")),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(within(role("dialog", { name: "Thread" }), role("complementary", { name: "Thread" }))).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Back to General" }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist()
    )
  })

  it("closes the thread when the side pane's dialog closes from its scrim", () => {
    scene(
      { update, view: sceneView },
      given(inWindow(withoutThread, "Desktop")),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      // The scrim has no role to find it by; it is the first element in the dialog.
      click(selector("#home-aside div")),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(within(role("list", { name: "Threads" }), selector('[aria-current="true"]'))).toBeAbsent(),
      expect(text("A thread")).toBeAbsent()
    )
  })

  it("shows the toasts in the side pane's dialog while it is open, where they are read and dismissed", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(inWindow(withoutThread, "Desktop"), { actions: () => withRefusal.actions })),
      expect(within(role("alert"), text("Couldn't post the reply: You may not reply here."))).toExist(),
      expect(within(role("dialog", { name: "Thread" }), role("alert"))).toBeAbsent(),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(within(role("dialog", { name: "Thread" }), role("alert"))).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Dismiss" }))),
      Command.expectExact(Dismiss({ workspaceId: workspace.id, memberId: member.id, key: "action-1" })),
      Command.resolve(Dismiss, ActionsBlock.Message.CompletedDismiss())
    )
  })

  it("opens a notification's thread in the side pane's dialog below Split, closed with the pane's Close", () => {
    const inbox = role("main", { name: "Inbox" })

    scene(
      { update, view: sceneView },
      given(inWindow(withNotification, "Desktop")),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Thread" }),
        expect(role("heading", { name: "Thread", level: 2 })).toExist(),
        expect(role("complementary", { name: "Thread" })).toExist(),
        expect(role("heading", { name: "A thread", level: 2 })).toExist()
      ),
      expect(within(inbox, selector('[aria-current="true"]'))).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Close thread" }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(inbox, selector('[aria-current="true"]'))).toBeAbsent(),
      expect(inbox).toExist()
    )
  })

  it("closes a notification's thread when the side pane's dialog closes from its scrim", () => {
    scene(
      { update, view: sceneView },
      given(inWindow(withNotification, "Desktop")),
      click(role("button", { name: "Bob replied" })),
      ...notificationThreadOpened,
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      // The scrim has no role to find it by; it is the first element in the dialog.
      click(selector("#home-aside div")),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(within(role("main", { name: "Inbox" }), selector('[aria-current="true"]'))).toBeAbsent()
    )
  })

  it("browses the groups from the sidebar's button in the main pane, with Home marked, and opens one from its row", () => {
    scene(
      { update, view: sceneView },
      given(withBrowsableGroup),
      expect(role("main", { name: "Groups" })).toBeAbsent(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(role("main", { name: "Studio" })).toBeAbsent(),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(within(role("main", { name: "Groups" }), role("tab", { name: "Discover" }))).toHaveAttr(
        "aria-selected",
        "true"
      ),
      click(within(role("main", { name: "Groups" }), role("tab", { name: "Your groups" }))),
      expect(within(role("main", { name: "Groups" }), role("button", { name: "General" }))).toHaveAttr(
        "aria-description",
        "Public · 3 members"
      ),
      click(within(role("main", { name: "Groups" }), role("button", { name: "General" }))),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      expect(role("main", { name: "Groups" })).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page")
    )
  })

  it("confirms a group joined from the browse page, offering to open it, and leaves the page as it is", () => {
    scene(
      { update, view: sceneView },
      given(withJoinableGroup),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      click(within(role("main", { name: "Groups" }), role("button", { name: "Join #launches" }))),
      expect(within(role("main", { name: "Groups" }), role("button", { name: "Join #launches" }))).toBeDisabled(),
      expect(text("Joined #launches")).toBeAbsent(),
      Command.resolve(JoinGroup, GroupsBlock.Message.SucceededJoinGroup({ groupId: launches.id })),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(within(role("list", { name: "Notifications" }), text("Joined #launches"))).toExist(),
      expect(within(role("list", { name: "Notifications" }), role("button", { name: "Open" }))).toExist(),
      Command.resolve(ExpireConfirmation, ActionsBlock.Message.ExpiredConfirmation({ id: 1 })),
      expect(text("Joined #launches")).toBeAbsent(),
      expect(role("main", { name: "Groups" })).toExist()
    )
  })

  it("closes the navigation drawer when the sidebar's button browses the groups", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Navigation" })).toExist(),
      click(role("button", { name: "Browse groups" })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      expect(role("main", { name: "Groups" })).toExist()
    )
  })

  it("takes a new team from Create group on the browse page below 64rem, with the sidebar in the shut drawer", () => {
    scene(
      { update, view: sceneView },
      given(
        atHome(onPhone, (home) =>
          modifyFields(home, {
            groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) }),
            open: () => HomeOpen.Groups()
          })
        )
      ),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      click(within(role("main", { name: "Groups" }), role("button", { name: "Create group" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "New team" })).toExist(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.resolve(CreateTeam, GroupsBlock.Message.WroteAction()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      expect(role("main", { name: "Groups" })).toExist()
    )
  })

  it("shows what the server refused as toasts over the shell, which are dismissed from there", () => {
    scene(
      { update, view: sceneView },
      given(withRefusal),
      expect(within(role("alert"), text("Couldn't post the reply: You may not reply here."))).toExist(),
      expect(within(role("alert"), text("Thanks! I'll attach the image."))).toExist(),
      click(within(role("alert"), role("button", { name: "Dismiss" }))),
      Command.expectExact(Dismiss({ workspaceId: workspace.id, memberId: member.id, key: "action-1" })),
      Command.resolve(Dismiss, ActionsBlock.Message.CompletedDismiss())
    )
  })

  it("shows the search in the sidebar's header, its shortcut hidden from assistive technology, and opens it in a dialog", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "Find anything…" }))).toExist(),
      expect(within(role("button", { name: "Find anything…" }), text("⌘K"))).toHaveAttr("aria-hidden", "true"),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent(),
      click(role("button", { name: "Find anything…" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Find anything" })).toExist(),
      expect(label("Find anything")).toHaveAttr("data-foldkit-dialog-initial-focus", "")
    )
  })

  it("writes the search's shortcut for the platform: Command K on an Apple platform, and Control K elsewhere", () => {
    const search = role("button", { name: "Find anything…" })

    scene(
      { update, view: sceneView },
      given(opened),
      expect(within(search, text("⌘K"))).toHaveAttr("aria-hidden", "true"),
      expect(within(search, text("Ctrl K"))).toBeAbsent()
    )
    scene(
      { update, view: sceneViewOffApple },
      given(opened),
      expect(within(search, text("Ctrl K"))).toHaveAttr("aria-hidden", "true"),
      expect(within(search, text("⌘K"))).toBeAbsent()
    )
  })

  it("opens the group the search found from its row, closing the search", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(role("button", { name: "Find anything…" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      type(label("Find anything"), "des"),
      Command.resolve(
        Search,
        SearchBlock.Message.CompletedSearch({
          query: "des",
          results: { groups: [{ group: design, name: "Design" }], threads: [], people: [] }
        })
      ),
      click(within(role("dialog", { name: "Find anything" }), role("button", { name: /^Design/ }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      expect(role("dialog", { name: "Find anything" })).toBeAbsent(),
      expect(role("main", { name: "A group" })).toExist()
    )
  })

  it("opens the search from the drawer on a phone, in a dialog over the drawer, with the sidebar shut", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      click(within(role("dialog", { name: "Navigation" }), role("button", { name: "Find anything…" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Navigation" })).toExist(),
      expect(role("dialog", { name: "Find anything" })).toExist()
    )
  })
})
