/**
 * A host for the commands that call the HTTP API: a stub `HttpClient` that gives the answer a test names to each
 * request, and keeps what the app sent, with the app's session and crypto around it.
 */

import { BunCrypto } from "@effect/platform-bun"
import { Effect, Layer } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as Session from "../src/session.ts"
import { apiUrl, session } from "./fixtures.ts"

/** What the host answers: a status and a JSON body, or that it could not be reached. */
export type Answer = Readonly<{ status: number; body: unknown }> | "unreachable"

/** What the app sent to the host: where, with which request key, and what. */
export interface Sent {
  readonly path: string
  readonly key: string | undefined
  readonly payload: unknown
}

/** The app's services over a host that gives `answer` to each request it gets, and keeps what it was sent. */
export const hostAnswering = (answer: Answer) => {
  const sent: Array<Sent> = []
  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      const text = request.body._tag === "Uint8Array" ? new TextDecoder().decode(request.body.body) : ""
      sent.push({
        path: new URL(request.url).pathname,
        key: request.headers["idempotency-key"],
        payload: text === "" ? undefined : JSON.parse(text)
      })
      if (answer === "unreachable") {
        return yield* new HttpClientError.HttpClientError({ reason: new HttpClientError.TransportError({ request }) })
      }
      return HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify(answer.body), {
          status: answer.status,
          headers: { "content-type": "application/json" }
        })
      )
    })
  )
  const layer = Layer.mergeAll(
    Layer.succeed(HttpClient.HttpClient, client),
    Layer.succeed(
      Session.Session,
      Session.Session.of({
        apiUrl,
        current: Effect.succeedSome(session),
        required: Effect.succeed(session),
        keep: () => Effect.void,
        forget: Effect.void
      })
    ),
    BunCrypto.layer
  )
  return { sent, layer }
}
