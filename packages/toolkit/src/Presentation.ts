/**
 * What the ways to present a toolkit to a model share, such as `ToolSearch` and `CodeMode`: each
 * takes the toolkit a host assembled, which is the model's to use, and gives another, whose tools
 * the model calls to reach the first. A tool of the presented toolkit runs as it does when a model
 * calls it directly, so what it checks, what it fails with, and whether it needs approval stay as
 * they are.
 *
 * @since 0.1.0
 */

import * as AiError from "effect/ai/AiError"
import * as Tool from "effect/ai/Tool"
import type * as Toolkit from "effect/ai/Toolkit"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as ToolSource from "./ToolSource.ts"

/**
 * Whether `presented` has a tool named `name`, with the name as the type of one.
 *
 * @category predicates
 * @since 0.1.0
 */
export const hasTool = <Tools extends Record<string, Tool.Any>>(
  presented: Toolkit.WithHandler<Tools>,
  name: string
): name is Extract<keyof Tools, string> => Object.hasOwn(presented.tools, name)

/**
 * The tool's parameters, as a JSON Schema with an object root, as a model is shown them. A tool
 * whose parameters are not an object is shown an object with no properties.
 *
 * @category getters
 * @since 0.1.0
 */
export const inputSchemaOf = (tool: Tool.Any): Schema.JsonObject =>
  Option.getOrElse(Schema.decodeUnknownOption(Schema.JsonObject)(Tool.getJsonSchema(tool)), () => ({
    type: "object"
  }))

/**
 * What the model reads of a failure that no tool gave, such as a name that is no tool's. It is not
 * worth trying again.
 *
 * @category constructors
 * @since 0.1.0
 */
export const failure = (code: string, message: string): ToolSource.Failure => ({
  code,
  message,
  retryable: false
})

/**
 * Runs the tool of `presented` named `name` with `input`, and returns its result as JSON. What the
 * tool fails with, as its handler or its parameters, fails as a `Failure`, a result the model reads.
 *
 * @category running
 * @since 0.1.0
 */
export const call = <Tools extends Record<string, Tool.Any>>(
  presented: Toolkit.WithHandler<Tools>,
  name: Extract<keyof Tools, string>,
  input: Schema.JsonObject
) =>
  Effect.gen(function* () {
    // The presented toolkit checks the input against the tool's parameters.
    const results = yield* presented.handle(name, input as Tool.ParametersEncoded<Tools[typeof name]>)
    // The results before the last are preliminary.
    const last = yield* Stream.runLast(results)
    if (Option.isNone(last)) {
      return yield* Effect.fail(failure("CallFailed", `${name} gave no result`))
    }
    const { encodedResult, isFailure } = last.value
    if (isFailure) return yield* Effect.fail(failureOfResult(encodedResult))
    // A tool that gives nothing gives `null`, as JSON has no nothing.
    return yield* Schema.decodeUnknownEffect(Schema.Json)(encodedResult ?? null)
  }).pipe(Effect.mapError(failureOfError))

/** What the model reads of a failed result of a tool: its own `Failure`, or else its text. */
const failureOfResult = (encoded: unknown): ToolSource.Failure =>
  Option.getOrElse(Schema.decodeUnknownOption(ToolSource.Failure)(encoded), () =>
    failure("CallFailed", typeof encoded === "string" ? encoded : (JSON.stringify(encoded) ?? ""))
  )

const failureOfError = (error: unknown): ToolSource.Failure =>
  Option.getOrElse(Schema.decodeUnknownOption(ToolSource.Failure)(error), () =>
    failure("CallFailed", messageOf(error) ?? "The tool failed")
  )

const messageOf = (error: unknown) => {
  if (typeof error === "string") return error
  return typeof error === "object" && error !== null && "message" in error ? String(error.message) : undefined
}

/** What a toolkit fails with for a name it has no tool of. */
const notFound = (name: string, available: ReadonlyArray<string>) =>
  AiError.make({
    module: "Toolkit",
    method: `${name}.handle`,
    reason: new AiError.ToolNotFoundError({ toolName: name, availableTools: [...available] })
  })

/**
 * A toolkit of the tools of `presented` that `names` names, which run as they do in `presented`.
 *
 * @category constructors
 * @since 0.1.0
 */
export const restrict = <Tools extends Record<string, Tool.Any>>(
  presented: Toolkit.WithHandler<Tools>,
  names: ReadonlySet<string>
): Toolkit.WithHandler<Record<string, Tool.Any>> => ({
  tools: Object.fromEntries(Object.entries(presented.tools).filter(([name]) => names.has(name))),
  handle: (name, params, toolCallId, options) =>
    hasTool(presented, name) && names.has(name)
      ? // The tool checks its own parameters, whatever they are.
        presented.handle(name, params as Tool.ParametersEncoded<Tools[typeof name]>, toolCallId, options)
      : Effect.fail(notFound(name, [...names]))
})

/**
 * A toolkit of the tools of both, whose names are the tools' own, which run as they do in the
 * toolkit they come from. A name that both have is `first`'s.
 *
 * @category constructors
 * @since 0.1.0
 */
export const merge = <First extends Record<string, Tool.Any>, Second extends Record<string, Tool.Any>>(
  first: Toolkit.WithHandler<First>,
  second: Toolkit.WithHandler<Second>
): Toolkit.WithHandler<Record<string, Tool.Any>> => ({
  tools: { ...second.tools, ...first.tools },
  handle: (name, params, toolCallId, options) => {
    // Each toolkit checks the parameters of its own tools.
    if (hasTool(first, name)) {
      return first.handle(name, params as Tool.ParametersEncoded<First[typeof name]>, toolCallId, options)
    }
    if (hasTool(second, name)) {
      return second.handle(name, params as Tool.ParametersEncoded<Second[typeof name]>, toolCallId, options)
    }
    return Effect.fail(notFound(name, Object.keys({ ...second.tools, ...first.tools })))
  }
})
