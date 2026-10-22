import { Agent } from "@amends-dev/core/agent"
import { BuiltinRoles } from "@amends-dev/core/authorization"
import type { GroupId } from "@amends-dev/core/group"
import { Identity } from "@amends-dev/core/identity"
import { ReplicaRecord } from "@amends-dev/core/replica"
import { ThreadId } from "@amends-dev/core/thread"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { DateTime, Option, Schema } from "effect"
import {
  Command,
  Mount,
  Subscription,
  all,
  change,
  click,
  expect,
  expectAll,
  expectOutMessage,
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
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  art,
  bob,
  bobIsMember,
  design,
  general,
  grantsOf,
  integrationGiving,
  keylessConnection,
  membership,
  now,
  offered,
  reviewer,
  reviewerAgent,
  roleOf,
  roles,
  scout,
  scoutAgent,
  turnOf
} from "../../../test/fixtures.ts"
import { panelIs } from "../../../test/panelSize.ts"
import { Integrations } from "../../data/connections.ts"
import { calendarDate } from "../../seen.ts"
import { AgentsBlock } from "./block.ts"
import { ConfigureAgent, CreateAgent, LoadModels, RemoveAgent, RenameAgent } from "./command.ts"
import { Message, type Model, OfferedModels, OutMessage, Reason, Written } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { agentView } from "./view/detail.ts"
import { dialogView } from "./view/dialog.ts"
import { view } from "./view/list.ts"
import { sidebarView } from "./view/sidebar.ts"

const { workspace, member: alice } = membership
const asMember = { workspaceId: workspace.id, memberId: alice.id }
const workspaceId = workspace.id

const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
const harnessIntegration = integrationGiving("test-harness", "Test harness", ["harnesses"])
const sandboxIntegration = integrationGiving("test-sandbox", "Test sandbox", ["sandboxes"])

const models = keylessConnection("models-1", "test-models", "Models")
const harness = keylessConnection("harness-1", "test-harness", "Harness")
const sandbox = keylessConnection("sandbox-1", "test-sandbox", "Sandbox")

const agentId = scoutAgent.id

const listView = withViewInputs(view, { workspaceName: workspace.name, viewport: "Desktop" })()
const phoneListView = withViewInputs(view, { workspaceName: workspace.name, viewport: "Phone" })()
const dialog = withViewInputs(dialogView, { workspaceName: workspace.name })()

/** The list and the dialog for adding an agent or confirming its removal, which the shell keeps beside them. */
const withDialog: typeof dialog = (model, h) => h.div([], [listView(model, h), dialog(model, h)])
const phoneWithDialog: typeof dialog = (model, h) => h.div([], [phoneListView(model, h), dialog(model, h)])

const addDialog = role("dialog", { name: "Add agent" })

/** The dialog acknowledged open: its element shown, and the resources it holds acquired. */
const dialogOpened = () =>
  [
    Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

/** The dialog acknowledged closed: its element hidden, and the resources it held released. */
const dialogClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

/** Scout as the server says it can't run: the connection of its model was removed. */
const incompleteAgent = Schema.decodeSync(ReplicaRecord.Agent)({
  ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
  readiness: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "model" }] }
})

const ownerGrants = grantsOf([aliceOwns])
const memberGrants = grantsOf([bobIsMember])

/** The agents as an owner of the workspace reads them, scout among them, with the integrations loaded. */
const opened: Model = {
  ...init(workspace.id, alice.id).model,
  isLoaded: true,
  agents: [{ agent: scoutAgent, pending: false }],
  members: [alice, bob, scout],
  connections: [models, harness, sandbox].map((connection) => ({ connection, pending: false })),
  integrations: Integrations.cases.Loaded.make({
    integrations: [modelsIntegration, harnessIntegration, sandboxIntegration]
  }),
  roles,
  workspace: Option.some({ workspace, pending: false }),
  grants: ownerGrants
}

