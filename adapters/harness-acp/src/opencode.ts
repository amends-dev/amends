/**
 * opencode (https://opencode.ai) as a harness: it runs `opencode acp` in the sandbox for each
 * session, configured to call the session's model endpoint and nothing else, with its data in the
 * session's own directory. To continue a conversation it writes the transcript in opencode's
 * export format and imports it as a session, which opencode then loads. What this module writes
 * follows opencode's own formats for the release it pins.
 */
import type { ModelInference } from "@amends/connection/model-inference";
import { Harness, HarnessErrors, Transcript } from "@amends/harness";
import type { HarnessImplementation } from "@amends/harness";
import { Clock, Effect, FileSystem, Path, Redacted, Stream } from "effect";
import type { PlatformError } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { AcpHarness } from "./harness.ts";

/** The opencode release this module configures and writes sessions for. */
export const version = "1.18.23";

export const declaration: HarnessImplementation.Declaration = {
  id: Harness.Name.make("opencode"),
  name: "opencode",
  description: "The opencode coding agent, running in the sandbox and calling the model itself.",
  placement: ["in-sandbox"],
  models: { _tag: "Interfaces", interfaces: ["anthropic-messages", "openai-chat-completions"] },
};

/** The model as opencode names it: the provider it configures, and the model's ID there. */
export interface Model {
  readonly providerID: string;
  readonly modelID: string;
}

/** The agent opencode runs its sessions as, which writes and runs code. */
const agent = "build";

/**
 * opencode's configuration for a session: only the endpoint's provider, with the model, its key,
 * and its limits; every permission granted except asking questions or switching modes, since no
 * one answers; and no sharing, updating, snapshots, or model requests for session titles.
 */
export const configOf = (
  endpoint: ModelInference.Endpoint["Service"],
  instructions: ReadonlyArray<string>,
) => {
  const apiKey = endpoint.apiKey === undefined ? undefined : Redacted.value(endpoint.apiKey);
  const { contextTokens, outputTokens } = endpoint.limits;
  const models = {
    [endpoint.model]: {
      name: endpoint.model,
      ...(outputTokens !== undefined && {
        limit: { context: contextTokens, output: outputTokens },
      }),
    },
  };
  const provider =
    endpoint.interface === "anthropic-messages"
      ? {
          id: "anthropic",
          options: { apiKey, ...(endpoint.baseUrl !== undefined && { baseURL: endpoint.baseUrl }) },
        }
      : endpoint.interface === "openai-chat-completions" && endpoint.baseUrl !== undefined
        ? {
            id: "amends",
            npm: "@ai-sdk/openai-compatible",
            options: { apiKey, baseURL: endpoint.baseUrl },
          }
        : undefined;
  if (provider === undefined) return undefined;
  const { id, ...settings } = provider;
  const model: Model = { providerID: id, modelID: endpoint.model };
  return {
    model,
    config: {
      $schema: "https://opencode.ai/config.json",
      autoupdate: false,
      share: "disabled",
      snapshot: false,
      enabled_providers: [id],
      provider: { [id]: { ...settings, models } },
      model: `${id}/${endpoint.model}`,
      small_model: `${id}/${endpoint.model}`,
      instructions,
      permission: { "*": "allow", question: "deny", plan_enter: "deny", plan_exit: "deny" },
      agent: { title: { disable: true } },
    },
  };
};

const idCharacters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * An ID as opencode makes them: its prefix, then the time and a counter in twelve hex digits,
 * inverted for IDs that sort newest first, then a suffix. opencode makes the suffix random; a
 * session's own store holds only what it writes, so a counter keeps them apart.
 */
export const idOf = (prefix: string, time: number, counter: number, descending = false) => {
  const current = BigInt(time) * 0x1000n + BigInt(counter);
  const value = descending ? ~current : current;
  const hex = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0"),
  ).join("");
  let suffix = "";
  for (let rest = counter, index = 0; index < 14; index++, rest = Math.floor(rest / 62))
    suffix = idCharacters[rest % 62] + suffix;
  return `${prefix}_${hex}${suffix}`;
};

