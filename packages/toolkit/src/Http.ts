/**
 * An HTTP API as a tool source. Each tool is one operation: a request with places in it for what the
 * model gives, which the definition of the tool describes. An operation is data, so a catalog can
 * store it, and `OpenApi` makes the operations of an API from its specification.
 *
 * The source sends requests to one base URL, over an HTTP client the caller has already given the
 * credentials the API asks for, so no credential enters this package. What the model gives never
 * decides where a request goes: it fills the places the operation has for it, as the segments of the
 * path, the parameters of the query, the headers, and the body, which is JSON.
 */
import { Effect, Result, Schema } from "effect";
import { HttpClient, HttpClientError, HttpClientRequest, HttpClientResponse } from "effect/http";
import { ToolDefinition } from "./ToolDefinition.ts";
import type { ToolSource } from "./ToolSource.ts";
import {
  AuthenticationError,
  CallFailedError,
  InvalidInputError,
  InvalidResponseError,
  NotFoundError,
  ToolSourceError,
  UnavailableError,
  UnknownError,
  UnsupportedError,
  type ToolSourceErrorReason,
} from "./ToolSourceError.ts";

export const Method = Schema.Literals(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export type Method = typeof Method.Type;

/** A place in a request for a property of the tool's input. */
export const Parameter = Schema.Struct({
  in: Schema.Literals(["path", "query", "header"]),

  /** What the request calls it: the name between braces in the path, or of the query or the header. */
  name: Schema.NonEmptyString,

  /** The property of the input that holds the value, which the definition's parameters name. */
  property: Schema.NonEmptyString,
});

export interface Parameter extends Schema.Schema.Type<typeof Parameter> {}

export const RequestTemplate = Schema.Struct({
  method: Method,

  /** The path after the base URL, with a parameter's name between braces where its value goes. */
  path: Schema.String,

  parameters: Schema.Array(Parameter),

  /** The property of the input that holds the body, which is sent as JSON, if the request has one. */
  body: Schema.optionalKey(Schema.NonEmptyString),
});

export interface RequestTemplate extends Schema.Schema.Type<typeof RequestTemplate> {}

export const Operation = Schema.Struct({
  definition: ToolDefinition,
  request: RequestTemplate,
});

export interface Operation extends Schema.Schema.Type<typeof Operation> {}

export interface Options {
  /** Names the source, as `ToolSource.name` says. */
  readonly name: string;

  /** Where the requests go, which the operations' paths follow. */
  readonly baseUrl: string;

  /** Sends the requests, with the credentials the API asks for set on every one of them. */
  readonly client: HttpClient.HttpClient;

  /** The tools of the source, which must have distinct names. */
  readonly operations: ReadonlyArray<Operation>;
}

/** The most of an answer that a failed call tells the model, which is all it needs to correct. */
const maxFailureLength = 500;

// TODO: Give a request that never answers, and an answer that never ends or is far too large to
// read, a limit. Both need a decision about what a call may cost, which the source does not have yet.
/** Makes a source of the operations of an HTTP API. */
export const make = Effect.fn("Http.make")(function* (options: Options) {
  const { name, client } = options;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const operations = new Map(
    options.operations.map((operation) => [operation.definition.name, operation]),
  );
  if (operations.size !== options.operations.length) {
    return yield* Effect.die(new Error(`${name} has more than one operation of the same name`));
  }

  const fail = (reason: ToolSourceErrorReason, cause?: unknown) =>
    new ToolSourceError({ source: name, reason, cause });

  const failToReach = (error: HttpClientError.HttpClientError) =>
    fail(
      error.reason._tag === "TransportError"
        ? new UnavailableError({})
        : new UnknownError({ description: error.message }),
      error,
    );

  /** Sends the request, and returns the response whatever its status. */
  const send = (request: HttpClientRequest.HttpClientRequest) =>
    client.execute(request).pipe(
      Effect.catchReason("HttpClientError", "StatusCodeError", (reason) =>
        Effect.succeed(reason.response),
      ),
      Effect.mapError(failToReach),
    );

  const readText = (response: HttpClientResponse.HttpClientResponse) =>
    response.text.pipe(Effect.mapError(failToReach));

  /** What a response with a status that is not a success says, as a failure of the call. */
  const failWithStatus = Effect.fnUntraced(function* (
    response: HttpClientResponse.HttpClientResponse,
  ) {
    const { status } = response;
    const description = `The API answered ${status}`;
    if (status === 401 || status === 403)
      return yield* fail(new AuthenticationError({ description }));
    if (status === 408 || status === 429 || status >= 500) {
      return yield* fail(new UnavailableError({ description }));
    }
    if (status < 400) return yield* fail(new InvalidResponseError({ description }));
    // The API's own words for what is wrong with the request are what the model can act on.
    const said = (yield* readText(response).pipe(Effect.orElseSucceed(() => ""))).trim();
    const excerpt = said.length > maxFailureLength ? `${said.slice(0, maxFailureLength)}...` : said;
    return yield* fail(
      new CallFailedError({ description: excerpt === "" ? description : `${status}: ${excerpt}` }),
    );
  });

  /** What a response with a status that is a success says: the body, as JSON, or as text. */
  const readBody = Effect.fnUntraced(function* (response: HttpClientResponse.HttpClientResponse) {
    const text = yield* readText(response);
    if (text === "") return null;
    const mediaType =
      (response.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (mediaType === "" || mediaType.startsWith("text/")) return text;
    if (mediaType === "application/json" || mediaType.endsWith("+json")) {
      return yield* decodeJson(text).pipe(
        Effect.mapError((error) =>
          fail(new InvalidResponseError({ description: "The body is not JSON" }), error),
        ),
      );
    }
    return yield* fail(
      new UnsupportedError({
        description: `The API answered ${mediaType}, which a tool cannot return`,
      }),
    );
  });

  const source: ToolSource = {
    name,
    discover: Effect.succeed(options.operations.map((operation) => operation.definition)),
    call: Effect.fnUntraced(function* (tool, input) {
      const operation = operations.get(tool);
      if (operation === undefined) return yield* fail(new NotFoundError({}));
      const prepared = yield* Effect.fromResult(prepare(operation.request, input)).pipe(
        Effect.mapError((description) => fail(new InvalidInputError({ description }))),
      );
      const request = HttpClientRequest.make(operation.request.method)(
        baseUrl + prepared.path,
      ).pipe(
        HttpClientRequest.setHeaders({ accept: "application/json", ...prepared.headers }),
        HttpClientRequest.appendUrlParams(prepared.query),
        (request) =>
          prepared.body === undefined
            ? request
            : HttpClientRequest.bodyJsonUnsafe(request, prepared.body),
      );
      const response = yield* send(request);
      return response.status >= 200 && response.status < 300
        ? yield* readBody(response)
        : yield* failWithStatus(response);
    }),
  };
  return source;
});

const decodeJson = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json));