describe("the agents", () => {
  it("are added by an owner in a dialog, on a harness, a model of a connection, and a sandbox the connections give", () => {
    scene(
      { update, view: withDialog, subscriptions: AgentsBlock.subscriptions },
      given(modifyFields(opened, { agents: () => [] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(role("dialog", { name: "Add agent" })).toBeAbsent(),
      click(first(all.role("button", { name: "Add agent" }))),
      ...dialogOpened(),
      expect(role("dialog", { name: "Add agent" })).toExist(),
      inside(
        addDialog,
        expect(text("Studio")).toExist(),
        expect(label("Agent name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
        expect(text("How the workspace calls and mentions it.")).toExist(),
        expect(role("button", { name: "Create agent" })).toBeDisabled(),
        type(label("Agent name"), "Reviewer"),
        change(label("Role"), BuiltinRoles.AdministratorId),
        type(label("Instructions"), "Review what is asked."),
        change(label("Harness"), harness.id),
        expect(label("Model")).toBeDisabled(),
        expect(text("Choose a model connection first.")).toExist(),
        change(label("Model connection"), models.id)
      ),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      inside(
        addDialog,
        expect(text("Loading this connection’s models…")).toExist(),
        expect(label("Model")).toBeDisabled(),
        expect(role("button", { name: "Create agent" })).toBeDisabled()
      ),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        addDialog,
        expect(text("Loading this connection’s models…")).toBeAbsent(),
        expect(label("Model")).not.toBeDisabled(),
        expect(label("Effort")).toBeAbsent(),
        expect(role("button", { name: "Create agent" })).toBeDisabled(),
        change(label("Model"), "test-model"),
        expect(role("button", { name: "Create agent" })).not.toBeDisabled(),
        change(label("Effort"), "high"),
        change(label("Sandbox"), sandbox.id),
        click(role("button", { name: "Create agent" }))
      ),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.AdministratorId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review what is asked.",
            harness: { _tag: "Connection", connectionId: harness.id },
            model: { connectionId: models.id, id: "test-model", effort: "high" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      inside(
        addDialog,
        expect(role("button", { name: "Creating…" })).toBeDisabled(),
        expect(label("Agent name")).toBeDisabled(),
        expect(label("Instructions")).toBeDisabled(),
        expect(label("Role")).toBeDisabled()
      ),
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Reviewer" }) })),
      expect(role("dialog", { name: "Add agent" })).toExist(),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: [scoutAgent, reviewerAgent].map((agent) => ({ agent, pending: false })),
          members: [alice, bob, scout, reviewer],
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: opened.grants
        })
      ),
      expectOutMessage(OutMessage.CreatedAgent({ agentId: reviewerAgent.id, name: "Reviewer" })),
      ...dialogClosed(),
      expect(role("dialog", { name: "Add agent" })).toBeAbsent(),
      expect(role("button", { name: "Reviewer" })).toExist()
    )
  })

  it("are added in a form-sized dialog, 40rem wide and as tall as its content, as @amends-dev/ui's Add agent is", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      ...panelIs("agents-dialog", "form")
    )
  })

  it("are added with a model the connection does not list, named by its id", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, type(label("Agent name"), "Builder"), change(label("Model connection"), models.id)),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        addDialog,
        expect(text("Choose one it lists, or enter any model’s ID.")).toExist(),
        type(label("Model ID"), "other-model"),
        click(role("button", { name: "Create agent" }))
      ),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Builder",
          roleId: BuiltinRoles.MemberId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "other-model" },
            sandbox: null
          })
        })
      ),
      Command.resolve(CreateAgent, Message.WroteAction({ written: Written.Create({ name: "Builder" }) }))
    )
  })

  it("wait for a name and a model before an agent can be created", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(
        addDialog,
        expect(role("button", { name: "Create agent" })).toBeDisabled(),
        type(label("Agent name"), "Reviewer"),
        expect(role("button", { name: "Create agent" })).toBeDisabled(),
        change(label("Model connection"), models.id)
      ),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(
        addDialog,
        expect(role("button", { name: "Create agent" })).toBeDisabled(),
        change(label("Model"), "test-model"),
        expect(role("button", { name: "Create agent" })).not.toBeDisabled(),
        type(label("Agent name"), "   "),
        expect(role("button", { name: "Create agent" })).toBeDisabled()
      )
    )
  })

  it("say under the fields, with the dialog kept open, that an agent could not be created", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, type(label("Agent name"), "Reviewer"), change(label("Model connection"), models.id)),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(addDialog, change(label("Model"), "test-model"), click(role("button", { name: "Create agent" }))),
      Command.expectExact(
        CreateAgent({
          ...asMember,
          name: "Reviewer",
          roleId: BuiltinRoles.MemberId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model" },
            sandbox: null
          })
        })
      ),
      Command.resolve(
        CreateAgent,
        Message.FailedWriteAction({ written: Written.Create({ name: "Reviewer" }), reason: Reason.Unwritable() })
      ),
      inside(
        addDialog,
        expect(text("The agent couldn’t be created. Try again when the host is available.")).toExist(),
        expect(label("Agent name")).toHaveValue("Reviewer"),
        expect(label("Agent name")).not.toBeDisabled(),
        expect(role("button", { name: "Create agent" })).not.toBeDisabled()
      ),
      expect(role("dialog", { name: "Add agent" })).toExist()
    )
  })

  it("mark a connection of the setup that is gone beside its field, and send nothing", () => {
    scene(
      { update, view: withDialog, subscriptions: AgentsBlock.subscriptions },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, type(label("Agent name"), "Reviewer"), change(label("Model connection"), models.id)),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      inside(addDialog, change(label("Model"), "test-model")),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: opened.agents,
          members: opened.members,
          connections: [harness, sandbox].map((connection) => ({ connection, pending: false })),
          roles: opened.roles,
          workspace: opened.workspace,
          grants: opened.grants
        })
      ),
      inside(addDialog, click(role("button", { name: "Create agent" }))),
      Command.expectNone(),
      inside(
        addDialog,
        expect(text("This connection is no longer available to you. Choose another.")).toExist(),
        expect(text("This setup can’t be saved as it is. Change what’s marked, then try again.")).toExist()
      )
    )
  })

  it("show a role the person may not give as unavailable, with why", () => {
    const administrator = modifyFields(opened, {
      grants: () => grantsOf([roleOf("assignment-3", alice.id, BuiltinRoles.AdministratorId)]),
      workspace: () => Option.some({ workspace: { ...workspace, ownerMemberId: bob.id }, pending: false })
    })
    scene(
      { update, view: withDialog },
      given(administrator),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(
        addDialog,
        expect(text("What it may do in the workspace, as a member with this role.")).toExist(),
        expect(label("Role")).toHaveValue(BuiltinRoles.MemberId),
        expect(role("option", { name: "Member" })).not.toBeDisabled(),
        expect(role("option", { name: "Administrator · Only the owner can give this role" })).toBeDisabled(),
        expect(role("option", { name: /^Owner/ })).toBeAbsent()
      )
    )
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, expect(role("option", { name: "Administrator" })).not.toBeDisabled())
    )
  })

  it("say why the models of a connection could not be listed, and take the id of a model all the same", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, change(label("Model connection"), models.id)),
      Command.resolve(
        LoadModels,
        Message.FailedLoadModels({ connectionId: models.id, error: "The host could not be reached. Try again." })
      ),
      inside(
        addDialog,
        expect(text("The host could not be reached. Try again.")).toExist(),
        expect(text("Its models couldn’t be loaded. You can still enter a model’s ID.")).toExist(),
        type(label("Model"), "any-model"),
        expect(label("Model")).toHaveValue("any-model")
      )
    )
  })

  it("put Cancel at the start of the footer and Create agent at its end", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(
        addDialog,
        expectAll(all.role("button")).toHaveCount(3),
        expect(nth(all.role("button"), 0)).toHaveAccessibleName("Close"),
        expect(nth(all.role("button"), 1)).toHaveAccessibleName("Cancel"),
        expect(nth(all.role("button"), 2)).toHaveAccessibleName("Create agent"),
        expect(within(selector(".me-auto"), role("button", { name: "Cancel" }))).toExist(),
        expect(within(selector(".me-auto"), role("button", { name: "Create agent" }))).toBeAbsent()
      )
    )
  })

  it("close the dialog with Cancel and with Close, and open a fresh form the next time", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      inside(addDialog, type(label("Agent name"), "Reviewer"), click(role("button", { name: "Cancel" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(role("dialog", { name: "Add agent" })).toBeAbsent(),
      click(role("button", { name: "Add agent" })),
      ...dialogOpened(),
      expect(label("Agent name")).toHaveValue(""),
      click(within(addDialog, role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(role("dialog", { name: "Add agent" })).toBeAbsent()
    )
  })

  it("report the agent picked from the list, and ask for the models of its connection once", () => {
    scene(
      { update, view: listView },
      given(opened),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectNone()
    )
  })

  it("show an ordinary member each agent with what it runs on, and no way to add one", () => {
    scene(
      { update, view: listView, subscriptions: AgentsBlock.subscriptions },
      given(modifyFields(opened, { grants: () => memberGrants })),
      inside(
        role("list", { name: "Agents" }),
        expect(role("button", { name: "Scout" })).toHaveAttr(
          "aria-description",
          "Auto · No sandbox · test-model · Models"
        )
      ),
      expect(role("button", { name: "Add agent" })).toBeAbsent(),
      // Picking an agent reports it, since a member reads its page too.
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered })),
      // Once the person is given the role that manages them, the button to add one appears.
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: opened.agents,
          members: opened.members,
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: ownerGrants
        })
      ),
      expect(role("button", { name: "Add agent" })).toExist()
    )
  })

  it("say an agent is on its way while its change is, with no status until the server says how ready it is", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      inside(
        role("list", { name: "Agents" }),
        expect(role("button", { name: "Scout" })).toHaveAttr(
          "aria-description",
          "Sending… · Auto · No sandbox · test-model · Models"
        )
      ),
      expect(role("button", { name: "Scout, Needs setup" })).toBeAbsent(),
      click(role("button", { name: "Scout" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered }))
    )
  })

  it("say what each agent runs on, and why one can't run", () => {
    const agentMember = (id: string, agentId: string, name: string) =>
      Schema.decodeSync(Member.Member)({
        id,
        workspaceId: "workspace-1",
        identity: { _tag: "Agent", id: agentId },
        name,
        status: "active"
      })
    const agentOf = (id: string, memberId: string, setup: object) =>
      Schema.decodeSync(ReplicaRecord.Agent)({
        ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
        id,
        memberId,
        ...setup
      })
    const builder = agentMember("member-4", "agent-2", "Builder")
    const stranded = agentMember("member-5", "agent-3", "Stranded")
    const onConnections = agentOf("agent-2", "member-4", {
      harness: { _tag: "Connection", connectionId: harness.id },
      sandbox: { connectionId: sandbox.id }
    })
    const incomplete = agentOf("agent-3", "member-5", {
      model: { connectionId: "gone-1", id: "old-model" },
      readiness: {
        _tag: "Incomplete",
        issues: [
          { _tag: "Removed", part: "model" },
          { _tag: "Uninstalled", part: "harness" },
          { _tag: "Invalid", part: "sandbox", description: "It takes no sandboxes" },
          { _tag: "SandboxRequired" },
          { _tag: "NoHarness" }
        ]
      }
    })
    scene(
      { update, view: listView },
      given(
        modifyFields(opened, {
          agents: () => [onConnections, incomplete].map((agent) => ({ agent, pending: false })),
          members: () => [alice, builder, stranded]
        })
      ),
      expect(role("button", { name: "Builder" })).toHaveAttr(
        "aria-description",
        "Harness · Sandbox · test-model · Models"
      ),
      expect(within(role("button", { name: "Builder" }), text("B"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "Builder" }), selector(".tooltip-anchor"))).toBeAbsent(),
      expect(role("button", { name: "Stranded, Needs setup" })).toHaveAttr(
        "aria-description",
        "Auto · No sandbox · old-model · Removed connection"
      ),
      // The patch says why on hover, in a tooltip, by the first thing in the way.
      expect(within(role("button", { name: "Stranded, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(
        within(role("button", { name: "Stranded, Needs setup" }), text("Its model connection was removed."))
      ).toExist()
    )
  })

  it("say in a sentence why an agent needs setup, by the first of what keeps it from running", () => {
    const stranded = (issue: typeof Agent.Issue.Encoded) =>
      Schema.decodeSync(ReplicaRecord.Agent)({
        ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
        readiness: { _tag: "Incomplete", issues: [issue] }
      })
    const reasons: ReadonlyArray<readonly [typeof Agent.Issue.Encoded, string]> = [
      [{ _tag: "Removed", part: "sandbox" }, "Its sandbox connection was removed."],
      [{ _tag: "Uninstalled", part: "harness" }, "Its harness connection’s integration isn’t installed on this host."],
      [{ _tag: "Invalid", part: "sandbox", description: "It takes no sandboxes" }, "It takes no sandboxes."],
      [{ _tag: "SandboxRequired" }, "Its harness works only in a sandbox, and it has none."],
      [{ _tag: "NoHarness" }, "No connection gives a harness it can run on."]
    ]
    for (const [issue, sentence] of reasons) {
      scene(
        { update, view: listView },
        given(modifyFields(opened, { agents: () => [{ agent: stranded(issue), pending: false }] })),
        expect(within(role("button", { name: "Scout, Needs setup" }), text("Needs setup"))).toHaveClass(
          "text-caution-text"
        ),
        expect(within(role("button", { name: "Scout, Needs setup" }), text(sentence))).toExist()
      )
    }
  })

  it("name the agent an unnamed membership is, and list none whose membership left", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { members: () => [alice, { ...scout, status: "removed" }] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("Scout")).toBeAbsent()
    )
  })

  it("say why the integrations could not be listed, and ask the page to list them again, offering to add only once they are", () => {
    scene(
      { update, view: listView },
      given(
        modifyFields(opened, {
          integrations: () => Integrations.cases.Failed.make({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      expect(text("Loading the integrations…")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })

  it("offer to add an agent when no connection gives models, and say so beside the model connection", () => {
    scene(
      { update, view: withDialog },
      given(
        modifyFields(opened, {
          connections: () => [harness, sandbox].map((connection) => ({ connection, pending: false }))
        })
      ),
      click(first(all.role("button", { name: "Add agent" }))),
      ...dialogOpened(),
      inside(addDialog, expect(text("No connection gives models yet. Add one in Connections.")).toExist())
    )
  })

  it("say why they could not be read", () => {
    scene(
      { update, view: listView, subscriptions: AgentsBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.agents,
        Message.FailedRead({ error: "This browser could not read the workspace’s copy." })
      ),
      expect(text("This browser could not read the workspace’s copy.")).toExist(),
      expect(role("alert")).toExist()
    )
  })

  it("say why they could not be read in place of the list, with the header kept, when none was read", () => {
    scene(
      { update, view: listView, subscriptions: AgentsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      Subscription.emit(
        subscriptions.agents,
        Message.FailedRead({ error: "This browser could not read the workspace’s copy." })
      ),
      expect(role("heading", { name: "Agents", level: 1 })).toExist(),
      expect(role("heading", { name: "Couldn’t load agents", level: 2 })).toExist(),
      expect(text("This browser could not read the workspace’s copy.")).toExist(),
      expect(art("came-apart")).toExist(),
      expect(role("alert")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      expect(role("heading", { name: "No agents yet" })).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      click(role("button", { name: "Retry" })),
      expect(art("came-apart")).toBeAbsent(),
      expect(role("status")).toHaveText("Loading agents…")
    )
  })

  it("show rows that stand in for the list, and say so, not even that there are none, until the agents are read", () => {
    scene(
      { update, view: listView, subscriptions: AgentsBlock.subscriptions },
      given(init(workspace.id, alice.id).model),
      expect(role("heading", { name: "Agents", level: 1 })).toExist(),
      expect(role("status")).toHaveText("Loading agents…"),
      expectAll(all.selector('ul[aria-hidden="true"] li')).toHaveCount(3),
      expect(selector('ul[aria-hidden="true"] li')).toHaveClass("loading-pulse"),
      expect(role("heading", { name: "No agents yet" })).toBeAbsent(),
      expect(role("list", { name: "Agents" })).toBeAbsent(),
      expect(role("tab", { name: "All" })).not.toHaveAttr("aria-description"),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: [],
          members: opened.members,
          connections: opened.connections,
          roles: opened.roles,
          workspace: opened.workspace,
          grants: opened.grants
        })
      ),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(role("status")).toBeAbsent(),
      expect(selector('ul[aria-hidden="true"]')).toBeAbsent(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "0")
    )
  })
})

/** Scout and two more: Nora, who can run, and Review helper, who can't, as an owner reads them. */
const withSeveral: Model = (() => {
  const agentMember = (id: string, agentId: string, name: string) =>
    Schema.decodeSync(Member.Member)({
      id,
      workspaceId: "workspace-1",
      identity: { _tag: "Agent", id: agentId },
      name,
      status: "active"
    })
  const agentOf = (id: string, memberId: string, setup: object) =>
    Schema.decodeSync(ReplicaRecord.Agent)({
      ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
      id,
      memberId,
      ...setup
    })
  const nora = agentMember("member-4", "agent-2", "Nora")
  const helper = agentMember("member-5", "agent-3", "Review helper")
  return {
    ...opened,
    members: [alice, bob, scout, nora, helper],
    agents: [
      scoutAgent,
      agentOf("agent-2", "member-4", {}),
      agentOf("agent-3", "member-5", {
        readiness: { _tag: "Incomplete", issues: [{ _tag: "Removed", part: "sandbox" }] }
      })
    ].map((agent) => ({ agent, pending: false }))
  }
})()

describe("the agents list", () => {
  it("has the tabs All and Needs setup, each with how many agents it holds, All the one shown", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "3"),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-selected", "false"),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-description", "1"),
      expectAll(all.role("button", { name: /^(Scout|Nora|Review helper)/ })).toHaveCount(3),
      click(role("tab", { name: "Needs setup" })),
      expect(role("tab", { name: "Needs setup" })).toHaveAttr("aria-selected", "true"),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(role("button", { name: "Nora" })).toBeAbsent(),
      expect(role("button", { name: "Scout" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Nora" })).toExist()
    )
  })

  it("labels the columns Agent, Harness, Model, and Activity over its rows, which leave the activity blank", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(text("Agent")).toExist(),
      expect(text("Harness")).toExist(),
      expect(text("Model")).toExist(),
      expect(text("Activity")).toExist(),
      expect(within(role("button", { name: "Nora" }), text("Auto"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("No sandbox"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("test-model"))).toExist(),
      expect(within(role("button", { name: "Nora" }), text("Models"))).toExist(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent()
    )
  })

  it("puts the patch of a lilac mark on an agent that needs setup, and none on one that is ready", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(
        within(role("button", { name: "Review helper, Needs setup" }), text("Its sandbox connection was removed."))
      ).toExist(),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveClass(
        "bg-avatar-lilac-bg"
      ),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("R"))).toHaveClass("size-8"),
      expect(within(role("button", { name: "Nora" }), selector(".tooltip-anchor"))).toBeAbsent()
    )
  })

  it("narrows its rows by name as the person searches, in any case and whatever the accents", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      type(label("Search agents"), "REVIEW"),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(role("button", { name: "Nora" })).toBeAbsent(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "3"),
      type(label("Search agents"), "nórá"),
      expect(role("button", { name: "Nora" })).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent()
    )
  })

  it("says nothing matches the search, with the search quoted, and clears it from a quiet button", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      type(label("Search agents"), "zzz"),
      expect(role("heading", { name: "No agents match “zzz”.", level: 2 })).toExist(),
      expect(art("nothing-here")).toExist(),
      expect(role("list", { name: "Agents" })).toBeAbsent(),
      click(role("button", { name: "Clear search" })),
      expect(role("heading", { name: "No agents match “zzz”." })).toBeAbsent(),
      expect(role("button", { name: "Nora" })).toExist()
    )
  })

  it("says every agent can run while the Needs setup tab has none", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { browse: () => ({ tab: "NeedsSetup", query: "" }) })),
      expect(role("heading", { name: "Every agent can run as it is set up.", level: 2 })).toExist(),
      expect(art("rest")).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Scout" })).toExist()
    )
  })

  it("offers adding the first agent to a person who may, and says who can to one who may not", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { agents: () => [] })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(art("sew-in")).toExist(),
      expect(text("Add an agent: a member that works on a harness and a model your connections give.")).toExist(),
      expectAll(all.role("button", { name: "Add agent" })).toHaveCount(2)
    )
    scene(
      { update, view: listView },
      given(modifyFields(opened, { agents: () => [], grants: () => memberGrants })),
      expect(role("heading", { name: "No agents yet", level: 2 })).toExist(),
      expect(text("An administrator can add agents to your workspace.")).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })

  it("names the workspace under the title, which a phone shows", () => {
    scene(
      { update, view: listView },
      given(opened),
      expect(within(role("main", { name: "Agents" }), text(workspace.name))).toHaveClass("max-tablet:block")
    )
  })

  it("calls the button that adds an agent Add on a phone, which opens the same dialog, and Add agent on a wider window", () => {
    scene(
      { update, view: withDialog },
      given(opened),
      expect(within(role("main", { name: "Agents" }), role("button", { name: "Add" }))).toBeAbsent(),
      expect(within(role("main", { name: "Agents" }), role("button", { name: "Add agent" }))).toExist()
    )
    scene(
      { update, view: phoneWithDialog },
      given(opened),
      expect(within(role("main", { name: "Agents" }), role("button", { name: "Add" }))).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent(),
      click(role("button", { name: "Add" })),
      ...dialogOpened(),
      expect(addDialog).toExist()
    )

    for (const viewport of ["Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view: withViewInputs(view, { workspaceName: workspace.name, viewport })() },
        given(opened),
        expect(role("button", { name: "Add agent" })).toExist(),
        expect(role("button", { name: "Add" })).toBeAbsent()
      )
    }
  })

  it("keeps the empty list's button as Add agent on a phone, beside the Add of the header, and offers neither to one who may not", () => {
    scene(
      { update, view: phoneListView },
      given(modifyFields(opened, { agents: () => [] })),
      expect(within(role("main", { name: "Agents" }), role("button", { name: "Add" }))).toExist(),
      expectAll(all.role("button", { name: "Add agent" })).toHaveCount(1)
    )
    scene(
      { update, view: phoneListView },
      given(modifyFields(opened, { agents: () => [], grants: () => memberGrants })),
      expect(role("heading", { name: "Agents", level: 1 })).toExist(),
      expect(role("button", { name: "Add" })).toBeAbsent(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })

  it("is the list alone, with no search or columns, while the workspace has no agent", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { agents: () => [] })),
      expect(label("Search agents")).toBeAbsent(),
      expect(text("Harness")).toBeAbsent()
    )
  })
})

