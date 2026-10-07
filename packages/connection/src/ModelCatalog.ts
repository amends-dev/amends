/**
 * The model catalog is what amends knows about the models it can run: the model providers, the
 * models each serves, how to reach each model, and what each can do and costs. It lists only models
 * reached through a protocol amends speaks, so that any model in it can run.
 *
 * The catalog comes from models.dev, an open database of providers and models. This package ships a
 * snapshot of it, `snapshot.ts`, which `bun run update-models` writes from models.dev's current
 * data, as `ModelsDev` reads it. A model released after the snapshot was taken is missing until then.
 *
 * A catalog holds no credentials. A connection to a provider holds those, and gives the settings
 * that the provider's URLs name.
 */
import { ModelEndpoint } from "@amends/harness";
import { Context, Effect, Layer, Schema } from "effect";
import { snapshot } from "./snapshot.ts";

/** A kind of content a model takes or gives. */
export const Modality = Schema.Literals(["text", "image", "audio", "video", "pdf"]);

export type Modality = typeof Modality.Type;

/**
 * How a request controls a model's reasoning. A model that reasons and has none of these controls
 * reasons as its provider decides.
 */
export const Reasoning = Schema.Struct({
  /** A request can turn the model's reasoning on and off. */
  toggle: Schema.Boolean,

  /** The levels of effort a request can ask for, from least to most. */
  efforts: Schema.Array(ModelEndpoint.Effort),

  /** The tokens a request can let the model reason with, at least `min` and at most `max`. */
  budget: Schema.optionalKey(
    Schema.Struct({ min: Schema.optionalKey(Schema.Int), max: Schema.optionalKey(Schema.Int) }),
  ),
});

export interface Reasoning extends Schema.Schema.Type<typeof Reasoning> {}

// TODO: Add the higher prices that some providers charge once a request's context passes a size,
// and the prices of audio, once a turn's cost is worked out from its usage.
/** What a model costs, in US dollars for a million tokens. */
export const Cost = Schema.Struct({
  input: Schema.Finite,
  output: Schema.Finite,

  /** Input tokens read from the provider's prompt cache. */
  cacheRead: Schema.optionalKey(Schema.Finite),

  /** Input tokens written to the provider's prompt cache. */
  cacheWrite: Schema.optionalKey(Schema.Finite),

  /** Tokens the model reasons with, when they cost other than output tokens. */
  reasoning: Schema.optionalKey(Schema.Finite),
});

export interface Cost extends Schema.Schema.Type<typeof Cost> {}

// TODO: Add whether a model answers in JSON to a schema and takes a temperature, which models.dev
// also records, once a turn's settings depend on them.
export const Model = Schema.Struct({
  /** The provider's id for the model, which requests name it by. No other model of the provider has it. */
  id: Schema.NonEmptyString,

  name: Schema.String,

  /** The API the model is reached through, as an endpoint for it names it. */
  protocol: ModelEndpoint.Protocol,

  /**
   * The base URL of the model's API, which the protocol's paths follow, such as
   * `https://api.anthropic.com/v1` for `/messages`. A `{NAME}` in it is one of the provider's
   * `settings`, which a connection to the provider fills in.
   */
  url: Schema.String,

  /** When the model came out, as `YYYY-MM-DD`, or `YYYY-MM` when the day is not known. */
  released: Schema.String,

  /** A model the provider has not fully released yet, or is retiring. Absent for one it has released. */
  status: Schema.optionalKey(Schema.Literals(["alpha", "beta", "deprecated"])),

  /** The most tokens the model takes as context, of which `input` may be in a request, and writes. */
  limits: Schema.Struct({
    context: Schema.Int,
    input: Schema.optionalKey(Schema.Int),
    output: Schema.Int,
  }),

  /** What the model takes and gives. */
  modalities: Schema.Struct({
    input: Schema.Array(Modality),
    output: Schema.Array(Modality),
  }),

  /** The model can call tools, which an agent needs in order to work. */
  tools: Schema.Boolean,

  /** How the model reasons, absent for a model that does not. */
  reasoning: Schema.optionalKey(Reasoning),

  /** Absent when the provider publishes no price, as for a model it serves only by subscription. */
  cost: Schema.optionalKey(Cost),
});

export interface Model extends Schema.Schema.Type<typeof Model> {}

export const Provider = Schema.Struct({
  /** models.dev's id for the provider, such as `anthropic`. No other provider has it. */
  id: Schema.NonEmptyString,

  name: Schema.String,

  /** The provider's documentation, where a person finds out how to get an API key. */
  docs: Schema.String,

  /**
   * What a connection to the provider sets besides its credentials, named as the `{NAME}`s in its
   * models' URLs, such as `CLOUDFLARE_ACCOUNT_ID`.
   */
  settings: Schema.Array(Schema.String),

  /** The provider's models, in order of id. */
  models: Schema.Array(Model),
});

export interface Provider extends Schema.Schema.Type<typeof Provider> {}

/** The providers, in order of id. */
export const Catalog = Schema.Struct({ providers: Schema.Array(Provider) });

export interface Catalog extends Schema.Schema.Type<typeof Catalog> {}

export class ModelCatalog extends Context.Service<
  ModelCatalog,
  {
    /** Every provider, in order of id. */
    readonly providers: Effect.Effect<ReadonlyArray<Provider>>;

    /** The provider `providerId`, or nothing when the catalog has no such provider. */
    readonly findProvider: (providerId: string) => Effect.Effect<Provider | undefined>;

    /** The model `modelId` of the provider `providerId`, or nothing when the catalog has neither. */
    readonly findModel: (providerId: string, modelId: string) => Effect.Effect<Model | undefined>;
  }
>()("@amends/connection/ModelCatalog") {}

/** A model catalog of the providers in `catalog`. */
export const make = (catalog: Catalog): ModelCatalog["Service"] => {
  const providers = new Map(catalog.providers.map((provider) => [provider.id, provider]));
  const models = new Map(
    catalog.providers.map((provider) => [
      provider.id,
      new Map(provider.models.map((model) => [model.id, model])),
    ]),
  );
  return ModelCatalog.of({
    providers: Effect.succeed(catalog.providers),
    findProvider: (providerId) => Effect.succeed(providers.get(providerId)),
    findModel: (providerId, modelId) => Effect.succeed(models.get(providerId)?.get(modelId)),
  });
};

/** The catalog this package ships, as models.dev had it when `snapshot.ts` was last written. */
export const layer: Layer.Layer<ModelCatalog> = Layer.effect(
  ModelCatalog,
  Schema.decodeEffect(Schema.fromJsonString(Catalog))(snapshot).pipe(
    Effect.map(make),
    Effect.orDie,
  ),
);
