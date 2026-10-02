import type { Layer, Redacted } from "effect";
import type { LanguageModel, Model } from "effect/ai";
import type { ConnectionImplementation } from "./implementation.ts";

/** What a connection supplies to reach its model provider: its settings and its credential. */
export interface Access {
  readonly settings: Readonly<Record<string, string>>;
  readonly credential: Redacted.Redacted<string> | undefined;
}

/** A model an agent selected, by the provider's own identifier. */
export interface Selection {
  readonly model: string;
}

/**
 * How much a model takes: the most tokens it reads in one request, its context window, and the
 * most it writes in one response, when known.
 */
export interface Limits {
  readonly contextTokens: number;
  readonly outputTokens: number | undefined;
}

/** Effect AI's model access: the model, and the names of its provider and model. */
export type Services = LanguageModel.LanguageModel | Model.ProviderName | Model.ModelName;

/**
 * The code behind an implementation with model inference support. It turns a connection's access
 * and an agent's selection into Effect AI model access, which a harness such as amends's own uses,
 * and says how much the selected model takes, so execution keeps a conversation within it. A
 * request the provider refuses, such as for a missing or wrong key, fails when it is made.
 */
export interface Implementation {
  readonly declaration: ConnectionImplementation.Declaration;
  readonly languageModel: (access: Access, selection: Selection) => Layer.Layer<Services>;
  readonly limits: (access: Access, selection: Selection) => Limits;
}

export * as ModelInference from "./model-inference.ts";