/** An input as opencode's user message reads: its author's name, then what they said. */
const inputText = (input: Transcript.Input) =>
  `${input.author.name}: ${input.content.map((content) => content.text).join("\n\n")}`;

/** A tool call an earlier session made, and its result, written into a response's text. */
const callText = (call: Transcript.ToolCall, result: Transcript.ToolResult | undefined) => {
  const lines = [`[Earlier tool call: ${call.name} ${JSON.stringify(call.params)}]`];
  if (result !== undefined) {
    const sent = Transcript.sentResult(result);
    const text = typeof sent === "string" ? sent : JSON.stringify(sent);
    lines.push(`[${result.isError ? "It failed" : "It returned"}: ${text}]`);
  }
  return lines.join("\n");
};

/**
 * A response as opencode's assistant message reads: its text, with each tool call and the
 * result that follows it written in place, since opencode runs its own tools under other names.
 * Reasoning is left out, as providers return it only to the model that wrote it.
 */
const responseText = (
  response: Transcript.Response,
  results: ReadonlyMap<string, Transcript.ToolResult>,
) =>
  response.parts
    .flatMap((part) => {
      switch (part._tag) {
        case "Text":
          return part.text.trim() === "" ? [] : [part.text];
        case "Reasoning":
          return [];
        case "ToolCall":
          return [callText(part, results.get(part.id))];
      }
    })
    .join("\n\n");

/** What `exportOf` writes: the session's ID, and the messages it holds as opencode replays them. */
export interface Exported {
  readonly sessionId: string;
  readonly messages: ReadonlyArray<AcpHarness.Message>;
  /** The session in opencode's export format, for `opencode import`. */
  readonly data: unknown;
}

/**
 * A transcript as an opencode session: each input a user message, and each response with its
 * tool results an assistant message answering the input before it. A response with nothing to
 * read, such as only reasoning, is left out. A transcript that starts with a response has none,
 * as opencode has no input for it to answer.
 */
export const exportOf = (
  items: ReadonlyArray<Transcript.Item>,
  options: { readonly workdir: string; readonly model: Model; readonly now: number },
): Exported | undefined => {
  const { workdir, model, now } = options;
  let counter = 0;
  const next = (prefix: string) => idOf(prefix, now, ++counter);
  const sessionID = idOf("ses", now, 1, true);
  const results = new Map<string, Transcript.ToolResult>();
  for (const item of items) if (item._tag === "ToolResult") results.set(item.callId, item);

  const messages: Array<{ readonly info: object; readonly parts: ReadonlyArray<object> }> = [];
  const replayed: Array<AcpHarness.Message> = [];
  let parentID: string | undefined;
  const time = { created: now };
  for (const item of items) {
    if (item._tag === "ToolResult") continue;
    const id = next("msg");
    const part = (fields: object) => ({ id: next("prt"), sessionID, messageID: id, ...fields });
    if (item._tag === "Input") {
      parentID = id;
      const text = inputText(item);
      messages.push({
        info: { id, sessionID, role: "user", time, agent, model },
        parts: [part({ type: "text", text })],
      });
      replayed.push({ role: "user", text });
      continue;
    }
    if (parentID === undefined) return undefined;
    const text = responseText(item, results);
    if (text === "") continue;
    const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } };
    messages.push({
      info: {
        id,
        sessionID,
        role: "assistant",
        time: { created: now, completed: now },
        parentID,
        modelID: model.modelID,
        providerID: model.providerID,
        mode: agent,
        agent,
        path: { cwd: workdir, root: workdir },
        cost: 0,
        tokens,
        finish: "stop",
      },
      parts: [
        part({ type: "step-start" }),
        part({ type: "text", text }),
        part({ type: "step-finish", reason: "stop", cost: 0, tokens }),
      ],
    });
    replayed.push({ role: "assistant", text });
  }
  return {
    sessionId: sessionID,
    messages: replayed,
    data: {
      info: {
        id: sessionID,
        slug: "amends",
        projectID: "global",
        directory: workdir,
        title: "Continued from amends",
        version,
        time: { created: now, updated: now },
      },
      messages,
    },
  };
};

