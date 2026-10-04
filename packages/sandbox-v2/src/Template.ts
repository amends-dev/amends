/**
 * A template prepares a new sandbox, for example by installing an agent and writing its files, so
 * that sandboxes created from it start ready. A provider that can snapshot runs `prepare` once per
 * `identity` and creates later sandboxes from that snapshot, replacing the snapshot of an older
 * version of the template, which has the same `name`; a provider that cannot runs it on every
 * create.
 */
import type { Effect, PlatformError } from "effect";
import type { SandboxServices } from "./Sandbox.ts";

// TODO: Add a way to combine several templates into one, with an identity derived from theirs,
// once the harness prepares one sandbox for several agents.
export interface Template<E = PlatformError.PlatformError> {
  /**
   * Names the template across its versions, such as the agent it installs. Templates with the same
   * name and another identity are older or newer versions of it.
   */
  readonly name: string;

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
