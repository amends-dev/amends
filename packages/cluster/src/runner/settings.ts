/** How a runner is set up: the code it runs turns with, and how long it waits for what. */
import type { ModelInference } from "@amends/connection/model-inference";
import type { Harness } from "@amends/harness";
import { Duration } from "effect";
import type { LanguageModel, Model } from "effect/unstable/ai";

/** The model access an in-process harness takes: Effect AI's, from a connection's implementation. */
export type ModelAccess = LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName;

export interface Options {
  /** The harnesses this host runs in process, found by name. */
  readonly harnesses: ReadonlyArray<Harness.Interface<ModelAccess>>;
  /** The code behind the model connections this host installs, found by implementation. */
  readonly models: ReadonlyArray<ModelInference.Implementation>;
  /** How often a running turn looks for a request to stop: every second by default. */
  readonly checkInterval?: Duration.Input | undefined;
  /**
   * How many times a turn runs again when it stopped short without getting further, whether by a
   * failure worth retrying or by its run dying: three by default. Its log counts the attempts, so
   * a restart does not reset them.
   */
  readonly retries?: number | undefined;
  /** How long a turn waits for input its agent is still accepting: a minute by default. */
  readonly inputWait?: Duration.Input | undefined;
  /**
   * How long a turn waits on its model with nothing reported before the run counts as interrupted,
   * which it recovers from as from any interruption worth retrying: five minutes by default. Time
   * a tool call the harness started spends running does not count.
   */
  readonly idleTimeout?: Duration.Input | undefined;
  /** How much of its model's context a turn may use before a checkpoint, and what one keeps. */
  readonly context?: Partial<ContextPolicy> | undefined;
}

/**
 * How a turn's conversation is kept within its model's context window. A turn may use `share` of
 * the window, less the room its model may need to write (at most `outputReserve` tokens), and at
 * most `cap` tokens, which bounds what one request costs however large the window; a checkpoint
 * then keeps `keep` of that budget verbatim and summarizes the rest. When the context proves full
 * anyway, as when a provider counts more tokens than four characters make, each checkpoint for it
 * keeps half as much, up to `shrinks` times before the turn fails.
 */
export interface ContextPolicy {
  readonly share: number;
  readonly outputReserve: number;
  readonly cap: number;
  readonly keep: number;
  readonly shrinks: number;
}

/** The context policy a runner applies unless it is given another. */
export const defaultContextPolicy: ContextPolicy = {
  share: 0.8,
  outputReserve: 32_000,
  cap: 200_000,
  keep: 0.4,
  shrinks: 3,
};

/** A runner's options with their defaults applied, and its harnesses and models found by name. */
export interface Settings {
  readonly harnesses: ReadonlyMap<string, Harness.Interface<ModelAccess>>;
  readonly models: ReadonlyMap<string, ModelInference.Implementation>;
  readonly checkInterval: Duration.Duration;
  readonly retries: number;
  readonly inputWait: Duration.Duration;
  readonly idleTimeout: Duration.Duration;
  readonly policy: ContextPolicy;
}

/** A runner's settings from its options, with the defaults applied. */
export const fromOptions = (options: Options): Settings => ({
  harnesses: new Map(options.harnesses.map((harness) => [harness.name as string, harness])),
  models: new Map(options.models.map((model) => [model.declaration.id as string, model])),
  checkInterval: Duration.fromInputUnsafe(options.checkInterval ?? "1 second"),
  retries: options.retries ?? 3,
  inputWait: Duration.fromInputUnsafe(options.inputWait ?? "1 minute"),
  idleTimeout: Duration.fromInputUnsafe(options.idleTimeout ?? "5 minutes"),
  policy: { ...defaultContextPolicy, ...options.context },
});

/** A duration in words, as the turn's readers see it in an interruption. */
export const durationInWords = (duration: Duration.Duration) => {
  const seconds = Math.round(Duration.toSeconds(duration));
  return seconds % 60 === 0
    ? `${seconds / 60} minute${seconds === 60 ? "" : "s"}`
    : `${seconds} second${seconds === 1 ? "" : "s"}`;
};

export * as RunnerSettings from "./settings.ts";