describe("the agents' section of the sidebar", () => {
  const sidebar = withViewInputs(sidebarView, { isListOpen: true, openAgentId: Option.none() })

  it("is a section named Agents with Browse and Add agent, and the title opening the list", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("heading", { name: "Agents", level: 2 })).toExist(),
      expect(within(role("heading", { name: "Agents", level: 2 }), role("button", { name: "Agents" }))).toExist(),
      click(role("button", { name: "Agents" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Browse agents" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Add agent" })),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
    )
  })

  it("marks the title current while the list shows, and not otherwise", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("button", { name: "Agents" })).toHaveAttr("aria-current", "page")
    )
    scene(
      { update, view: sidebar({ isListOpen: false }) },
      given(withSeveral),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current")
    )
  })

  it("lists each agent by its name on a lilac mark, with a patch for the one that needs setup", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      expect(role("button", { name: "Scout" })).toExist(),
      expect(role("button", { name: "Nora" })).toExist(),
      expect(role("button", { name: "Review helper, Needs setup" })).toExist(),
      expect(within(role("button", { name: "Nora" }), text("N"))).toHaveClass("bg-avatar-lilac-bg"),
      expect(within(role("button", { name: "Nora" }), text("N"))).toHaveClass("size-6"),
      expect(within(role("button", { name: "Nora" }), selector(".tooltip-anchor"))).toBeAbsent(),
      expect(within(role("button", { name: "Review helper, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(
        within(role("button", { name: "Review helper, Needs setup" }), text("Its sandbox connection was removed."))
      ).toExist(),
      expect(role("button", { name: "Nora" })).not.toHaveAttr("aria-current")
    )
  })

  it("marks the row of the agent whose page is open current, and the title not", () => {
    scene(
      { update, view: sidebar({ isListOpen: false, openAgentId: Option.some(Identity.AgentId.make("agent-2")) }) },
      given(withSeveral),
      expect(role("button", { name: "Nora" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Scout" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Review helper, Needs setup" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Agents" })).not.toHaveAttr("aria-current")
    )
  })

  it("reports the agent picked, and asks for the models of its connection", () => {
    scene(
      { update, view: sidebar() },
      given(withSeveral),
      click(role("button", { name: "Nora" })),
      expectOutMessage(OutMessage.OpenedAgent({ agentId: Identity.AgentId.make("agent-2") })),
      Command.expectExact(LoadModels({ workspaceId, connectionId: models.id })),
      Command.resolve(LoadModels, Message.ReceivedModels({ connectionId: models.id, models: offered }))
    )
  })

  it("says No agents yet once the agents are read and there are none, and nothing before", () => {
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { agents: () => [] })),
      expect(text("No agents yet")).toExist(),
      expect(role("button", { name: "Scout" })).toBeAbsent()
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { isLoaded: () => false, agents: () => [] })),
      expect(text("No agents yet")).toBeAbsent(),
      expect(role("heading", { name: "Agents", level: 2 })).toExist()
    )
  })

  it("shows an agent on its way as Sending…, with no patch, and offers adding only to a person who may", () => {
    scene(
      { update, view: sidebar() },
      given(modifyFields(opened, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      expect(role("button", { name: "Scout" })).toHaveAttr("aria-description", "Sending…"),
      expect(within(role("button", { name: "Scout" }), text("Sending…"))).toExist()
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(withSeveral, { grants: () => memberGrants })),
      expect(role("button", { name: "Browse agents" })).toExist(),
      expect(role("button", { name: "Add agent" })).toBeAbsent()
    )
  })
})

