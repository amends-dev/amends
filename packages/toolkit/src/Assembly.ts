/**
 * An assembly is the one toolkit a model is given for a turn, made of the tools of every source a
 * workspace has. `toolkit` names each tool by its source and its own name, leaves out the tools a
 * decision blocks, and marks the tools a decision asks about before they run. The model calls a
 * tool by that name, and the call reaches the source that owns the tool by the name that source
 * knows it by.
 *
 * Which of a tool's decisions is the right one is the host's to say, from what it has stored. A
 * source's hints are its own claims, so no decision is made from them here.
 */
import { Array as Arr, Effect, Schema, Struct } from "effect";
import type { ToolDefinition } from "./ToolDefinition.ts";
import { toolkit as toolkitOfSource, type ToolSource } from "./ToolSource.ts";
import { NotFoundError, ToolSourceError } from "./ToolSourceError.ts";

/**
 * What the model may do with a tool: call it, call it once the person has approved the call, or not
 * be given it.
 */
export const Decision = Schema.Literals(["allow", "approve", "block"]);

export type Decision = typeof Decision.Type;

/** A source, with the definitions of the tools of it that the workspace has. */
export interface Member {
  readonly source: ToolSource;
  readonly definitions: ReadonlyArray<ToolDefinition>;
}

/** Tools the model would know by one name. */
export const Clash = Schema.Struct({
  name: Schema.String,

  /** Each tool by its source's name for it, which is how it is told from the others. */
  tools: Schema.Array(Schema.Struct({ source: Schema.String, tool: Schema.String })),
});

export interface Clash extends Schema.Schema.Type<typeof Clash> {}

/** More than one tool has the same name, so the model could not tell which one it calls. */
export class NameClash extends Schema.TaggedError<NameClash>("@amends/toolkit/Assembly/NameClash")(
  "NameClash",
  { clashes: Schema.NonEmptyArray(Clash) },
) {
  override get message(): string {
    return this.clashes
      .map(
        ({ name, tools }) =>
          `${tools.map(({ source, tool }) => `${source}: ${tool}`).join(" and ")} are all named ${name}`,
      )
      .join("; ");
  }
}

/**
 * The longest name that the model APIs of Anthropic and OpenAI accept for a tool. An agent that
 * prefixes the names it is given has less room, which a delivery to it has to account for.
 */
const maxNameLength = 64;

/**
 * Builds the toolkit of `members`. The tools of a member that `decide` blocks are left out, and the
 * names of the others must be distinct, or the assembly fails with the names that are not.
 *
 * Building contacts none of the sources.
 */
export const toolkit = Effect.fn("Assembly.toolkit")(function* (
  members: ReadonlyArray<Member>,
  decide: (source: string, definition: ToolDefinition) => Decision,
) {
  const offered = members
    .flatMap(({ source, definitions }) =>
      definitions.map((definition) => ({
        source,
        definition,
        decision: decide(source.name, definition),
        name: nameOf(source.name, definition.name),
      })),
    )
    .filter((tool) => tool.decision !== "block");

  const clashes = findClashes(
    offered.map(({ source, definition, name }) => ({
      name,
      source: source.name,
      tool: definition.name,
    })),
  );
  if (Arr.isReadonlyArrayNonEmpty(clashes)) return yield* new NameClash({ clashes });

  const ownerOf = new Map(offered.map((tool) => [tool.name, tool]));
  const definitions = offered.map(({ definition, name }) => Struct.assign(definition, { name }));
  const approved = new Set(
    offered.filter((tool) => tool.decision === "approve").map((tool) => tool.name),
  );
  const assembled: ToolSource = {
    name: "assembly",
    discover: Effect.succeed(definitions),
    call: (name, input) => {
      const owner = ownerOf.get(name);
      return owner === undefined
        ? Effect.fail(new ToolSourceError({ source: "assembly", reason: new NotFoundError({}) }))
        : owner.source.call(owner.definition.name, input);
    },
  };
  return yield* toolkitOfSource(assembled, definitions, {
    needsApproval: (definition) => approved.has(definition.name),
  });
});

/** The name the model knows a tool by: its source's, then its own, in the characters agents accept. */
const nameOf = (source: string, tool: string) =>
  `${source}__${tool}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, maxNameLength);

/** The tools that share a name, for each name that more than one tool has, in the order met. */
const findClashes = (
  tools: ReadonlyArray<{ readonly name: string; readonly source: string; readonly tool: string }>,
): ReadonlyArray<Clash> => {
  const byName = new Map<string, Array<{ readonly source: string; readonly tool: string }>>();
  for (const { name, source, tool } of tools) {
    byName.set(name, [...(byName.get(name) ?? []), { source, tool }]);
  }
  return [...byName]
    .filter(([, sharing]) => sharing.length > 1)
    .map(([name, sharing]) => ({ name, tools: sharing }));
};