/** What the model gave, laid out as the places of a request. */
interface Prepared {
  readonly path: string;
  readonly query: ReadonlyArray<readonly [string, string]>;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Schema.Json | undefined;
}

type Scalar = string | number | boolean;

const isScalar = (value: Schema.Json): value is Scalar =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean";

/** A character that a header value cannot hold, which a value with one could use to add headers. */
const invalidInHeader = /[^\t\x20-\x7e\x80-\xff]/;

/**
 * Fills the places of a request with the input, or says what is wrong with the input. A value is
 * a string, a number, or a boolean, and a query or a header may take a list of them. A value in the
 * path is encoded, and may not be empty or stand for a part of the path, since it could otherwise
 * decide which operation of the API is called.
 */
const prepare = (
  template: RequestTemplate,
  input: Schema.JsonObject,
): Result.Result<Prepared, string> => {
  const pathValues = new Map<string, string>();
  const query: Array<readonly [string, string]> = [];
  const headers: Record<string, string> = {};

  for (const parameter of template.parameters) {
    const given = input[parameter.property];
    if (given === undefined || given === null) continue;
    const values = Array.isArray(given) ? given : [given];
    const listAllowed = parameter.in !== "path";
    if ((Array.isArray(given) && !listAllowed) || !values.every(isScalar)) {
      return Result.fail(
        `\`${parameter.property}\` must be a string, a number, or a boolean${listAllowed ? ", or a list of them" : ""}`,
      );
    }
    const texts = values.map(String);
    switch (parameter.in) {
      case "path": {
        const [text] = texts;
        if (text === undefined || text === "" || text === "." || text === "..") {
          return Result.fail(`\`${parameter.property}\` must be a name, not "${text}"`);
        }
        pathValues.set(parameter.name, encodeURIComponent(text));
        break;
      }
      case "query":
        for (const text of texts) query.push([parameter.name, text]);
        break;
      case "header": {
        const text = texts.join(",");
        if (invalidInHeader.test(text)) {
          return Result.fail(`\`${parameter.property}\` has a character that a header cannot hold`);
        }
        headers[parameter.name] = text;
        break;
      }
    }
  }

  const path = template.path.replace(
    /\{([^{}]+)\}/g,
    (place, name: string) => pathValues.get(name) ?? place,
  );
  const missing = [...path.matchAll(/\{([^{}]+)\}/g)].map((place) => place[1]);
  if (missing.length > 0) {
    const names = template.parameters
      .filter((parameter) => parameter.in === "path" && missing.includes(parameter.name))
      .map((parameter) => `\`${parameter.property}\``);
    return Result.fail(`${names.length > 0 ? names.join(", ") : missing.join(", ")} must be given`);
  }

  return Result.succeed({
    path: path.startsWith("/") ? path : `/${path}`,
    query,
    headers,
    body: template.body === undefined ? undefined : input[template.body],
  });
};
