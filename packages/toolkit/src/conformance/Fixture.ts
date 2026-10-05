/**
 * What a tool source gives the conformance suites. The suites need a system to run the tools of: an
 * MCP server, an HTTP API, whatever the source reaches. The fixture serves three tools of it, which
 * every source is tested with, and makes the source for one test over a system in the condition the
 * suite asks for.
 */
import type { Effect, Scope, Schema } from "effect";
import type { ToolSource } from "../ToolSource.ts";

/**
 * How the system the source reaches is for a test: it works, it refuses the credentials the source
 * has, it answers that it is down, or it cannot be reached.
 */
export type Condition = "working" | "unauthorized" | "unavailable" | "unreachable";

/** The source under test, for one test, with what the suites need of the system behind it. */
export interface Subject {
  readonly source: ToolSource;

  /** Completes once the system has been asked to run the blocking tool. */
  readonly blockedCallStarted: Effect.Effect<void>;

  /**
   * What the source holds that must not reach a model, which is credentials, and the address of the
   * system if it could say something of what is inside.
   */
  readonly secrets: ReadonlyArray<string>;
}

/** A tool of the fixture, and the input that calls it. */
export interface ToolCase {
  /** The name the source discovers the tool under, short enough to stay as it is in an assembly. */
  readonly tool: string;
  readonly input: Schema.JsonObject;
}

export interface Fixture {
  /**
   * Makes the source for one test, over a system in `condition`. What it starts ends with the
   * scope of the test.
   */
  readonly make: (condition: Condition) => Effect.Effect<Subject, unknown, Scope.Scope>;

  readonly tools: {
    /** Answers with the text it is given, which is somewhere in what the source returns. */
    readonly echo: {
      readonly tool: string;
      readonly input: (text: string) => Schema.JsonObject;

      /** An input that the tool's parameters do not allow. */
      readonly invalidInput: Schema.JsonObject;
    };

    /** Reports that it failed, whatever its input. */
    readonly failing: ToolCase;

    /** Does not answer, until the call that asked it is given up. */
    readonly blocking: ToolCase;
  };

  /** How many milliseconds a test may take, more than the default for a source on the network. */
  readonly timeout?: number;
}
