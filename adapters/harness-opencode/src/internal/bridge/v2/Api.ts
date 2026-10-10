/**
 * The requests the driver makes of opencode's server over opencode 2's session API, in which
 * opencode numbers a session's events from 0 and keeps them, so that a client reads them again from
 * any number. `make` gives them over the client of a started server. A failed request fails with
 * the `HarnessError` the driver reports.
 */
import { HarnessError } from "@amends/harness";
import { Effect, Option, Schema, Stream } from "effect";
import { Sse } from "effect/encoding";
import { HttpClientRequest, HttpClientResponse } from "effect/http";
import type { ModelRef } from "../Driver.ts";
import * as Server from "../Server.ts";
import { SessionEvent } from "./Event.ts";

export interface Api {
  /** Creates a session working in `directory`, returning its id. */
  readonly createSession: (options: {
    readonly directory: string;
    readonly model?: ModelRef;
  }) => Effect.Effect<string, HarnessError.HarnessError>;

  /**
   * Whether opencode has loaded the model provider `providerID`, which a server loads a moment
   * after it starts answering, and only when it can use the provider.
   */
  readonly hasProvider: (providerID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /** Whether the server has the session, as it does unless the sandbox lost opencode's data. */
  readonly hasSession: (sessionID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /**
   * Gives the session a prompt, which starts a turn, or steers the turn running, returning the
   * number of the event that admitted it. The turn's events follow it.
   */
  readonly prompt: (
    sessionID: string,
    text: string,
  ) => Effect.Effect<number, HarnessError.HarnessError>;

  /** Runs the session's next turns on `model`. */
  readonly switchModel: (
    sessionID: string,
    model: ModelRef,
  ) => Effect.Effect<void, HarnessError.HarnessError>;

  /** Ends the session's running turn. Interrupting a session that runs none does nothing. */
  readonly interrupt: (sessionID: string) => Effect.Effect<void, HarnessError.HarnessError>;

  /** Whether opencode is running the session: working on a turn, from taking its prompt. */
  readonly isRunning: (sessionID: string) => Effect.Effect<boolean, HarnessError.HarnessError>;

  /** Deletes the session and everything it recorded. Deleting a deleted session succeeds. */
  readonly deleteSession: (sessionID: string) => Effect.Effect<void, HarnessError.HarnessError>;

  /**
   * The session's events numbered after `after`, or all of them, and then each new one as it
   * happens. The stream does not end by itself. Events of types the adapter does not read are left
   * out.
   */
  readonly events: (
    sessionID: string,
    after: number | undefined,
  ) => Stream.Stream<SessionEvent, HarnessError.HarnessError>;

  /**
   * The session's events numbered after `after` that it has recorded so far, ending with the last.
   * Events of types the adapter does not read are left out.
   */
  readonly history: (
    sessionID: string,
    after: number,
  ) => Stream.Stream<SessionEvent, HarnessError.HarnessError>;

  /**
   * Appends `events` to the session in `directory` they name, as if it had recorded them. They are
   * numbered on from the session's last event, without gaps.
   */
  readonly replay: (
    directory: string,
    events: ReadonlyArray<SessionEvent>,
  ) => Effect.Effect<void, HarnessError.HarnessError>;
}

/** The requests of opencode 2's session API, made of `server`. */
export const make = (server: Server.Server): Api => {
  const { client, clientOk } = server;
  const fromRequestError = Server.requestError(server.agent);

  const send = (request: HttpClientRequest.HttpClientRequest) =>
    clientOk.execute(request).pipe(Effect.asVoid, Effect.mapError(fromRequestError));

  return {
    createSession: ({ directory, model }) =>
      HttpClientRequest.post("/api/session").pipe(
        HttpClientRequest.bodyJsonUnsafe({ location: { directory }, model }),
        clientOk.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(CreatedSession)),
        Effect.map((created) => created.data.id),
        Effect.mapError(fromRequestError),
      ),

    hasProvider: (providerID) =>
      client.get(`/api/provider/${encodeURIComponent(providerID)}`).pipe(
        Effect.flatMap(
          HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
        ),
        Effect.map((response) => response.status === 200),
        Effect.mapError(fromRequestError),
      ),

    hasSession: (sessionID) =>
      client.get(`/api/session/${encodeURIComponent(sessionID)}`).pipe(
        Effect.flatMap(
          HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
        ),
        Effect.map((response) => response.status === 200),
        Effect.mapError(fromRequestError),
      ),

    prompt: (sessionID, text) =>
      HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/prompt`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ prompt: { text } }),
        clientOk.execute,
        Effect.flatMap(HttpClientResponse.schemaBodyJson(AdmittedPrompt)),
        Effect.map((admitted) => admitted.data.admittedSeq),
        Effect.mapError(fromRequestError),
      ),

    switchModel: (sessionID, model) =>
      send(
        HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/model`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ model }),
        ),
      ),

    interrupt: (sessionID) =>
      send(HttpClientRequest.post(`/api/session/${encodeURIComponent(sessionID)}/interrupt`)),

    isRunning: (sessionID) =>
      clientOk.get("/api/session/active").pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(ActiveSessions)),
        Effect.map((active) => Object.hasOwn(active.data, sessionID)),
        Effect.mapError(fromRequestError),
      ),

    // The session API has no route that deletes a session yet, so this is the server's older one.
    // It answers 404 for a session it does not have.
    deleteSession: (sessionID) =>
      client
        .del(`/session/${encodeURIComponent(sessionID)}`)
        .pipe(
          Effect.flatMap(
            HttpClientResponse.filterStatus((status) => status === 200 || status === 404),
          ),
          Effect.asVoid,
          Effect.mapError(fromRequestError),
        ),

    events: (sessionID, after) =>
      clientOk
        .get(`/api/session/${encodeURIComponent(sessionID)}/event`, {
          urlParams: after === undefined ? {} : { after: String(after) },
        })
        .pipe(
          Effect.map((response) => response.stream),
          Stream.unwrap,
          Stream.decodeText(),
          Stream.pipeThroughChannel(Sse.decodeDataSchema(StreamedEvent)),
          Stream.map((event) => event.data),
          Stream.filter(Schema.is(SessionEvent)),
          Stream.mapError(fromRequestError),
        ),

    history: (sessionID, after) =>
      Stream.paginate(after, (afterSeq) =>
        clientOk
          .get(`/api/session/${encodeURIComponent(sessionID)}/history`, {
            urlParams: { after: String(afterSeq) },
          })
          .pipe(
            Effect.flatMap(HttpClientResponse.schemaBodyJson(HistoryPage)),
            Effect.map(({ data, hasMore }) => {
              const last = data.at(-1);
              return [
                data.filter(Schema.is(SessionEvent)),
                hasMore && last !== undefined ? Option.some(last.durable.seq) : Option.none(),
              ] as const;
            }),
          ),
      ).pipe(Stream.mapError(fromRequestError)),

    replay: (directory, events) =>
      Effect.forEach(events, (event) => Schema.encodeEffect(SessionEvent)(event)).pipe(
        Effect.map((encoded) =>
          encoded.map(({ id, type, durable, data }) => ({
            id,
            aggregateID: durable.aggregateID,
            seq: durable.seq,
            type: `${type}.${durable.version}`,
            data,
          })),
        ),
        Effect.flatMap((rows) =>
          send(
            HttpClientRequest.post("/sync/replay").pipe(
              HttpClientRequest.bodyJsonUnsafe({ directory, events: rows }),
            ),
          ),
        ),
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(
            Server.harnessError(
              server.agent,
              new HarnessError.AgentContractError({ description: cause.message }),
              cause,
            ),
          ),
        ),
      ),
  };
};

const CreatedSession = Schema.Struct({ data: Schema.Struct({ id: Schema.String }) });

const AdmittedPrompt = Schema.Struct({ data: Schema.Struct({ admittedSeq: Schema.Int }) });

/** The sessions the server is running, by id. */
const ActiveSessions = Schema.Struct({ data: Schema.Record(Schema.String, Schema.Unknown) });

/** An event of a type the adapter does not read, which `events` and `history` leave out. */
const OtherEvent = Schema.Struct({
  type: Schema.String.check(
    Schema.makeFilter((type: string) => !Object.hasOwn(SessionEvent.cases, type)),
  ),
  durable: Schema.Struct({ seq: Schema.Int }),
});

/**
 * An event as the server streams it. A known type that does not decode fails, rather than being
 * left out as an event of another type.
 */
const StreamedEvent = Schema.Union([SessionEvent, OtherEvent]);

/** A page of the session's history, with whether more follow it. */
const HistoryPage = Schema.Struct({ data: Schema.Array(StreamedEvent), hasMore: Schema.Boolean });
