import { GrantResolver } from "@amends-dev/core/authorization"
import { ThreadId, ThreadMessage } from "@amends-dev/core/thread"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option } from "effect"
import {
  Command,
  Mount,
  Subscription,
  click,
  expect,
  expectOutMessage,
  given,
  inside,
  label,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceInGeneral,
  aliceOwns,
  bob,
  bobIsMember,
  connectionOf,
  design,
  general,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  notificationOf,
  now,
  opening,
  reply,
  roles,
  saying,
  scout,
  scoutAgent,
  support,
  testApi,
  thread
} from "../../../test/fixtures.ts"
import { ActionsBlock } from "../../feature/actions/block.ts"
import { Dismiss } from "../../feature/actions/command.ts"
import { AgentsBlock } from "../../feature/agents/block.ts"
import { ChannelsBlock } from "../../feature/channels/block.ts"
import { ComposerBlock } from "../../feature/composer/block.ts"
import { ReadDraft } from "../../feature/composer/command.ts"
import { ConnectionsBlock } from "../../feature/connections/block.ts"
import { Integrations } from "../../feature/connections/definition.ts"
import { GroupBlock } from "../../feature/group/block.ts"
import { GroupsBlock } from "../../feature/groups/block.ts"
import { CreateTeam } from "../../feature/groups/command.ts"
import { InboxBlock } from "../../feature/inbox/block.ts"
import { SearchBlock } from "../../feature/search/block.ts"
import { Search } from "../../feature/search/command.ts"
import { SettingsBlock } from "../../feature/settings/block.ts"
import { timeOf } from "../../seen.ts"
import { WorkspaceBlock } from "./block.ts"
import { LoadIntegrations } from "./command.ts"
import { Message, Open, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership

const opened = init(workspace.id, member.id, workspace.name, "Split").model

/** The window as a phone: the rail and the sidebar are both in the navigation dialog. */
const onPhone = modifyFields(opened, { viewport: () => "Phone" })

const workspaceSubscriptions = WorkspaceBlock.subscriptions

const sceneView = withViewInputs(view, { email: "alice@example.com", now })()

const threadId = ThreadId.ThreadId.make("thread-1")

/** The general group open, with a thread open in it that has a title, and general marked in the groups. */
const withThread = modifyFields(opened, {
  groups: (groups) =>
    modifyFields(groups, {
      groups: () => [{ group: general, pending: false, members: 1 }],
      selected: () => Option.some(general.id)
    }),
  open: () =>
    Open.Group({
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

/** The general group read, which Alice belongs to, with three members, and nothing open. */
const withBrowsableGroup = modifyFields(opened, {
  groups: (groups) =>
    modifyFields(groups, {
      groups: () => [{ group: general, pending: false, members: 3 }],
      memberships: () => [aliceInGeneral]
    })
})

/** The thread open in general with Alice's opening and Bob's reply, and the group's threads listing it. */
const withConversation = modifyFields(withThread, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({
            groupId,
            model: modifyFields(group, {
              members: () => [member, bob],
              threads: (threads) =>
                modifyFields(threads, {
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

/** The thread open in general with no title, whose opening mentions Ada, who was named Adeline when mentioned. */
const withMentioningOpening = modifyFields(withThread, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({
            groupId,
            model: modifyFields(group, {
              thread: Option.map((openThread) => ({
                ...openThread,
                model: modifyFields(openThread.model, {
                  title: () => Option.none(),
                  messages: () => [
                    {
                      message: saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Adeline")}, look`),
                      pending: false
                    }
                  ],
                  members: () => [{ ...bob, name: "Ada" }]
                })
              }))
            })
          })
      },
      () => open
    )
})

/** The same, with no thread open, for one to be picked in the main pane. */
const withoutThread = modifyFields(withConversation, {
  open: (open) =>
    Open.matchOrElse(
      open,
      {
        Group: ({ groupId, model: group }) =>
          Open.Group({ groupId, model: modifyFields(group, { thread: () => Option.none() }) })
      },
      () => open
    )
})

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

/** The agents as an owner reads them: scout runs on the models connection, which the host listed. */
const withAgent = modifyFields(opened, {
  agents: (agents) =>
    modifyFields(agents, {
      agents: () => [{ agent: scoutAgent, pending: false }],
      members: () => [member, bob, scout],
      connections: () => [{ connection: keylessConnection("models-1", "test-models", "Models"), pending: false }],
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
      grants: () => grantsOf([aliceOwns])
    })
})

describe("a workspace", () => {
  it("shows how many notifications wait beside the inbox, which it shows on request", () => {
    scene(
      { update, view: sceneView },
      given(withNotification),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "1"),
      expect(role("main", { name: "Inbox" })).toBeAbsent(),
      click(role("button", { name: "Inbox" })),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("Today"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("Bob"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("#General"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), text("25m ago"))).toExist(),
      expect(within(role("main", { name: "Inbox" }), role("button", { name: "Bob replied" }))).toExist()
    )
  })

  it("names the inbox alone while nothing waits in it", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "Inbox" })).not.toHaveAttr("aria-description"),
      click(role("button", { name: "Inbox" })),
      expect(text("Notifications about your threads arrive here.")).toExist()
    )
  })

  it("reads the inbox whichever destination it shows", () => {
    scene(
      { update, view: sceneView, subscriptions: workspaceSubscriptions },
      given(opened),
      expect(role("main", { name: "Inbox" })).toBeAbsent(),
      Subscription.emit(
        workspaceSubscriptions["inbox/inbox"],
        InboxBlock.Message.ReceivedInbox({ items: withNotification.inbox.items })
      ),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-description", "1"),
      expect(role("main", { name: "Inbox" })).toBeAbsent()
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
        expect(text("Models")).toExist(),
        expect(text("Test API")).toExist(),
        expect(text("Ready")).toExist(),
        expect(role("button", { name: "Add a connection" })).toExist()
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
      inside(role("list", { name: "Connections" }), expect(text("Models")).toExist(), expect(text("Ready")).toExist())
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
      expect(role("button", { name: "Add a connection" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadIntegrations({ workspaceId: workspace.id })),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(LoadIntegrations, Message.ReceivedIntegrations({ integrations: [testApi] })),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("button", { name: "Add a connection" })).toExist()
    )
  })

  it("shows the agents on request, with what they run on and what the person may do with them", () => {
    scene(
      { update, view: sceneView },
      given(withAgent),
      expect(role("button", { name: "Agents" })).toExist(),
      expect(role("main", { name: "Agents" })).toBeAbsent(),
      click(role("button", { name: "Agents" })),
      inside(
        role("main", { name: "Agents" }),
        expect(text("Scout")).toExist(),
        expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist(),
        expect(role("button", { name: "Add an agent" })).toExist(),
        expect(role("button", { name: "Change setup" })).toExist()
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
      click(role("button", { name: "Agents" })),
      expect(text("Runs test-model on Models, any harness, no sandbox.")).toExist()
    )
  })

  it("shows the settings on request, as the owner reads them", () => {
    scene(
      { update, view: sceneView },
      given(withSettings),
      expect(role("main", { name: "Settings" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(
        role("main", { name: "Settings" }),
        expect(role("button", { name: "Rename workspace" })).toExist(),
        expect(text("Bob")).toExist()
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
      expect(role("main", { name: "Settings" })).toBeAbsent(),
      click(role("button", { name: "Settings" })),
      inside(role("main", { name: "Settings" }), expect(role("button", { name: "Rename workspace" })).toExist())
    )
  })

  it("shows the channels on request, with what the person may do with them", () => {
    scene(
      { update, view: sceneView },
      given(withChannel),
      expect(role("button", { name: "Channels" })).toExist(),
      expect(role("main", { name: "Channels" })).toBeAbsent(),
      click(role("button", { name: "Channels" })),
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
      click(role("button", { name: "Channels" })),
      expect(role("heading", { name: "No channels yet", level: 2 })).toExist()
    )
  })

  it("opens on the workspace's own main pane, with Home current and the sidebar named by the workspace", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("main", { name: "Studio" })).toExist(),
      expect(within(role("main", { name: "Studio" }), role("heading", { name: "Studio", level: 1 }))).toExist(),
      expect(within(role("main", { name: "Studio" }), text("Pick a group, or open your inbox."))).toExist(),
      expect(role("navigation", { name: "Studio" })).toExist(),
      expect(role("complementary")).toBeAbsent(),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Connections" })).not.toHaveAttr("aria-current")
    )
  })

  it("names the workspace as the settings hold it, so the sidebar and the main pane follow a rename", () => {
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
      expect(within(role("main", { name: "Atelier" }), role("heading", { name: "Atelier", level: 1 }))).toExist(),
      expect(role("navigation", { name: "Studio" })).toBeAbsent(),
      expect(role("main", { name: "Studio" })).toBeAbsent()
    )
  })

  it("marks the destination shown in the rail, with Home for the inbox and the groups too", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(role("button", { name: "Connections" })),
      expect(role("button", { name: "Connections" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Home" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Agents" })),
      expect(role("button", { name: "Agents" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Connections" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "Channels" })),
      expect(role("button", { name: "Channels" })).toHaveAttr("aria-current", "true"),
      click(role("button", { name: "Settings" })),
      expect(role("button", { name: "Settings" })).toHaveAttr("aria-current", "true"),
      click(role("button", { name: "Inbox" })),
      expect(role("button", { name: "Home" })).toHaveAttr("aria-current", "true"),
      expect(role("button", { name: "Inbox" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Settings" })).not.toHaveAttr("aria-current")
    )
  })

  it("goes home from a destination, to the workspace's own pane with nothing marked in the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      click(role("button", { name: "Connections" })),
      expect(role("main", { name: "Connections" })).toExist(),
      click(role("button", { name: "Home" })),
      expect(role("main", { name: "Connections" })).toBeAbsent(),
      expect(role("main", { name: "Studio" })).toExist(),
      expect(role("button", { name: "Inbox" })).not.toHaveAttr("aria-current")
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

  it("closes the navigation drawer when a link of the sidebar or the rail is followed", () => {
    scene(
      { update, view: sceneView },
      given(onPhone),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Inbox" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("main", { name: "Inbox" })).toExist(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent(),
      click(role("button", { name: "Menu" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "Navigation" })).toExist(),
      click(role("button", { name: "Connections" })),
      Command.expectExact(Dialog.test.CloseDialog),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("main", { name: "Connections" })).toExist(),
      expect(role("dialog", { name: "Navigation" })).toBeAbsent()
    )
  })

  it("closes the navigation drawer when a group is picked from the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(onPhone, {
          groups: (groups) => modifyFields(groups, { groups: () => [{ group: general, pending: false, members: 1 }] })
        })
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
  it("keeps the brand a mark and no button, and the workspaces one click away from the sidebar's header", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(role("button", { name: "amends" })).toBeAbsent(),
      expect(role("img", { name: "amends" })).toExist(),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "All workspaces" }))).toExist(),
      click(role("button", { name: "All workspaces" })),
      expectOutMessage(OutMessage.ClosedWorkspace())
    )
  })

  it("shows who is signed in in the sidebar's footer, and asks to sign out from there", () => {
    scene(
      { update, view: sceneView },
      given(opened),
      expect(within(role("navigation", { name: "Studio" }), text("alice@example.com"))).toExist(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Sign out" }))),
      expectOutMessage(OutMessage.RequestedSignOut())
    )
  })

  it("lists the groups in the sidebar's sections, and opens the one picked in the main pane", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, {
          groups: (groups) => modifyFields(groups, { groups: () => [{ group: general, pending: false, members: 1 }] })
        })
      ),
      expect(within(role("navigation", { name: "Studio" }), role("heading", { name: "Groups", level: 2 }))).toExist(),
      expect(within(role("navigation", { name: "Studio" }), text("No messages yet"))).toExist(),
      expect(role("button", { name: "General" })).not.toHaveAttr("aria-current"),
      click(role("button", { name: "General" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      // The group is named by its own pane once the store has read it.
      expect(role("main", { name: "A group" })).toExist(),
      expect(role("main", { name: "Studio" })).toBeAbsent(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(role("complementary")).toBeAbsent()
    )
  })

  it("takes a new team from the sidebar's heading in a dialog over the page, closed once the team is written", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(opened, { groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) }) })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "New team" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(role("dialog", { name: "New team" })).toExist(),
      type(label("Team name"), "Research"),
      click(role("button", { name: "Create team" })),
      Command.resolve(CreateTeam, GroupsBlock.Message.WroteAction()),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "New team" })).toBeAbsent(),
      expect(role("alert")).toBeAbsent()
    )
  })

  it("opens the group's settings from its main pane in a dialog over the page, its members a tab away", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      click(within(role("main", { name: "General" }), role("button", { name: "Group settings" }))),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      inside(
        role("dialog", { name: "Group settings" }),
        expect(text("# General")).toExist(),
        expect(role("tab", { name: "General" })).toHaveAttr("aria-selected", "true"),
        expect(text("Everyone in the workspace belongs to general.")).toExist(),
        click(role("tab", { name: "Members" })),
        expect(within(role("list", { name: "Members" }), text("Alice"))).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Group settings" })).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist()
    )
  })

  it("shows the thread open in the group in a side pane beside its main pane, and under the group in the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      expect(role("main", { name: "General" })).toExist(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Composer paste crash", level: 2 }))
      ).toExist(),
      expect(within(role("complementary", { name: "Thread" }), text("Thread in General"))).toExist(),
      expect(within(role("main", { name: "General" }), role("complementary"))).toBeAbsent(),
      expect(role("button", { name: "General" })).toHaveAttr("aria-current", "page"),
      expect(
        within(
          role("navigation", { name: "Studio" }),
          within(selector('[aria-current="page"]:not(button)'), text("Composer paste crash"))
        )
      ).toExist()
    )
  })

  it("titles a thread with no title by the words of its opening, a mention as the member's name, in both places", () => {
    scene(
      { update, view: sceneView },
      given(withMentioningOpening),
      expect(
        within(role("complementary", { name: "Thread" }), role("heading", { name: "Hey @Ada, look", level: 2 }))
      ).toExist(),
      expect(
        within(
          role("navigation", { name: "Studio" }),
          within(selector('[aria-current="page"]:not(button)'), text("Hey @Ada, look"))
        )
      ).toExist()
    )
  })

  it("lists the group's threads as messages under their day in the main pane, with the composer to start one in its footer", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      inside(
        role("main", { name: "General" }),
        expect(within(role("list", { name: "Threads" }), text("Today"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text("Alice"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text("1 reply"))).toExist(),
        expect(within(role("list", { name: "Threads" }), text(timeOf(opening.publishedAt)))).toExist(),
        expect(role("button", { name: "Plans for the week" })).toExist(),
        expect(role("form", { name: "Start a thread" })).toExist(),
        expect(label("Start a thread")).toHaveAttr("placeholder", "Message General"),
        expect(role("button", { name: "Start" })).toExist()
      ),
      expect(
        within(role("list", { name: "Threads" }), within(selector('[aria-current="true"]'), text("Plans for the week")))
      ).toExist()
    )
  })

  it("shows the thread's messages in the side pane, the opening first, with the composer to reply in its footer", () => {
    scene(
      { update, view: sceneView },
      given(withConversation),
      inside(
        role("complementary", { name: "Thread" }),
        expect(role("list", { name: "Messages" })).toExist(),
        expect(within(role("list", { name: "Messages" }), text("Plans for the week"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text("1 reply"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text("Sounds good"))).toExist(),
        expect(within(role("list", { name: "Messages" }), text(timeOf(reply.publishedAt)))).toExist(),
        expect(role("form", { name: "Reply" })).toExist(),
        expect(label("Reply")).toHaveAttr("placeholder", "Reply in thread"),
        expect(role("button", { name: "Reply" })).toExist()
      )
    )
  })

  it("opens a thread picked in the main pane in the side pane beside it, marking it in the list, with no dialog", () => {
    scene(
      { update, view: sceneView },
      given(withoutThread),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("list", { name: "Threads" }), selector('[aria-current="true"]'))).toBeAbsent(),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.expectNone(),
      expect(role("complementary", { name: "Thread" })).toExist(),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(
        within(role("list", { name: "Threads" }), within(selector('[aria-current="true"]'), text("Plans for the week")))
      ).toExist()
    )
  })

  it("opens a thread picked in the main pane in the side pane's dialog below Split, closed with the pane's Close", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withoutThread, { viewport: () => "Desktop" })),
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
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Close" }))),
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
      given(modifyFields(withoutThread, { viewport: () => "Phone" })),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      expect(within(role("dialog", { name: "Thread" }), role("complementary", { name: "Thread" }))).toExist(),
      click(within(role("dialog", { name: "Thread" }), role("button", { name: "Back" }))),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Mount.expectEnded(Dialog.test.AcquireResources),
      expect(role("dialog", { name: "Thread" })).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist()
    )
  })

  it("closes the thread when the side pane's dialog closes from its scrim", () => {
    scene(
      { update, view: sceneView },
      given(modifyFields(withoutThread, { viewport: () => "Desktop" })),
      click(role("button", { name: "Plans for the week" })),
      Command.resolve(ReadDraft, ComposerBlock.Message.ReceivedDraft({ text: "" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources()),
      // The scrim has no role to find it by; it is the first element in the dialog.
      click(selector("#workspace-aside div")),
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
      given(modifyFields(withoutThread, { viewport: () => "Desktop", actions: () => withRefusal.actions })),
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

  it("closes the side pane, and the thread under the group in the sidebar, with its button", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      click(within(role("complementary", { name: "Thread" }), role("button", { name: "Close" }))),
      expect(role("complementary")).toBeAbsent(),
      expect(role("main", { name: "General" })).toExist(),
      expect(text("Composer paste crash")).toBeAbsent()
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
      expect(within(role("main", { name: "Groups" }), role("tab", { name: "Your groups" }))).toHaveAttr(
        "aria-selected",
        "true"
      ),
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

  it("leaves the group open, and its thread's side pane, to browse, marking no group in the sidebar", () => {
    scene(
      { update, view: sceneView },
      given(withThread),
      expect(role("complementary", { name: "Thread" })).toExist(),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
      expect(role("main", { name: "Groups" })).toExist(),
      expect(role("main", { name: "General" })).toBeAbsent(),
      expect(role("complementary")).toBeAbsent(),
      expect(within(role("navigation", { name: "Studio" }), role("button", { name: "General" }))).not.toHaveAttr(
        "aria-current"
      ),
      expect(text("Composer paste crash")).toBeAbsent()
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
        modifyFields(onPhone, {
          groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) }),
          open: () => Open.Groups()
        })
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

  it("takes a new team from Create group on the browse page, in the dialog the shell keeps", () => {
    scene(
      { update, view: sceneView },
      given(
        modifyFields(withBrowsableGroup, {
          groups: (groups) => modifyFields(groups, { grants: () => grantsOf([aliceOwns]) })
        })
      ),
      click(within(role("navigation", { name: "Studio" }), role("button", { name: "Browse groups" }))),
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
