/**
 * What amends connects to, and what it knows of the models it can run. An integration is a kind of
 * system a host installs, such as a model provider, an MCP server, a sandbox platform, or an agent;
 * a connection is a workspace's link to one, with its settings and its key. `Integration` declares
 * integrations and what each gives a workspace's connections: harnesses, models, sandboxes, tools,
 * and channels. `Integrations` holds those a host installs, `ModelIntegrations` and
 * `ToolIntegrations` are the built-in ones, and `ModelCatalog` is the catalog of models that
 * `ModelsDev` reads from models.dev.
 *
 * @since 0.1.0
 */

/**
 * A workspace's link to one integration, the credential kept apart from it, what checking it
 * finds, and the error every integration fails with.
 *
 * @since 0.1.0
 */
export * as Connection from "./Connection.ts";

/**
 * How an integration is declared, and the operations it gives on a connection and its credential.
 *
 * @since 0.1.0
 */
export * as Integration from "./Integration.ts";

/**
 * The integrations a host installs, among which a connection finds its own by id.
 *
 * @since 0.1.0
 */
export * as Integrations from "./Integrations.ts";

/**
 * What amends knows of the models it can run: the providers, their models, and how to reach each.
 *
 * @since 0.1.0
 */
export * as ModelCatalog from "./ModelCatalog.ts";

/**
 * The integrations of model providers: one for each provider in the catalog, and one for any
 * OpenAI-compatible API.
 *
 * @since 0.1.0
 */
export * as ModelIntegrations from "./ModelIntegrations.ts";

/**
 * How models.dev's data becomes the model catalog.
 *
 * @since 0.1.0
 */
export * as ModelsDev from "./ModelsDev.ts";

/**
 * The integrations of tool sources: MCP servers, and HTTP APIs with an OpenAPI document.
 *
 * @since 0.1.0
 */
export * as ToolIntegrations from "./ToolIntegrations.ts";