const failed = (what: string) => (error: { readonly message: string }) =>
  new HarnessErrors.ExecutionFailed({
    reason: `${what}: ${error.message}`,
    retryable: false,
    problem: "unexpected",
  });

/** How to run opencode for a session, configured for its model endpoint and instructions. */
const prepareRun: AcpHarness.Agent["prepareRun"] = Effect.fnUntraced(function* (session) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { workdir, directory, endpoint } = session;
  const instructions =
    session.instructions === undefined ? [] : [path.join(directory, "instructions.md")];
  const configured = configOf(endpoint, instructions);
  if (configured === undefined)
    return yield* new HarnessErrors.ExecutionFailed({
      reason: `opencode can't call a model over ${endpoint.interface}${endpoint.baseUrl === undefined ? " without a base URL" : ""}.`,
      retryable: false,
      problem: "model-request",
    });
  if (session.instructions !== undefined)
    yield* fs
      .writeFileString(instructions[0]!, session.instructions)
      .pipe(Effect.mapError(failed("The instructions weren't written")));
  // Everything opencode keeps goes in the session's directory, and it fetches nothing at start:
  // its bundled model catalog stands in for models.dev, and it installs no plugins or servers.
  // It reads the project's own instructions and skills, not those of the user it runs as, and
  // never summarizes the conversation itself: a turn's log holds the conversation, and a model
  // that cannot take it all refuses the request.
  const env = {
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_STATE_HOME: path.join(directory, "state"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify(configured.config),
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    OPENCODE_DISABLE_LSP_DOWNLOAD: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_AUTOCOMPACT: "1",
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
  };

  /** Import an exported session into the store the session's opencode reads. */
  const importSession = (file: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(
          ChildProcess.make("opencode", ["import", file], { cwd: workdir, env, extendEnv: true }),
        );
        const text = (stream: Stream.Stream<Uint8Array, PlatformError.PlatformError>) =>
          stream.pipe(Stream.decodeText(), Stream.mkString);
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [text(handle.stdout), text(handle.stderr), handle.exitCode],
          { concurrency: "unbounded" },
        );
        if (exitCode !== 0)
          return yield* new HarnessErrors.ExecutionFailed({
            reason: `opencode import exited with ${exitCode}: ${stderr.trim() || stdout.trim()}`,
            retryable: false,
            problem: "unexpected",
          });
      }),
    ).pipe(
      Effect.catchTag("PlatformError", (error) =>
        Effect.fail(failed("opencode import didn't run")(error)),
      ),
    );

  const writeSession: AcpHarness.Run["writeSession"] = Effect.fnUntraced(function* (items) {
    const now = yield* Clock.currentTimeMillis;
    const exported = exportOf(items, { workdir, model: configured.model, now });
    if (exported === undefined)
      return yield* new HarnessErrors.Unsupported({
        reason: "opencode can't continue a conversation that starts with a response.",
      });
    const file = path.join(directory, "session.json");
    yield* fs
      .writeFileString(file, JSON.stringify(exported.data))
      .pipe(Effect.mapError(failed("The session wasn't written")));
    yield* importSession(file);
    return { sessionId: exported.sessionId, messages: exported.messages };
  });

  return {
    argv: ["opencode", "acp", "--cwd", workdir],
    env,
    writeSession,
  } satisfies AcpHarness.Run;
});

/**
 * The opencode harness, whose sessions work in `workdir`. They run `opencode acp` from the `PATH`,
 * which must be the pinned release.
 *
 * @category constructors
 */
export const make = (workdir: string) =>
  AcpHarness.make({ declaration, version, prepareRun }, workdir);

export * as OpenCodeHarness from "./opencode.ts";