describe("an agent's page", () => {
  const workspaceName = workspace.name
  const page = withViewInputs(agentView, { agentId, workspaceName })
  const withModels: Model = modifyFields(opened, {
    offered: () => [OfferedModels.Loaded({ connectionId: models.id, models: offered })]
  })
  const readOnly = modifyFields(withModels, { grants: () => memberGrants })

  /** The page and the dialog for confirming its agent's removal, which the shell keeps beside it. */
  const pageWithDialog: typeof dialog = (model, h) => h.div([], [page()(model, h), dialog(model, h)])
  const removeDialog = role("dialog", { name: "Remove agent?" })

  it("shows the agent by its name on a lilac mark, with the workspace under it on a phone", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(role("heading", { name: "Scout", level: 1 })).toExist(),
      expect(text("S")).toHaveClass("bg-avatar-lilac-bg"),
      expect(text("S")).toHaveClass("size-6"),
      expect(text(workspaceName)).toHaveClass("max-tablet:block"),
      expect(text("Needs setup")).toBeAbsent(),
      expect(role("note")).toBeAbsent()
    )
  })

  it("shows an owner its name and its setup as they are, with nothing yet to save", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(label("Agent name")).toHaveValue("Scout"),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      expect(role("heading", { name: "Setup" })).toExist(),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Harness")).toHaveValue(""),
      expect(label("Model connection")).toHaveValue(models.id),
      expect(label("Model")).toHaveValue("test-model"),
      expect(label("Effort")).toHaveValue(""),
      expect(label("Sandbox")).toHaveValue(""),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeAbsent()
    )
  })

  it("lists its details: how its role is changed, that it is idle, and who made it and when", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(role("heading", { name: "Details" })).toExist(),
      expect(text("Role")).toExist(),
      expect(text("Changed in Settings › Members, as any member’s is.")).toExist(),
      expect(text("Current activity")).toExist(),
      expect(text("Idle")).toExist(),
      expect(text("Created by")).toExist(),
      expect(text(`Alice · ${calendarDate(scoutAgent.createdAt)}`)).toExist()
    )
  })

  it("says in a note, a line for each reason, why an agent can't run as it is set up", () => {
    const stranded = Schema.decodeSync(ReplicaRecord.Agent)({
      ...Schema.encodeSync(ReplicaRecord.Agent)(scoutAgent),
      readiness: {
        _tag: "Incomplete",
        issues: [{ _tag: "Removed", part: "model" }, { _tag: "SandboxRequired" }]
      }
    })
    scene(
      { update, view: page() },
      given(modifyFields(withModels, { agents: () => [{ agent: stranded, pending: false }] })),
      expect(role("note", { name: "This agent can’t run as it is set up" })).toExist(),
      expect(text("Its model connection was removed.")).toExist(),
      expect(text("Its harness works only in a sandbox, and it has none.")).toExist(),
      expect(selector(".sr-only")).toHaveText("Needs setup"),
      expect(selector(".text-caution-text.font-medium")).toHaveText("Needs setup")
    )
  })

  it("renames the agent from the name it has, saving on its own, and says why one can't be saved under the name", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Agent name"), " Scout Prime "),
      expect(role("button", { name: "Save name" })).not.toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      click(role("button", { name: "Save name" })),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      expect(label("Agent name")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      Command.resolve(
        RenameAgent,
        Message.FailedWriteAction({ written: Written.Rename({ agentId }), reason: Reason.Invalid() })
      ),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toExist(),
      expect(label("Agent name")).toHaveValue(" Scout Prime "),
      type(label("Agent name"), "Scout Prime"),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toBeAbsent(),
      click(role("button", { name: "Save name" })),
      Command.expectExact(RenameAgent({ ...asMember, agentId, name: "Scout Prime", expectedName: "Scout" })),
      Command.resolve(RenameAgent, Message.WroteAction({ written: Written.Rename({ agentId }) })),
      expect(role("button", { name: "Save name" })).toBeDisabled()
    )
  })

  it("does not save a name that is blank or the name it has", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Agent name"), "   "),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      type(label("Agent name"), "Scout"),
      expect(role("button", { name: "Save name" })).toBeDisabled()
    )
  })

  it("sets the agent up again as a whole, the instructions and the sandbox and the effort together", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      change(label("Sandbox"), sandbox.id),
      change(label("Effort"), "low"),
      expect(role("button", { name: "Save setup" })).not.toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toExist(),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      click(role("button", { name: "Save setup" })),
      Command.expectExact(
        ConfigureAgent({
          ...asMember,
          agentId,
          configuration: Schema.decodeSync(Agent.Configuration)({
            instructions: "Review it twice.",
            harness: { _tag: "Auto" },
            model: { connectionId: models.id, id: "test-model", effort: "low" },
            sandbox: { connectionId: sandbox.id }
          })
        })
      ),
      expect(label("Instructions")).toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeDisabled(),
      Command.resolve(ConfigureAgent, Message.WroteAction({ written: Written.Configure({ agentId }) })),
      expect(label("Instructions")).not.toBeDisabled()
    )
  })

  it("puts the setup back as it is when the person discards what they changed", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      change(label("Sandbox"), sandbox.id),
      click(role("button", { name: "Discard changes" })),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Sandbox")).toHaveValue(""),
      expect(role("button", { name: "Save setup" })).toBeDisabled(),
      expect(role("button", { name: "Discard changes" })).toBeAbsent()
    )
  })

  it("marks a part of the setup that can't be saved beside its field, and sends nothing until it is changed", () => {
    scene(
      { update, view: page() },
      given(
        modifyFields(withModels, {
          connections: () => [harness, sandbox].map((connection) => ({ connection, pending: false }))
        })
      ),
      type(label("Instructions"), "Review it twice."),
      click(role("button", { name: "Save setup" })),
      Command.expectNone(),
      expect(text("This connection is no longer available to you. Choose another.")).toExist(),
      expect(text("This setup can’t be saved as it is. Change what’s marked, then try again.")).toExist(),
      type(label("Instructions"), "Review it thrice."),
      expect(text("This connection is no longer available to you. Choose another.")).toBeAbsent()
    )
  })

  it("says under the setup why it could not be saved, and keeps what the person changed", () => {
    scene(
      { update, view: page() },
      given(withModels),
      type(label("Instructions"), "Review it twice."),
      click(role("button", { name: "Save setup" })),
      Command.resolve(
        ConfigureAgent,
        Message.FailedWriteAction({ written: Written.Configure({ agentId }), reason: Reason.Unwritable() })
      ),
      expect(text("The setup couldn’t be saved. Try again when the host is available.")).toExist(),
      expect(label("Instructions")).toHaveValue("Review it twice."),
      expect(role("button", { name: "Save setup" })).not.toBeDisabled()
    )
  })

  it("shows a person who may not configure the agent its name and setup to read, with nothing to save", () => {
    scene(
      { update, view: page() },
      given(readOnly),
      expect(label("Agent name")).toHaveValue("Scout"),
      expect(label("Agent name")).toBeDisabled(),
      expect(label("Instructions")).toHaveValue("Review what is asked."),
      expect(label("Instructions")).toBeDisabled(),
      expect(label("Model connection")).toBeDisabled(),
      expect(label("Sandbox")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeAbsent(),
      expect(role("button", { name: "Save setup" })).toBeAbsent(),
      expect(role("heading", { name: "Details" })).toExist()
    )
  })

  it("says an agent is on its way, and lets nothing about it be saved yet", () => {
    scene(
      { update, view: page() },
      given(modifyFields(withModels, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      expect(text("Sending…")).toExist(),
      expect(role("note")).toBeAbsent(),
      expect(label("Agent name")).toBeDisabled(),
      expect(role("button", { name: "Save setup" })).toBeAbsent()
    )
  })

  it("says an agent the workspace does not list isn't there, and offers the list", () => {
    scene(
      { update, view: withViewInputs(agentView, { agentId: Identity.AgentId.make("agent-9"), workspaceName })() },
      given(withModels),
      expect(role("heading", { name: "This agent isn’t here", level: 2 })).toExist(),
      expect(art("lost-thread")).toExist(),
      expect(text("It may have been removed, or you can no longer see it.")).toExist(),
      click(role("button", { name: "Show all agents" })),
      expectOutMessage(OutMessage.RequestedBrowse())
    )
  })

  it("says the agent is loading until the agents are read, and not that it isn't there", () => {
    scene(
      { update, view: page() },
      given(init(workspace.id, alice.id).model),
      expect(role("status")).toHaveText("Loading agent…"),
      expect(role("heading", { name: "This agent isn’t here" })).toBeAbsent(),
      expect(label("Agent name")).toBeAbsent()
    )
  })

  it("says why the agents could not be read in place of the agent, when none was read", () => {
    scene(
      { update, view: page() },
      given(
        modifyFields(init(workspace.id, alice.id).model, {
          notice: () => Option.some("This browser could not read the workspace’s copy.")
        })
      ),
      expect(role("heading", { name: "Couldn’t load agents", level: 2 })).toExist(),
      expect(art("came-apart")).toExist(),
      expect(role("status")).toBeAbsent(),
      expect(role("heading", { name: "This agent isn’t here" })).toBeAbsent(),
      click(role("button", { name: "Retry" })),
      expect(art("came-apart")).toBeAbsent(),
      expect(role("status")).toHaveText("Loading agent…")
    )
  })

  it("says the agent isn't there once it is removed from the workspace", () => {
    scene(
      { update, view: page(), subscriptions: AgentsBlock.subscriptions },
      given(withModels),
      expect(label("Agent name")).toExist(),
      Subscription.emit(
        subscriptions.agents,
        Message.ReceivedAgents({
          agents: [],
          members: withModels.members,
          connections: withModels.connections,
          roles: withModels.roles,
          workspace: withModels.workspace,
          grants: withModels.grants
        })
      ),
      expect(role("heading", { name: "This agent isn’t here", level: 2 })).toExist()
    )
  })

  it("offers removing the agent to a person who may, saying what it does, and to nobody else", () => {
    scene(
      { update, view: page() },
      given(withModels),
      expect(role("heading", { name: "Removal" })).toExist(),
      expect(text("Removing this agent ends its membership. Its messages stay in their threads.")).toExist(),
      expect(role("button", { name: "Remove agent" })).toExist()
    )
    scene(
      { update, view: page() },
      given(readOnly),
      expect(role("heading", { name: "Removal" })).toBeAbsent(),
      expect(role("button", { name: "Remove agent" })).toBeAbsent()
    )
    scene(
      { update, view: page() },
      given(modifyFields(withModels, { agents: () => [{ agent: incompleteAgent, pending: true }] })),
      expect(role("heading", { name: "Removal" })).toBeAbsent()
    )
  })

  it("asks to confirm in a dialog naming the agent, and removes its membership once confirmed", () => {
    scene(
      { update, view: pageWithDialog },
      given(withModels),
      expect(removeDialog).toBeAbsent(),
      click(role("button", { name: "Remove agent" })),
      ...dialogOpened(),
      expect(removeDialog).toExist(),
      inside(
        removeDialog,
        expect(role("heading", { name: "Remove agent?" })).toExist(),
        expect(text("Scout")).toExist(),
        expect(text("Scout will leave the workspace. Its messages stay in their threads.")).toExist(),
        expect(role("button", { name: "Cancel" })).toExist()
      ),
      click(within(removeDialog, role("button", { name: "Remove agent" }))),
      Command.expectExact(RemoveAgent({ ...asMember, agentId, removeMemberId: scout.id })),
      inside(removeDialog, expect(role("button", { name: "Removing…" })).toBeDisabled()),
      Command.resolve(RemoveAgent, Message.WroteAction({ written: Written.Remove({ agentId }) })),
      expectOutMessage(OutMessage.RemovedAgent({ name: "Scout" })),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent()
    )
  })

  it("says under the question, with the dialog kept open, that the agent could not be removed", () => {
    scene(
      { update, view: pageWithDialog },
      given(withModels),
      click(role("button", { name: "Remove agent" })),
      ...dialogOpened(),
      click(within(removeDialog, role("button", { name: "Remove agent" }))),
      Command.expectExact(RemoveAgent({ ...asMember, agentId, removeMemberId: scout.id })),
      Command.resolve(
        RemoveAgent,
        Message.FailedWriteAction({ written: Written.Remove({ agentId }), reason: Reason.Unwritable() })
      ),
      inside(
        removeDialog,
        expect(text("The agent couldn’t be removed. Try again when the host is available.")).toExist(),
        expect(role("button", { name: "Remove agent" })).not.toBeDisabled()
      ),
      expect(removeDialog).toExist()
    )
  })

  it("puts Cancel at the start of the question's footer and Remove agent at its end", () => {
    scene(
      { update, view: pageWithDialog },
      given(withModels),
      click(role("button", { name: "Remove agent" })),
      ...dialogOpened(),
      inside(
        removeDialog,
        expectAll(all.role("button")).toHaveCount(3),
        expect(nth(all.role("button"), 1)).toHaveAccessibleName("Cancel"),
        expect(nth(all.role("button"), 2)).toHaveAccessibleName("Remove agent"),
        expect(within(selector(".me-auto"), role("button", { name: "Cancel" }))).toExist(),
        expect(within(selector(".me-auto"), role("button", { name: "Remove agent" }))).toBeAbsent()
      )
    )
  })

  it("is compact, as @amends-dev/ui's question is, and has a Cancel that is a secondary button, bordered as Remove agent is", () => {
    scene(
      { update, view: pageWithDialog },
      given(withModels),
      click(role("button", { name: "Remove agent" })),
      ...dialogOpened(),
      ...panelIs("agents-dialog", "compact"),
      expect(within(removeDialog, role("button", { name: "Cancel" }))).toHaveClass("border-outline"),
      expect(within(removeDialog, role("button", { name: "Cancel" }))).toHaveClass("bg-action-secondary"),
      expect(within(removeDialog, role("button", { name: "Cancel" }))).not.toHaveClass("bg-transparent")
    )
  })

  it("leaves the agent be when the person cancels the question", () => {
    scene(
      { update, view: pageWithDialog },
      given(withModels),
      click(role("button", { name: "Remove agent" })),
      ...dialogOpened(),
      click(within(removeDialog, role("button", { name: "Cancel" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent(),
      expect(label("Agent name")).toHaveValue("Scout"),
      expect(role("button", { name: "Remove agent" })).toExist()
    )
  })
})

/** Agent `agentId`'s turn `id` in `status`, in the group `groupId`, created `minutes` after the time now. */
const turnOfAgent = (
  agentId: string,
  id: string,
  status: Parameters<typeof turnOf>[1],
  groupId: GroupId.GroupId,
  minutes: number
) => ({
  ...turnOf(id, status),
  agentId: Identity.AgentId.make(agentId),
  groupId,
  createdAt: DateTime.add(now, { minutes })
})

/**
 * Scout working in general and waiting in design, Nora waiting in general, and Review helper, who can't run, stopping
 * in design.
 */
const atWork: Model = modifyFields(withSeveral, {
  groups: () => [general, design],
  turns: () => [
    turnOfAgent("agent-1", "turn-1", "running", general.id, 1),
    turnOfAgent("agent-1", "turn-2", "queued", design.id, 2),
    turnOfAgent("agent-2", "turn-3", "queued", general.id, 3),
    turnOfAgent("agent-3", "turn-4", "cancelling", design.id, 4)
  ]
})

describe("what the agents are doing, in the list", () => {
  const scoutRow = role("button", { name: "Scout, Working in #General + 1 more" })
  const noraRow = role("button", { name: "Nora, Queued in #General" })
  const helperRow = role("button", { name: "Review helper, Needs setup" })

  it("says in the Activity column the state of an agent at work, with the logo moving as it does, over where", () => {
    scene(
      { update, view: listView },
      given(atWork),
      expect(within(scoutRow, text("Working"))).toExist(),
      expect(within(scoutRow, text("#General + 1 more"))).toExist(),
      expect(within(scoutRow, selector("svg.logo-working"))).toExist(),
      expect(within(noraRow, text("Queued"))).toExist(),
      expect(within(noraRow, text("#General"))).toExist(),
      expect(within(noraRow, selector("svg.logo-thread"))).toExist(),
      expect(within(helperRow, text("Stopping"))).toExist(),
      expect(within(helperRow, text("#Design"))).toExist(),
      expect(within(helperRow, selector("svg.logo-tug"))).toExist()
    )
  })

  it("puts the state before the place on one line below 48rem, where the cells fold under the name", () => {
    scene(
      { update, view: listView },
      given(atWork),
      expect(within(scoutRow, text("· #General + 1 more"))).toExist(),
      expect(within(noraRow, text("· #General"))).toExist()
    )
  })

  it("leaves the Activity blank for an agent that is idle, or whose turns have all finished", () => {
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          groups: () => [general],
          turns: () => [
            turnOfAgent("agent-1", "turn-1", "completed", general.id, 1),
            turnOfAgent("agent-1", "turn-2", "failed", general.id, 2),
            turnOfAgent("agent-1", "turn-3", "cancelled", general.id, 3)
          ]
        })
      ),
      expect(role("button", { name: "Scout" })).toExist(),
      expect(within(role("button", { name: "Scout" }), selector("svg"))).toBeAbsent(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent()
    )
  })

  it("names the agent by what it is doing in its mark's tooltip, as it names one that needs setup", () => {
    scene(
      { update, view: listView },
      given(atWork),
      expect(within(scoutRow, text("Working in #General + 1 more"))).toExist(),
      expect(within(scoutRow, text("Working in #General + 1 more"))).not.toHaveClass("text-caution-text"),
      expect(within(noraRow, text("Queued in #General"))).toExist(),
      expect(within(helperRow, text("Needs setup"))).toHaveClass("text-caution-text")
    )
  })

  it("describes the row by the activity beside what it runs on", () => {
    scene(
      { update, view: listView },
      given(atWork),
      expect(scoutRow).toHaveAttr(
        "aria-description",
        "Auto · No sandbox · test-model · Models · Working in #General + 1 more"
      )
    )
  })

  it("follows the turns the store holds, as they start and finish", () => {
    scene(
      { update, view: listView, subscriptions: AgentsBlock.subscriptions },
      given(withSeveral),
      expect(role("button", { name: "Nora" })).toExist(),
      Subscription.emit(
        subscriptions.activity,
        Message.ReceivedActivity({
          turns: [turnOfAgent("agent-2", "turn-3", "queued", general.id, 3)],
          groups: [general]
        })
      ),
      expect(noraRow).toExist(),
      expect(within(noraRow, selector("svg.logo-thread"))).toExist(),
      Subscription.emit(
        subscriptions.activity,
        Message.ReceivedActivity({
          turns: [turnOfAgent("agent-2", "turn-3", "running", general.id, 3)],
          groups: [general]
        })
      ),
      expect(role("button", { name: "Nora, Working in #General" })).toExist(),
      expect(within(role("button", { name: "Nora, Working in #General" }), selector("svg.logo-working"))).toExist(),
      Subscription.emit(subscriptions.activity, Message.ReceivedActivity({ turns: [], groups: [general] })),
      expect(role("button", { name: "Nora" })).toExist(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent()
    )
  })

  it("says the state alone while the store has not the group of the turn", () => {
    scene(
      { update, view: listView },
      given(modifyFields(atWork, { groups: () => [] })),
      expect(role("button", { name: "Scout, Working" })).toExist(),
      expect(within(role("button", { name: "Scout, Working" }), text("Working"))).toExist()
    )
  })
})

describe("what the agents are doing, in the sidebar", () => {
  const sidebar = withViewInputs(sidebarView, { isListOpen: true, openAgentId: Option.none() })()

  it("names a row by what its agent is doing and ends it with the logo moving as its turn does", () => {
    scene(
      { update, view: sidebar },
      given(atWork),
      expect(
        within(role("button", { name: "Scout, Working in #General + 1 more" }), selector("svg.logo-working"))
      ).toExist(),
      expect(within(role("button", { name: "Nora, Queued in #General" }), selector("svg.logo-thread"))).toExist(),
      expect(within(role("button", { name: "Review helper, Needs setup" }), selector("svg.logo-tug"))).toExist()
    )
  })

  it("puts the patch of an agent at work on its mark, saying where on hover, and none on one that is idle", () => {
    scene(
      { update, view: sidebar },
      given(modifyFields(atWork, { turns: (turns) => turns.filter(({ agentId }) => agentId === "agent-1") })),
      expect(
        within(role("button", { name: "Scout, Working in #General + 1 more" }), text("Working in #General + 1 more"))
      ).toExist(),
      expect(within(role("button", { name: "Nora" }), selector(".tooltip-anchor"))).toBeAbsent(),
      expect(within(role("button", { name: "Nora" }), selector("svg"))).toBeAbsent()
    )
  })

  it("shows an agent on its way without activity, as it shows it without a patch", () => {
    scene(
      { update, view: sidebar },
      given(modifyFields(atWork, { agents: (agents) => agents.map((item) => ({ ...item, pending: true })) })),
      expect(role("button", { name: "Scout" })).toExist(),
      expect(within(role("button", { name: "Scout" }), selector("svg"))).toBeAbsent()
    )
  })
})

describe("what an agent is doing, on its page", () => {
  const workspaceName = workspace.name
  const pageOf = (id: string) => withViewInputs(agentView, { agentId: Identity.AgentId.make(id), workspaceName })()
  const activity = role("list", { name: "Turns under way" })

  it("lists a line for each turn under way, the most pressing first, with the logo moving as it does and where", () => {
    scene(
      { update, view: pageOf("agent-1") },
      given(atWork),
      expect(text("Current activity")).toExist(),
      expect(text("Idle")).toBeAbsent(),
      expect(within(activity, text("Working"))).toExist(),
      expect(within(activity, text("#General"))).toExist(),
      expect(within(activity, text("Queued"))).toExist(),
      expect(within(activity, text("#Design"))).toExist(),
      expect(within(activity, selector("svg.logo-working"))).toExist(),
      expect(within(activity, selector("svg.logo-thread"))).toExist(),
      expectAll(all.role("listitem")).toHaveCount(2)
    )
  })

  it("says Queued in a place, for an agent whose only turn waits", () => {
    scene(
      { update, view: pageOf("agent-2") },
      given(atWork),
      expect(within(activity, text("Queued"))).toExist(),
      expect(within(activity, text("#General"))).toExist(),
      expect(within(activity, selector("svg.logo-thread"))).toExist(),
      expect(text("Idle")).toBeAbsent()
    )
  })

  it("says Idle for an agent with no turn under way", () => {
    scene(
      { update, view: pageOf("agent-2") },
      given(modifyFields(atWork, { turns: () => [] })),
      expect(text("Idle")).toExist(),
      expect(activity).toBeAbsent()
    )
  })

  it("shows what the agent is doing in its header's status, which an agent that needs setup keeps saying first", () => {
    scene({ update, view: pageOf("agent-1") }, given(atWork), expect(text("Working in #General + 1 more")).toExist())
    scene(
      { update, view: pageOf("agent-3") },
      given(atWork),
      expect(text("Needs setup")).toExist(),
      expect(text("Stopping in #Design")).toBeAbsent(),
      expect(within(activity, text("Stopping"))).toExist(),
      expect(within(activity, selector("svg.logo-tug"))).toExist()
    )
  })

  it("lists a turn whose group is not read by its state alone", () => {
    scene(
      { update, view: pageOf("agent-1") },
      given(modifyFields(atWork, { groups: () => [] })),
      expect(within(activity, text("Working"))).toExist(),
      expect(within(activity, text("Queued"))).toExist(),
      expect(within(activity, text("#General"))).toBeAbsent()
    )
  })

  describe("opening a turn's thread", () => {
    const workingId = role("button", { name: "Working in #General: open its log" })
    const queued = role("button", { name: "Queued in #Design: open its log" })

    /** Scout's queued turn in design works in a thread of its own, `thread-2`. */
    const inTwoThreads = modifyFields(atWork, {
      turns: (turns) =>
        turns.map((turn) => (turn.id === "turn-2" ? { ...turn, threadId: ThreadId.ThreadId.make("thread-2") } : turn))
    })

    it("makes each line one button, named as apps/ui names its link to the turn's log", () => {
      scene(
        { update, view: pageOf("agent-1") },
        given(inTwoThreads),
        expect(within(activity, workingId)).toExist(),
        expect(within(activity, queued)).toExist(),
        expect(within(workingId, text("Working"))).toExist(),
        expect(within(workingId, text("#General"))).toHaveClass("font-medium"),
        expect(within(workingId, selector("svg.logo-working"))).toHaveAttr("aria-hidden", "true"),
        expect(within(queued, selector("svg.logo-thread"))).toExist()
      )
    })

    it("reports the thread of the turn the person picks, with its group", () => {
      scene(
        { update, view: pageOf("agent-1") },
        given(inTwoThreads),
        click(queued),
        expectOutMessage(OutMessage.OpenedThread({ groupId: design.id, threadId: ThreadId.ThreadId.make("thread-2") })),
        click(workingId),
        expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: ThreadId.ThreadId.make("thread-1") }))
      )
    })

    it("names a turn whose group is not read by its state, and still opens its thread", () => {
      scene(
        { update, view: pageOf("agent-2") },
        given(modifyFields(atWork, { groups: () => [] })),
        expect(role("button", { name: "Queued: open its log" })).toExist(),
        click(role("button", { name: "Queued: open its log" })),
        expectOutMessage(OutMessage.OpenedThread({ groupId: general.id, threadId: ThreadId.ThreadId.make("thread-1") }))
      )
    })

    it("has no button while the agent is idle", () => {
      scene(
        { update, view: pageOf("agent-2") },
        given(modifyFields(atWork, { turns: () => [] })),
        expect(text("Idle")).toExist(),
        expect(role("button", { name: "Queued in #General: open its log" })).toBeAbsent()
      )
    })
  })
})
