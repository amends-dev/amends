/**
 * Search is a way to show a model a large set of tools, or one that changes from turn to turn. The
 * model is given two tools in place of one for each: `tool_search`, which finds tools by what they
 * do and tells their parameters, and `tool_call`, which runs one of them by its name. What the model
 * is shown stays the same however many tools there are, and costs the tokens of what it searched
 * for, not of the whole set.
 *
 * `toolkit` makes that toolkit from the one it presents, which is the model's to search and call.
 * Running a tool is the presented toolkit's own, so what it decides stays decided: a tool that needs
 * approval needs it when the model calls it through `tool_call`, and a call fails as it fails there.
 */
import { Effect, Option, Schema, Stream } from "effect";
import { Tool, Toolkit } from "effect/ai";
import { Failure } from "./ToolSource.ts";

/** The most tools a search may return, which a call can ask for fewer of. */
const maxLimit = 20;

const defaultLimit = 5;

/** What `tool_search` tells of a tool: what the model needs to call it. */
const Found = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),

  /** The tool's parameters, as a JSON Schema. */
  inputSchema: Schema.Json,
});

const SearchResult = Schema.Struct({
  /** The tools that match best, best first. */
  tools: Schema.Array(Found),

  /** How many tools match, which is more than `tools` holds when the search was cut short. */
  matched: Schema.Int,

  /** How many tools there are to search. */
  available: Schema.Int,
});

/** The tools of a presented toolkit, as the search reads them. */
interface Entry {
  readonly found: typeof Found.Type;
  readonly nameWords: ReadonlyArray<string>;
  readonly descriptionWords: ReadonlyArray<string>;
}

/** Options of `toolkit`. */
export interface Options {
  /** How many tools a search returns when it does not ask for a number. Five by default. */
  readonly limit?: number;
}

/**
 * Makes the toolkit of `tool_search` and `tool_call` over `presented`. Building contacts nothing.
 */
export const toolkit = Effect.fn("ToolSearch.toolkit")(function* <
  Tools extends Record<string, Tool.Any>,
>(presented: Toolkit.WithHandler<Tools>, options?: Options) {
  const services = yield* Effect.context<Tool.HandlerServices<Tools[keyof Tools]>>();
  const entries = Object.values<Tool.Any>(presented.tools).map(entryOf);
  const limit = options?.limit ?? defaultLimit;

  const Search = Tool.make("tool_search", {
    description:
      `Searches the ${entries.length} tools you can run with tool_call, by what they do. ` +
      "Tells the name, description, and input schema of the tools that match best. " +
      "Search again with other words when nothing fits.",
    parameters: Schema.Struct({
      query: Schema.String.annotate({ description: "Words for what the tool should do" }),
      limit: Schema.optional(
        Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: maxLimit })).annotate({
          description: `How many tools to return, at most ${maxLimit}. ${limit} by default`,
        }),
      ),
    }),
    success: SearchResult,
    failure: Failure,
    // A model that searches wrongly is told so, and tries again.
    failureMode: "return",
  });

  const Call = Tool.make("tool_call", {
    description:
      "Runs a tool that tool_search found, by its name, with an input that matches the input " +
      "schema tool_search gave. Search for a tool before you call it.",
    parameters: Schema.Struct({
      name: Schema.String.annotate({ description: "The name of the tool, as tool_search gave it" }),
      input: Schema.JsonObject.annotate({ description: "The tool's input" }),
    }),
    success: Schema.Json,
    failure: Failure,
    failureMode: "return",
    needsApproval: ({ name, input }, context) => {
      const needsApproval = presented.tools[name]?.needsApproval;
      return typeof needsApproval === "function"
        ? needsApproval(input, context)
        : needsApproval === true;
    },
  });

  const SearchToolkit = Toolkit.make(Search, Call);
  const handlers = SearchToolkit.toLayer({
    tool_search: ({ query, limit: asked }) =>
      Effect.sync(() => {
        const matches = search(entries, query);
        return {
          tools: matches.slice(0, asked ?? limit).map((entry) => entry.found),
          matched: matches.length,
          available: entries.length,
        };
      }),

    tool_call: ({ name, input }) => callOf(presented, name, input).pipe(Effect.provide(services)),
  });
  return yield* SearchToolkit.pipe(Effect.provide(handlers));
});

