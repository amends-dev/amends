import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
import { modifyFields } from "foldkit/struct"
import { connectionOf, integrationGiving, keylessConnection, membership, testApi } from "../../../test/fixtures.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import {
  checkOf,
  connectionItemsGiving,
  connectionsGiving,
  Form,
  Integrations,
  Message,
  OutMessage
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }
const workspaceId = workspace.id

const models = connectionOf("connection-1", "Models")
const others = connectionOf("connection-2", "Others")

const listed = init(workspace.id, member.id).model

/** The connections read, and the integrations loaded. */
const withModels = [
  message(Message.ReceivedIntegrations({ integrations: [testApi] })),
  message(Message.ReceivedConnections({ connections: [{ connection: models, pending: false }] }))
] as const

describe("the connections", () => {
  it("wait for the page to list the integrations, and keep what it informs them of or why it could not", () => {
    expect(init(workspace.id, member.id).commands ?? []).toEqual([])
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Failed({ error: "The host could not be reached. Try again." }))
      }),
      // Trying again shows they are loading and asks the page to list them again.
      message(Message.ClickedReloadIntegrations()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      Command.expectNone(),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(Message.ReceivedIntegrations({ integrations: [testApi] })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loaded({ integrations: [testApi] }))
      }),
      // Asking again once they are loaded asks nothing.
      message(Message.ClickedReloadIntegrations()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("add a connection over HTTP once the form is filled in, with its key when it takes one", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedIntegrations({ integrations: [testApi] })),
      message(Message.ClickedAdd()),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Adding", error: Option.some("Choose an integration.") }))
      }),
      message(Message.ChoseIntegration({ integrationId: testApi.id })),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ _tag: "Adding", name: "Test API", auth: "apiKey", settings: { url: "" }, error: Option.none() })
        )
      }),
      // A required setting left empty says so, and sends nothing.
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ error: Option.some("Base URL is required.") }))
      }),
      message(Message.ChangedSetting({ name: "url", value: "http://127.0.0.1:9999" })),
      message(Message.ChoseAuth({ auth: "none" })),
      message(Message.SubmittedForm()),
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
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ sending: true }))
      }),
      Command.resolve(AddConnection, Message.FailedAddConnection({ error: "A connection needs a name." })),
      model((model) => {
        expect(model.form).toMatchObject(
          Option.some({ sending: false, error: Option.some("A connection needs a name.") })
        )
      }),
      message(Message.TypedName({ name: "Production" })),
      message(Message.ChoseAuth({ auth: "apiKey" })),
      message(Message.TypedApiKey({ apiKey: "test-key" })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: testApi.id,
          name: "Production",
          auth: "apiKey",
          apiKey: "test-key",
          settings: { url: "http://127.0.0.1:9999" }
        })
      ),
      Command.resolve(AddConnection, Message.AddedConnection()),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      })
    )
  })

  it("rename, change the settings of, and remove a connection, each as an action from what the person saw", () => {
    story(
      update,
      given(listed),
      ...withModels,
      message(Message.ClickedRename({ connectionId: models.id })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Renaming", name: "Models" }))
      }),
      message(Message.TypedName({ name: "Local models" })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        RenameConnection({ ...asMember, connectionId: models.id, name: "Local models", expectedName: "Models" })
      ),
      Command.resolve(RenameConnection, Message.WroteAction()),
      message(Message.ClickedConfigure({ connectionId: models.id })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Configuring", settings: { url: "https://api.example" } }))
      }),
      // A required setting emptied says so, and writes nothing.
      message(Message.ChangedSetting({ name: "url", value: "" })),
      message(Message.SubmittedForm()),
      Command.expectNone(),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ error: Option.some("Base URL is required.") }))
      }),
      message(Message.ChangedSetting({ name: "url", value: "https://api.example/v2" })),
      message(Message.SubmittedForm()),
      Command.expectExact(
        ConfigureConnection({ ...asMember, connectionId: models.id, settings: { url: "https://api.example/v2" } })
      ),
      Command.resolve(ConfigureConnection, Message.WroteAction()),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      message(Message.ClickedRemove({ connectionId: models.id })),
      Command.expectExact(RemoveConnection({ ...asMember, connectionId: models.id })),
      Command.resolve(RemoveConnection, Message.WroteAction())
    )
  })

  it("replace a key over HTTP, and check a connection with its system", () => {
    story(
      update,
      given(listed),
      ...withModels,
      message(Message.ClickedReplaceKey({ connectionId: models.id })),
      message(Message.TypedApiKey({ apiKey: "test-key" })),
      message(Message.SubmittedForm()),
      Command.expectExact(ReplaceConnectionKey({ workspaceId, connectionId: models.id, apiKey: "test-key" })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "ReplacingKey", sending: true }))
      }),
      Command.resolve(ReplaceConnectionKey, Message.FailedReplaceKey({ error: "Enter the new key." })),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ sending: false, error: Option.some("Enter the new key.") }))
      }),
      message(Message.SubmittedForm()),
      Command.expectExact(ReplaceConnectionKey({ workspaceId, connectionId: models.id, apiKey: "test-key" })),
      Command.resolve(ReplaceConnectionKey, Message.ReplacedKey()),
      model((model) => {
        expect(model.form).toEqual(Option.none())
      }),
      message(Message.ClickedCheck({ connectionId: models.id })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: models.id })),
      model((model) => {
        expect(checkOf(model, models.id)).toMatchObject(Option.some({ _tag: "Checking" }))
      }),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: models.id, health: { status: "healthy" } })
      ),
      model((model) => {
        expect(checkOf(model, models.id)).toMatchObject(Option.some({ _tag: "Checked", health: { status: "healthy" } }))
      }),
      message(Message.ClickedCheck({ connectionId: models.id })),
      Command.resolve(
        CheckConnection,
        Message.FailedCheckConnection({ connectionId: models.id, error: "The host could not be reached. Try again." })
      ),
      model((model) => {
        expect(checkOf(model, models.id)).toMatchObject(
          Option.some({ _tag: "Failed", error: "The host could not be reached. Try again." })
        )
      })
    )
  })

  it("close a form about a connection that is gone, and forget its check", () => {
    story(
      update,
      given(listed),
      ...withModels,
      message(
        Message.ReceivedConnections({
          connections: [
            { connection: models, pending: false },
            { connection: others, pending: false }
          ]
        })
      ),
      message(Message.ClickedCheck({ connectionId: models.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: models.id, health: { status: "healthy" } })
      ),
      message(Message.ClickedCheck({ connectionId: others.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: others.id, health: { status: "healthy" } })
      ),
      message(Message.ClickedRename({ connectionId: models.id })),
      message(Message.ReceivedConnections({ connections: [{ connection: others, pending: false }] })),
      model((model) => {
        expect(model.form).toEqual(Option.none())
        expect(checkOf(model, models.id)).toEqual(Option.none())
        expect(checkOf(model, others.id)).toMatchObject(Option.some({ _tag: "Checked" }))
      }),
      // What a check found for a connection that is gone is passed over.
      message(Message.CheckedConnection({ connectionId: models.id, health: { status: "healthy" } })),
      model((model) => {
        expect(checkOf(model, models.id)).toEqual(Option.none())
      })
    )
  })

  it("send a form once while it is sending", () => {
    story(
      update,
      given(
        modifyFields(listed, {
          form: () =>
            Option.some(
              Form.Adding({
                integrationId: testApi.id,
                name: "Test API",
                auth: "none",
                apiKey: "",
                settings: { url: "http://127.0.0.1:9999" },
                sending: true,
                error: Option.none()
              })
            )
        })
      ),
      message(Message.ReceivedIntegrations({ integrations: [testApi] })),
      message(Message.SubmittedForm()),
      Command.expectNone()
    )
  })

  it("say why a read or a write failed, until a write is kept", () => {
    story(
      update,
      given(listed),
      ...withModels,
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      }),
      message(Message.ClickedRemove({ connectionId: models.id })),
      Command.resolve(
        RemoveConnection,
        Message.FailedWriteAction({ error: "This browser could not keep that. Try again." })
      ),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not keep that. Try again."))
      }),
      message(Message.ClickedRemove({ connectionId: models.id })),
      Command.resolve(RemoveConnection, Message.WroteAction()),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("name the connections whose integration gives a capability, once the integrations are listed", () => {
    const modelsIntegration = integrationGiving("test-models", "Test models", ["models"])
    const channelsIntegration = integrationGiving("test-channels", "Test channels", ["channels"])
    const providers = keylessConnection("models-1", "test-models", "Models")
    const chat = keylessConnection("channels-1", "test-channels", "Chat")
    story(
      update,
      given(listed),
      message(
        Message.ReceivedConnections({
          connections: [
            { connection: providers, pending: false },
            { connection: chat, pending: false }
          ]
        })
      ),
      model((model) => {
        expect(connectionsGiving(model, "models")).toEqual([])
      }),
      message(Message.ReceivedIntegrations({ integrations: [modelsIntegration, channelsIntegration] })),
      model((model) => {
        expect(connectionsGiving(model, "models")).toEqual([[providers.id, "Models"]])
        expect(connectionsGiving(model, "channels")).toEqual([[chat.id, "Chat"]])
        expect(connectionsGiving(model, "sandboxes")).toEqual([])
      })
    )
  })

  it("tell the connections that give a thing as they are read, with whether each is on its way", () => {
    const modelsIntegration = integrationGiving("test-models", "Test models", ["models", "tools"])
    const providers = keylessConnection("models-1", "test-models", "Models")
    story(
      update,
      given(listed),
      message(Message.ReceivedIntegrations({ integrations: [modelsIntegration] })),
      message(Message.ReceivedConnections({ connections: [{ connection: providers, pending: true }] })),
      model((model) => {
        expect(connectionItemsGiving(model, "models")).toEqual([{ connection: providers, pending: true }])
        expect(connectionItemsGiving(model, "tools")).toEqual([{ connection: providers, pending: true }])
        expect(connectionItemsGiving(model, "harnesses")).toEqual([])
      })
    )
  })

  it("are not read until the page has them, which the sidebar waits for before it says a section has none", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.isLoaded).toBe(false)
      }),
      message(Message.ReceivedConnections({ connections: [] })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
      })
    )
  })

  it("ask the page to show the connections when browsing, picking one, or adding, and the channels when browsing them", () => {
    story(
      update,
      given(listed),
      message(Message.ClickedBrowse()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      message(Message.ClickedConnection({ connectionId: models.id })),
      expectOutMessage(OutMessage.OpenedConnection({ connectionId: models.id })),
      message(Message.ClickedBrowseChannels()),
      expectOutMessage(OutMessage.RequestedChannels()),
      message(Message.ClickedAdd()),
      expectOutMessage(OutMessage.RequestedBrowse()),
      model((model) => {
        expect(model.form).toMatchObject(Option.some({ _tag: "Adding" }))
      })
    )
  })
})
