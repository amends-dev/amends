# Harness

`@amends/harness` is the common harness contract from the
[core model](../../docs/core-model.md#agreed-every-harness-records-the-same-events): how a turn
drives a harness session, and the events every harness reports. Implementations translate their
native interaction into it; [`@amends/harness-amends`](../harness-amends/README.md) is amends's own.
Nothing here knows about environments, threads, or turns. Turns ran harnesses through this
contract before they moved to [harness-v2](../harness-v2/README.md), and none runs one now.

## One recorded standard

A turn's log stores `HarnessEvent.Event` values, whichever harness produced them and wherever it
ran, so a log reads the same in process, in a sandbox, or after moving between them. A response is
reported block by block as each completes, the unit a harness running its own loop in a sandbox can
also report:

| Event               | What it records                                                                |
| ------------------- | ------------------------------------------------------------------------------ |
| `InputIncorporated` | A submitted batch the harness took into its context, after everything earlier. |
| `TextDelta`         | More text for one block of a streaming response; live only.                    |
| `ReasoningDelta`    | More reasoning for one block of a streaming response; live only.               |
| `BlockCompleted`    | One completed block of a response, by position: text, reasoning, or tool call. |
| `ResponseFinished`  | The response finished, with its finish reason, model, and usage.               |
| `ToolCallStarted`   | The harness began running a call, which from now on may have had an effect.    |
| `ToolCallCompleted` | A tool call's result, whether the session ran the call or was given it.        |
| `ContextFull`       | The next request would pass the session's context limit; it does no more.      |
| `Idle`              | Every input has its response, no call waits, and nothing waits to be taken in. |

A harness continues from a `Transcript.Value`: the history the turn chose, then what its events
recorded. `HarnessEvent.transcript(events, history, { unfinished })` builds it. It has three kinds
of item: `Input` attributed to its author, `Response` with text, reasoning, and tool-call parts, and
`ToolResult` answering one call. Deltas, starts, and `Idle` add nothing, so:

- a finished response enters with its blocks in order, and results its calls got before it
  finished follow it;
- a response that stopped before finishing keeps only its completed blocks. Its calls that never
  started did not happen and are dropped; one that started without a result is answered by
  `cutShort`, its effect unknown, and never runs again. It stays in the transcript when it holds a
  started call. Otherwise, with `unfinished: "omit"`, the default for execution that goes on, it is
  left out and the next session asks for a fresh response; with `unfinished: "keep"`, for work that
  ended, what it wrote stays;
- when work ended, calls still pending are answered too, by `cutShort` or `notRun`, so later input
  can follow; while execution goes on, a finished response's unanswered calls stay pending, and
  whoever knows their outcome supplies it;
- incorporated input appears once, so continuing never submits it twice.

Recovering from a failure, moving to another environment, and retrying all prepare a fresh session
from the same transcript; there is no separate restore path.

`Transcript.summarize` checks the order every provider requires, which the `Transcript.Value`
schema also applies: each response's calls have unique IDs and are answered once, by results that
follow it before any other input or response. Only the last response's calls may be pending. It
reports those `pending` calls and whether the transcript `awaitsResponse`.

A tool result is sent as its `structured` JSON value, or else its text, and past
`Transcript.resultCharacters` (24,000) as text clipped to its beginning and end, saying how much of
its middle was left out (`Transcript.sentResult`, `Transcript.clip`); the log keeps it whole.
`Transcript.characters` counts what a transcript holds as a model reads it, tool results as sent, and
`Transcript.estimate` how many tokens that is: exactly what a provider measured through the
response it measured (`Transcript.Measured`), and a token for every four characters after it, with
the instructions when no measurement covers them.

A part can carry `native` data that only the harness that recorded it can use, keyed by that
harness's name, such as a provider's signature over its reasoning that the same provider requires
back. Other harnesses ignore it; what a transcript means never depends on it.

Stored events are tagged unions encoded as JSON. Adding an event kind or an optional field keeps
old logs readable; changing what an existing field means does not. The tests round-trip every kind
through JSON.

## Declarations

`HarnessImplementation.Declaration` is what a host registers in its catalog and core checks
environments against: the harness's `id` (its `Harness.Name`), `name`, and `description`; its
`placement`, where its loop can run (`in-process` in the amends process, or `in-sandbox` as a
program inside a sandbox); how it reaches a model (`LanguageModel`, Effect AI access from any model
connection the host installed, or `Interfaces`, provider interfaces it speaks itself); and the
`reasoning` levels it can request, if any.

## Sessions

`Harness.Interface<R>` is an implementation: its `declaration`, which a host lists in its catalog
from the same value it runs, its `Capabilities`, and how it starts sessions that live until their
scope closes. `R` is what sessions need from their environment, such as model
access. `StartOptions` carries the session ID, which prefixes the IDs a session assigns so they stay
unique across the sessions sharing one log, and the agent's instructions and `HarnessTool.Tools`.
It can also carry a `contextLimit`, the most tokens one model request may carry, with what a
provider `measured` of the transcript the session is prepared with. A harness that honors the limit
reports `ContextFull` instead of making a request it estimates over it and does nothing more, so the
host can shorten the transcript for a new session; one that does not runs until its provider
refuses.

A `Harness.Session` follows the core model's stages:

1. `prepare(transcript)` sets the conversation to continue, once, before anything else. It starts
   no work. An invalid transcript fails with `InvalidTranscript`; a harness that cannot continue it
   fails with `Unsupported`; one that could not set up its own session, such as a harness in a
   sandbox whose process ended, fails with `ExecutionFailed`.
2. `submit(batch)` hands over input, which the session takes in once no call is waiting and before
   its next model request.
3. `resolve(callId, outcome)` answers a call the prepared transcript left pending, such as an
   environment switch completing in its destination. A call the session is running itself, or one
   that is not pending, fails with `NotPending`.
4. `resume` continues a transcript that awaits a response, and reports `Idle` when nothing is owed.

`events` reports everything in order to one consumer. It fails with `ExecutionFailed`, which says
whether the same work can be retried unchanged, and later operations fail with it too. Its
`problem` is what the host tells the turn's readers: the model's provider refused the credential,
ran out of quota, limited requests, could not be reached, failed on its side, declined the content,
refused a request longer than its model's context window, or rejected the request otherwise; the
model's output could not be used or it went silent; the session ended
first; or something unexpected. Its `reason` is the detail for the host's logs only.
`HarnessErrors.fromModel` builds one from an Effect AI failure, and `modelProblem` names the
problem such a failure is.

`Capabilities.transcript` says a harness prepares its context from any valid transcript, including
another harness's; `pendingToolCalls` says it takes a result for a call an earlier session left
pending. A harness that restores only its own native sessions declares neither.

`HarnessTool.Definition` describes a tool to the model with a JSON Schema for its parameters, and
`Tools.invoke` runs a call to an outcome. A tool's own failure is an outcome the model reads
(`HarnessTool.failure`), not an error; `Transcript.toolResult` pairs an outcome with its call.

## Conformance suites

`@amends/harness/conformance` holds test suites every harness runs against itself, so a new
harness passes the same tests as the ones in this repository; it is the one module here that uses
`@effect/vitest`, and only test files import it.

A harness supplies a `Subject`, conventionally in `test/subject.ts`. It is called the subject
rather than a harness, which names what is under test:

| Member      | Meaning                                                                                |
| ----------- | -------------------------------------------------------------------------------------- |
| `name`      | Names the harness in suite titles.                                                     |
| `available` | `false` skips every suite, as opencode's do when it is not installed.                  |
| `harness`   | The harness under test, built for one test's scope.                                    |
| `model`     | A model following a script, reached as the harness reaches a real one.                 |
| `timeout`   | How long one test may take, in milliseconds; a harness that runs a program needs more. |

A script lists the text the model answers each request with, or says it refuses its key. The model
also returns each request it received as text, which the suites search for what the conversation
said. Amends's harness gets an Effect AI model; opencode gets a chat-completions server on a local
port. Each test file registers one suite, such as `Suites.sessions(subject)`. The tests use live
time, since a harness may run a program.

### Suites

| Suite          | Covers                                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`     | Input answered in a new session and attributed to its author, instructions reaching the model, input submitted while it works taken in order before it is idle, the order of operations, and a refused key.      |
| `continuation` | Answering the input a transcript ends with in its context, tool calls and results another harness recorded reaching the model, idleness when nothing is owed, a transcript out of order, and pending tool calls. |