/** The tool of `presented` named `name`, run with `input`, whose result is the call's. */
const callOf = <Tools extends Record<string, Tool.Any>>(
  presented: Toolkit.WithHandler<Tools>,
  name: string,
  input: Schema.JsonObject,
) =>
  Effect.gen(function* () {
    if (!isNameOf(presented, name)) {
      return yield* Effect.fail(
        failure("NotFoundError", `There is no tool named ${name}. Search for one with tool_search`),
      );
    }
    // The presented toolkit checks the input against the tool's parameters.
    const results = yield* presented.handle(
      name,
      input as Tool.ParametersEncoded<Tools[typeof name]>,
    );
    // The results before the last are preliminary.
    const last = yield* Stream.runLast(results);
    if (Option.isNone(last))
      return yield* Effect.fail(failure("CallFailed", `${name} gave no result`));
    const { encodedResult, isFailure } = last.value;
    if (isFailure) return yield* Effect.fail(failureOfResult(encodedResult));
    return yield* Schema.decodeUnknownEffect(Schema.Json)(encodedResult);
  }).pipe(
    // What a tool of the presented toolkit failed with, as its handler or its parameters, is a
    // result the model reads, as a failure of the tool is when the model calls it directly.
    Effect.mapError(failureOfError),
  );

/** Whether `presented` has a tool named `name`, with the name as the type of one. */
const isNameOf = <Tools extends Record<string, Tool.Any>>(
  presented: Toolkit.WithHandler<Tools>,
  name: string,
): name is Extract<keyof Tools, string> => Object.hasOwn(presented.tools, name);

const failure = (code: string, message: string): Failure => ({
  code,
  message,
  retryable: false,
});

/** What the model reads of a failed result of a tool: its own `Failure`, or else its text. */
const failureOfResult = (encoded: unknown): Failure =>
  Option.getOrElse(Schema.decodeUnknownOption(Failure)(encoded), () =>
    failure("CallFailed", typeof encoded === "string" ? encoded : (JSON.stringify(encoded) ?? "")),
  );

const failureOfError = (error: unknown): Failure =>
  Option.getOrElse(Schema.decodeUnknownOption(Failure)(error), () =>
    failure("CallFailed", messageOf(error) ?? "The tool failed"),
  );

const messageOf = (error: unknown) => {
  if (typeof error === "string") return error;
  return typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : undefined;
};

/** What a search reads of a tool. */
const entryOf = (tool: Tool.Any): Entry => {
  const description = Tool.getDescription(tool);
  return {
    found: {
      name: tool.name,
      ...(description === undefined ? {} : { description }),
      inputSchema: Option.getOrElse(
        Schema.decodeUnknownOption(Schema.JsonObject)(Tool.getJsonSchema(tool)),
        () => ({ type: "object" }),
      ),
    },
    nameWords: wordsOf(tool.name),
    descriptionWords: wordsOf(description ?? ""),
  };
};

/**
 * The words of a text, in lower case: runs of letters and digits, which a change of case within
 * letters splits, so that `createIssue`, `create_issue` and `create-issue` have the same words.
 */
const wordsOf = (text: string): ReadonlyArray<string> =>
  text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== "");

/**
 * The tools that match `query`, best first, and the tools in order when it has no words. A word of
 * the query scores for a word of the tool's name that is the same, or that it begins, and for one of
 * its description; the name counts for most. A tool that scores nothing does not match.
 */
const search = (entries: ReadonlyArray<Entry>, query: string): ReadonlyArray<Entry> => {
  const queryWords = wordsOf(query);
  if (queryWords.length === 0) return entries;
  return entries
    .map((entry) => ({ entry, score: scoreOf(entry, queryWords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ entry }) => entry);
};

const scoreOf = (entry: Entry, queryWords: ReadonlyArray<string>) =>
  queryWords.reduce(
    (score, word) =>
      score +
      (entry.nameWords.includes(word)
        ? 4
        : entry.nameWords.some((it) => it.startsWith(word))
          ? 2
          : 0) +
      (entry.descriptionWords.includes(word) ? 1 : 0),
    0,
  );
