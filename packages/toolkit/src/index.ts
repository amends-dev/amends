/**
 * Tools from every kind of source, such as an MCP server or an HTTP API, in one shape, built into
 * the toolkit a model or a harness session is given. `ToolSource` is what every kind of source
 * implements, `Mcp` and `Http` are the kinds there are, and `OpenApi` reads an API's operations;
 * `Assembly` builds the one toolkit of a turn from a workspace's sources; and `ToolSearch` and
 * `CodeMode` present that toolkit to a model in fewer tools. No credential enters the package: a
 * source is made over an HTTP client that already carries them. The conformance suites every
 * source runs are in `@amends-dev/toolkit/conformance`.
 *
 * @since 0.1.0
 */

/**
 * The one toolkit of a turn, made of the tools of every source a workspace has, with the host's
 * decision for each.
 *
 * @since 0.1.0
 */
export * as Assembly from "./Assembly.ts";

/**
 * A toolkit presented as one tool, `execute`, which runs code the model writes that calls the
 * tools as functions.
 *
 * @since 0.1.0
 */
export * as CodeMode from "./code/index.ts";

/**
 * An HTTP API as a tool source, each tool one request, kept as data a catalog stores.
 *
 * @since 0.1.0
 */
export * as Http from "./Http.ts";

/**
 * An MCP server as a tool source, reached over Streamable HTTP.
 *
 * @since 0.1.0
 */
export * as Mcp from "./mcp/index.ts";

/**
 * The operations of an HTTP API, read from its OpenAPI 3 document, for `Http` to run.
 *
 * @since 0.1.0
 */
export * as OpenApi from "./OpenApi.ts";

/**
 * What the ways to present a toolkit to a model share: running its tools, and making toolkits of
 * some of them.
 *
 * @since 0.1.0
 */
export * as Presentation from "./Presentation.ts";

/**
 * A tool as data, which a source reports and a catalog stores as JSON.
 *
 * @since 0.1.0
 */
export * as ToolDefinition from "./ToolDefinition.ts";

/**
 * A toolkit presented as two tools: one that finds tools by what they do, and one that runs them.
 *
 * @since 0.1.0
 */
export * as ToolSearch from "./ToolSearch.ts";

/**
 * What every kind of tool source implements, and the toolkit a model calls, built from one.
 *
 * @since 0.1.0
 */
export * as ToolSource from "./ToolSource.ts";

/**
 * The error every tool source fails with, and its reasons.
 *
 * @since 0.1.0
 */
export * as ToolSourceError from "./ToolSourceError.ts";
