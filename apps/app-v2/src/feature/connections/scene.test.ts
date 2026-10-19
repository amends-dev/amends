import { BuiltinRoles, GrantResolver } from "@amends-dev/core/authorization"
import { describe, it } from "@effect/vitest"
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
import { aliceOwns, connectionOf, membership, roleOf, roles, testApi } from "../../../test/fixtures.ts"
import { ConnectionsBlock } from "./block.ts"
import {
  AddConnection,
  CheckConnection,
  LoadIntegrations,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import { Integrations, Message, type Model } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }
const workspaceId = workspace.id

/** What `assignment` lets alice do, as her store resolves it from the workspace's roles. */
const grantsOf = (assignment: typeof aliceOwns) =>
  GrantResolver.grantsOf([assignment], (roleId) => roles.find(({ id }) => id === roleId))

const ownerGrants = grantsOf(aliceOwns)
const memberGrants = grantsOf(roleOf("assignment-3", member.id, BuiltinRoles.MemberId))

const models = connectionOf("connection-1", "Models")

/** The integrations loaded, as an owner of the workspace sees them, with no connection yet. */
const opened: Model = modifyFields(init(workspace.id, member.id).model, {
  integrations: () => Integrations.Loaded({ integrations: [testApi] }),
  grants: () => ownerGrants
})

/** The workspace's connection to the test API, read. */
const withModels: Model = modifyFields(opened, { connections: () => [{ connection: models, pending: false }] })

describe("the connections", () => {
  it("are added by an owner over HTTP to an integration the host installs, with a key only when it takes one", () => {
    scene(
      { update, view, subscriptions: ConnectionsBlock.subscriptions },
      given(opened),
      expect(role("heading", { name: "No connections yet", level: 2 })).toExist(),
      expect(text("Connections give the workspace models, tools, sandboxes, harnesses, and channels.")).toExist(),
      click(role("button", { name: "Add a connection" })),
      expect(role("region", { name: "Add a connection" })).toExist(),
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
          workspaceId,
          integration: testApi.id,
          name: "Test API",
          auth: "none",
          apiKey: "",
          settings: { url: "http://127.0.0.1:9999" }
        })
      ),
      expect(text("Adding…")).toExist(),
      expect(role("button", { name: "Add" })).toBeAbsent(),
      Command.resolve(AddConnection, Message.AddedConnection()),
      expect(role("form", { name: "Add a connection" })).toBeAbsent(),
      Subscription.emit(
        subscriptions.connections,
        Message.ReceivedConnections({ connections: withModels.connections })
      ),
      inside(
        role("list", { name: "Connections" }),
        expect(text("Models")).toExist(),
        expect(text("Test API")).toExist(),
        expect(text("Ready")).toExist()
      )
    )
  })

  it("offer adding from the header, until a form is open, and not before the integrations are", () => {
    scene(
      { update, view },
      given(modifyFields(opened, { integrations: () => Integrations.Loading() })),
      expect(text("Loading the integrations…")).toExist(),
      expect(role("button", { name: "Add a connection" })).toBeAbsent()
    )
    scene(
      { update, view },
      given(opened),
      inside(role("main", { name: "Connections" }), expect(role("button", { name: "Add a connection" })).toExist()),
      click(role("button", { name: "Add a connection" })),
      expect(role("button", { name: "Add a connection" })).toBeAbsent(),
      inside(role("form", { name: "Add a connection" }), click(role("button", { name: "Cancel" }))),
      expect(role("form", { name: "Add a connection" })).toBeAbsent(),
      expect(role("button", { name: "Add a connection" })).toExist()
    )
  })

  it("are renamed, checked, and have their key replaced and their settings shown, by an owner", () => {
    scene(
      { update, view },
      given(withModels),
      click(role("button", { name: "Check" })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: models.id })),
      expect(text("Checking…")).toExist(),
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
      click(role("button", { name: "Replace key" })),
      inside(
        role("form", { name: "Replace the connection's key" }),
        type(label("New API key"), "test-key"),
        click(role("button", { name: "Replace" }))
      ),
      Command.expectExact(ReplaceConnectionKey({ workspaceId, connectionId: models.id, apiKey: "test-key" })),
      expect(text("Replacing…")).toExist(),
      Command.resolve(ReplaceConnectionKey, Message.FailedReplaceKey({ error: "That key is not one." })),
      expect(text("That key is not one.")).toExist(),
      click(role("button", { name: "Cancel" })),
      click(role("button", { name: "Rename" })),
      inside(
        role("form", { name: "Rename the connection" }),
        type(label("Name"), "Local models"),
        click(role("button", { name: "Save" }))
      ),
      Command.expectExact(
        RenameConnection({ ...asMember, connectionId: models.id, name: "Local models", expectedName: "Models" })
      ),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      expect(text("This browser could not keep that. Try again.")).toExist(),
      click(role("button", { name: "Remove" })),
      Command.expectExact(RemoveConnection({ ...asMember, connectionId: models.id })),
      Command.resolve(RemoveConnection, Message.WroteAction()),
      expect(text("This browser could not keep that. Try again.")).toBeAbsent()
    )
  })

  it("show an ordinary member each connection and how ready it is, and none of the controls", () => {
    scene(
      { update, view, subscriptions: ConnectionsBlock.subscriptions },
      given(modifyFields(withModels, { grants: () => memberGrants })),
      inside(
        role("list", { name: "Connections" }),
        expect(text("Models")).toExist(),
        expect(text("Test API")).toExist(),
        expect(text("Ready")).toExist()
      ),
      expect(role("button", { name: "Add a connection" })).toBeAbsent(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Check" })).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent(),
      // Once the person is given the role that manages them, the controls appear.
      Subscription.emit(subscriptions.connections, Message.ReceivedGrants({ grants: ownerGrants })),
      expect(role("button", { name: "Add a connection" })).toExist(),
      expect(role("button", { name: "Check" })).toExist()
    )
  })

  it("say a connection is changing while its change is on its way, and offer no control for it", () => {
    scene(
      { update, view },
      given(modifyFields(withModels, { connections: () => [{ connection: models, pending: true }] })),
      expect(text(" · Sending…")).toExist(),
      expect(role("button", { name: "Rename" })).toBeAbsent(),
      expect(role("button", { name: "Remove" })).toBeAbsent()
    )
  })

  it("say how ready each connection is", () => {
    const unready = connectionOf("connection-2", "Gone")
    scene(
      { update, view },
      given(
        modifyFields(withModels, {
          connections: () => [
            { connection: { ...unready, readiness: { _tag: "Uninstalled" } }, pending: false },
            {
              connection: { ...models, readiness: { _tag: "Invalid", description: "It takes no key" } },
              pending: false
            }
          ]
        })
      ),
      inside(
        role("list", { name: "Connections" }),
        expect(text("Integration uninstalled")).toExist(),
        expect(text("Can't be used")).toExist(),
        expect(text("It takes no key")).toExist()
      )
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
      expect(role("button", { name: "Add a connection" })).toBeAbsent(),
      click(role("button", { name: "Try again" })),
      Command.expectExact(LoadIntegrations({ workspaceId })),
      expect(text("Loading the integrations…")).toExist(),
      Command.resolve(LoadIntegrations, Message.ReceivedIntegrations({ integrations: [testApi] })),
      expect(text("Loading the integrations…")).toBeAbsent(),
      expect(role("button", { name: "Add a connection" })).toExist()
    )
  })

  it("say why they could not be read", () => {
    scene(
      { update, view, subscriptions: ConnectionsBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.connections,
        Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist(),
      expect(role("alert")).toExist()
    )
  })
})
