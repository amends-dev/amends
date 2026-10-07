/**
 * A sandbox provider creates sandboxes on one platform, such as this machine or Daytona, and
 * resumes sandboxes it created before. The settings a platform needs, such as credentials or a
 * root directory, go to the provider's layer, so code that creates sandboxes does not depend on
 * which provider it uses.
 */
import { Context, type Effect } from "effect";
import type { NetworkPolicy, Port } from "./Network.ts";
import type { Sandbox, SandboxId } from "./Sandbox.ts";
import type { SandboxError } from "./SandboxError.ts";
import type { Template } from "./Template.ts";

// TODO: Add per-create provider options, such as a different image for each sandbox, once a caller
// needs them. Until then, a second provider layer with different settings covers it.
export interface CreateOptions<E> {
  /**
   * Names the new sandbox. Creating never looks a sandbox up, so an id already in use fails with
   * `AlreadyExistsError`. When omitted, the provider picks one.
   */
  readonly id?: SandboxId;

  /** The ports to expose; `Sandbox.endpoint` reaches only these. */
  readonly ports?: ReadonlyArray<Port>;

  /** Prepares the sandbox before `create` returns it. */
  readonly template?: Template<E>;

  /**
   * The outbound network policy the sandbox starts with, `AllowAll` when omitted, so that nothing
   * run in it reaches further. The template prepares the sandbox before the policy applies, as
   * preparing may download what it installs. Fails with `UnsupportedError`, creating nothing, when
   * the provider cannot enforce the policy, as `Sandbox.setNetworkPolicy` does.
   */
  readonly networkPolicy?: NetworkPolicy;
}

export class SandboxProvider extends Context.Service<
  SandboxProvider,
  {
    // TODO: Add a scoped create that destroys the sandbox when its scope closes, once tests or the
    // harness need one.
    /**
     * Creates and starts a sandbox, which runs until `stop` or `destroy`. A create that fails,
     * including when its template fails or it is interrupted, first removes what it made, so no
     * sandbox is left behind.
     */
    readonly create: <E = never>(
      options?: CreateOptions<E>,
    ) => Effect.Effect<Sandbox["Service"], SandboxError | E>;

    /**
     * Reattaches to a sandbox this provider created, starting it again if it was stopped. It never
     * creates one: an unknown or destroyed id fails with `NotFoundError`.
     */
    readonly resume: (id: SandboxId) => Effect.Effect<Sandbox["Service"], SandboxError>;
  }
>()("@amends/sandbox/SandboxProvider") {}
