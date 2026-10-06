# Connections v2

What amends connects to, and what it knows of the models it can run. It is being built beside
`packages/connection`, which it will replace. It depends on Effect, and on the contracts of the
[harness](../harness-v2), [sandboxes](../sandbox-v2), and the [toolkit](../toolkit), whose
`Harness`, `ModelEndpoint`, `SandboxProvider`, and `ToolSource` are what a connection gives.

## Integrations, connections, and credentials

An **integration** is a kind of system amends connects to, declared in code with `Integration.make`:
its `settings`, a schema of what a connection to it gives besides a secret, such as a URL; the
`auth` methods a connection can authenticate by, `apiKey` or `none` until OAuth comes; what a
connection gives, of `harnesses` that run agents, `models` an agent runs on, `sandboxes` it works
in, and `tools` it calls; and a `check`. The code of an integration is given a connection with its
settings decoded and its key, which it always has when a connection to it authenticates only with a
key.

A **connection** is a workspace's link to one integration: its id, the integration's id, a name, its
settings as JSON, and the auth method it uses. Its **credential**, the API key, is kept apart, so that
a connection can be shown and stored without it. An integration's operations take the two as they are
stored: `harness` gives a harness that runs its agent on the models it is given, as `Agent.Options`,
`modelEndpoint` how an agent reaches a model, `sandboxProvider` a sandbox provider that works until
its scope closes, `toolSource` a tool source, and `check` its `Health`. They fail with
`ConnectionError`, which names the integration and holds a reason: `NotFoundError`,
`InvalidConnectionError` for settings, an auth method, or a missing key the integration does not
take, `UnsupportedError` for what it does not give, and `UnavailableError`, which may pass.

`Integrations` holds those a host installs, for a connection to find its own by id: the built-in
ones it chooses, and those of the sandbox providers it runs, which their adapters declare, such as
`DaytonaSandboxProvider.integration`. What only the host decides, such as where a local sandbox
keeps its files, it gives an integration when it installs it; a connection's settings are what a
workspace gives.

## Models

The model catalog is what amends knows of the models it can run: for each provider, the models
reached through Anthropic Messages, OpenAI Responses, or Chat Completions, with where each is served,
its limits, modalities, tool support, reasoning controls, and cost. It is `src/snapshot.ts`, which
`bun run update-models` writes from [models.dev](https://models.dev), failing when a field the
catalog keeps changes shape; `ModelCatalog.layer` reads it.

`ModelIntegrations.catalogProviders` is an integration for each provider in the catalog. A
connection authenticates with an API key and gives the settings the provider's URLs name, such as a
Cloudflare account's id. Its endpoint for a model is where the catalog says the model is served, with
the effort and output limit an agent asks for, which the model must offer.
`ModelIntegrations.openAiCompatible` reaches any model of an API that serves Chat Completions at the
URL a connection gives, with a key or none, as a provider of the connection's own.

Checking a connection to a provider asks it for a response to a request it must refuse, as it has no
messages, naming the model it released last of those it released fully. A provider that reads the
key first refuses a wrong key, and otherwise says the request is incomplete, which costs nothing. A
few, such as NVIDIA's and Fireworks', look at the request first, so a wrong key there shows only when
a turn runs. Checking an OpenAI-compatible API asks it which models it has.

## Tools

`ToolIntegrations.mcp` reaches an MCP server over Streamable HTTP at the URL a connection gives, and
`ToolIntegrations.openApi` an HTTP API whose OpenAPI document, as JSON, is at the URL a connection
gives, sending requests to the base URL it gives or to the first server the document names. A
connection authenticates with an API key, in the `Authorization` header as a bearer token or as it is
in a header the connection names, or with none. The key goes on the requests to the server or the API
alone; an API's document is read without it. Checking an MCP server asks it which tools it has.
Checking an API reads its document, which the key plays no part in, so a wrong key there shows when a
tool first runs.

## Testing

`test/models-dev.test.ts` and `test/model-catalog.test.ts` check how models.dev's data becomes the
catalog, and the snapshot. `test/integration.test.ts` checks what `Integration.make` does with a
connection, and `Integrations`. `test/model-integrations.test.ts` reaches the catalog's models and checks
connections through a client that answers as a provider would, and `test/tool-integrations.test.ts`
reaches an MCP server in the test's process and an HTTP API with its document. `test/live.test.ts`
checks connections to real providers with `AMENDS_TEST_MODELS=1`, as
[Testing](../../docs/testing.md) says.
