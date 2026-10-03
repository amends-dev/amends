# Harness conformance

Test suites for the [harness contract](../harness/README.md), run by every harness against itself,
so a new harness passes the same tests as the ones in this repository. The package depends on
Effect, `@effect/vitest`, and the contract; the harness's subject supplies the harness and its
model.

## Running the suites

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

## Suites

| Suite          | Covers                                                                                                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`     | Input answered in a new session and attributed to its author, instructions reaching the model, input submitted while it works taken in order before it is idle, the order of operations, and a refused key.      |
| `continuation` | Answering the input a transcript ends with in its context, tool calls and results another harness recorded reaching the model, idleness when nothing is owed, a transcript out of order, and pending tool calls. |
