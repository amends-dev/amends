# Harness

`@amends/harness` is the common harness contract from the
[core model](../../docs/core-model.md#agreed-every-harness-records-the-same-events): how a turn
drives a harness session, and the events every harness reports. Implementations translate their
native interaction into it; [`@amends/harness-amends`](../harness-amends/README.md) is amends's own.
Nothing here knows about environments, threads, or turns, and nothing runs a harness yet.

## One recorded standard

A turn's log will store `HarnessEvent.Event` values, whichever harness produced them and wherever
it ran, so a log reads the same in process, in a sandbox, or after moving between them:

| Event               | What it records                                                                |
| ------------------- | ------------------------------------------------------------------------------ |
| `InputIncorporated` | A submitted batch the harness took into its context, after everything earlier. |
| `TextDelta`         | More text for one part of a streaming response.                                |
| `ReasoningDelta`    | More reasoning for one part of a streaming response.                           |
| `ResponseCompleted` | A finished response with every part, its finish reason, model, and usage.      |
| `ToolCallCompleted` | A tool call's result, whether the session ran the call or was given it.        |
| `Idle`              | Every input has its response, no call waits, and nothing waits to be taken in. |

A harness continues from a `Transcript.Value`: the history the turn chose, then the completed
entries its events recorded. `HarnessEvent.transcript(events, history)` builds it. It has three
kinds of item: `Input` attributed to its author, `Response` with text, reasoning, and tool-call
parts, and `ToolResult` answering one call. Deltas and `Idle` add nothing, so:

- a response that never completed leaves no item, and the next session asks again;
- a call running when its session stopped has no result, so it stays pending rather than running
  again, and whoever knows its outcome supplies it;
- incorporated input appears once, so continuing never submits it twice.

Recovering from a failure, moving to another environment, and retrying all prepare a fresh session
from the same transcript; there is no separate restore path.

`Transcript.summarize` checks the order every provider requires, which the `Transcript.Value`
schema also applies: each response's calls have unique IDs and are answered once, by results that
follow it before any other input or response. Only the last response's calls may be pending. It
reports those `pending` calls and whether the transcript `awaitsResponse`.

A part can carry `native` data that only the harness that recorded it can use, keyed by that
harness's name, such as a provider's signature over its reasoning that the same provider requires
back. Other harnesses ignore it; what a transcript means never depends on it.

Stored events are tagged unions encoded as JSON. Adding an event kind or an optional field keeps
old logs readable; changing what an existing field means does not. The tests round-trip every kind
through JSON.

## Sessions

`Harness.Interface<R>` names an implementation, declares its `Capabilities`, and starts sessions
that live until their scope closes. `R` is what sessions need from their environment, such as model
access. `StartOptions` carries the session ID, which prefixes the IDs a session assigns so they stay
unique across the sessions sharing one log, and the agent's instructions and `HarnessTool.Tools`.

A `Harness.Session` follows the core model's stages:

1. `prepare(transcript)` sets the conversation to continue, once, before anything else. It starts
   no work. An invalid transcript fails with `InvalidTranscript`; a harness that cannot continue it
   fails with `Unsupported`.
2. `submit(batch)` hands over input, which the session takes in once no call is waiting and before
   its next model request.
3. `resolve(callId, outcome)` answers a call the prepared transcript left pending, such as an
   environment switch completing in its destination. A call the session is running itself, or one
   that is not pending, fails with `NotPending`.
4. `resume` continues a transcript that awaits a response, and reports `Idle` when nothing is owed.

`events` reports everything in order to one consumer. It fails with `ExecutionFailed`, which says
whether the same work can be retried unchanged, and later operations fail with it too.

`Capabilities.transcript` says a harness prepares its context from any valid transcript, including
another harness's; `pendingToolCalls` says it takes a result for a call an earlier session left
pending. A harness that restores only its own native sessions declares neither.

`HarnessTool.Definition` describes a tool to the model with a JSON Schema for its parameters, and
`Tools.invoke` runs a call to an outcome. A tool's own failure is an outcome the model reads
(`HarnessTool.failure`), not an error; `Transcript.toolResult` pairs an outcome with its call.
