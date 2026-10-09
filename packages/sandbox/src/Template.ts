/**
 * A template prepares a new sandbox, for example by installing an agent and writing its files, so
 * that sandboxes created from it start ready. A provider that can snapshot runs `prepare` once
 * per `identity` and creates later sandboxes from that snapshot; the snapshot replaces the one of
 * an older version of the template, which has the same `name`. A provider that cannot snapshot
 * runs `prepare` on every create.
 *
 * @since 0.1.0
 */
import { type Effect, type PlatformError, Schema } from "effect";
import { isName, type SandboxServices } from "./Sandbox.ts";

/**
 * Names a template across its versions, as `Sandbox.isName` checks, in at most 30 characters, so
 * that a provider can name what it makes of each version after the template, with a prefix and a
 * digest, within the 63 characters of a name.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Name = Schema.String.check(isName, Schema.isMaxLength(30)).pipe(
  Schema.brand("TemplateName"),
);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Name = typeof Name.Type;

// TODO: Add a way to combine several templates into one, with an identity derived from theirs,
// once the harness prepares one sandbox for several agents.
/**
 * What prepares a sandbox, and how a provider tells versions of it apart. `E` is what `prepare`
 * fails with, which `create` fails with too.
 *
 * **Example** (A template that installs a tool)
 *
 * ```ts
 * import { Template } from "@amends/sandbox";
 * import { Effect } from "effect";
 * import { ChildProcess, ChildProcessSpawner } from "effect/process";
 *
 * const version = "3.6.2";
 *
 * const prettier: Template.Template = {
 *   name: Template.Name.make("prettier"),
 *   identity: `prettier-${version}`,
 *   prepare: Effect.gen(function* () {
 *     const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
 *     yield* spawner.exitCode(
 *       ChildProcess.make("npm", ["install", "--global", `prettier@${version}`]),
 *     );
 *   }),
 * };
 * ```
 *
 * @category models
 * @since 0.1.0
 */
export interface Template<E = PlatformError.PlatformError> {
  /**
   * Names the template across its versions, such as the agent it installs. Templates with the same
   * name and another identity are older or newer versions of it.
   */
  readonly name: Name;

  /**
   * Names what `prepare` produces: templates with the same identity must prepare the same
   * contents. A provider combines it with its own base image or runtime when it names a snapshot.
   */
  readonly identity: string;

  /**
   * Runs inside the new sandbox, where `FileSystem`, `Path`, and `ChildProcessSpawner` are the
   * sandbox's. Anything it needs from the host is read beforehand and captured.
   */
  readonly prepare: Effect.Effect<void, E, SandboxServices>;
}
