import { Context } from "effect";
import type { Layer, Redacted } from "effect";
import type { LanguageModel, Model } from "effect/ai";
import type { ConnectionImplementation } from "./implementation.ts";

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
 * The model a session calls itself, for a harness that speaks its provider's interface rather than
 * through Effect AI, such as an agent running in a sandbox: the interface the connection declares,
 * its API's base URL when the connection sets one, its key, the model, and how much it takes.
 */
export class Endpoint extends Context.Service<
  Endpoint,
  {
    readonly interface: string;
    readonly baseUrl: string | undefined;
    readonly apiKey: Redacted.Redacted<string> | undefined;
    readonly model: string;
    readonly limits: Limits;
  }
>()("@amends/connection/ModelInference/Endpoint") {}

/**
 * The code behind an implementation with model inference support. It turns a connection's access
 * and an agent's selection into Effect AI model access, which a harness such as amends's own uses,
 * or into the endpoint a harness that speaks the provider's interface calls itself, and says how
 * much the selected model takes, so execution keeps a conversation within it. A request the
 * provider refuses, such as for a missing or wrong key, fails when it is made.
 */
export interface Implementation {
  readonly declaration: ConnectionImplementation.Declaration;
  readonly languageModel: (
    access: ConnectionImplementation.Access,
    selection: Selection,
  ) => Layer.Layer<Services>;
  readonly endpoint: (
    access: ConnectionImplementation.Access,
    selection: Selection,
  ) => Endpoint["Service"];
  readonly limits: (access: ConnectionImplementation.Access, selection: Selection) => Limits;
}

export * as ModelInference from "./model-inference.ts";
