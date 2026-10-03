# ACP harnesses

`@amends/harness-acp` implements the [harness contract](../../packages/harness/README.md) over
coding agents that speak the [Agent Client Protocol](https://agentclientprotocol.com), such as
opencode, codex-acp, or claude-agent-acp. The agent is the ACP server and runs its own loop, tools,
and model calls; this package is the client. It runs the agent as a process in the sandbox for each
session, hands it input as prompts, and records what it reports as the events every harness
records. Its first agent is opencode.

| Module            | What it holds                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `AcpProtocol`     | The parts of the protocol this client reads, as schemas that ignore what an agent adds.                |
| `AcpConnection`   | JSON-RPC 2.0 over the agent's standard input and output, a message per line.                           |
| `AcpTranslation`  | What the agent reports while it answers a prompt, as harness events.                                   |
| `AcpHarness`      | The harness over any agent: running it, setting up its session, prompts, failures, and ending it.      |
| `OpenCodeHarness` | opencode: its declaration, its configuration for a session, and conversations written as its sessions. |

## Sessions

`AcpHarness.make(agent, workdir)` makes a harness whose sessions work in `workdir`. A session needs
the model endpoint (`ModelInference.Endpoint`) and the machine's processes and files
(`AcpHarness.Services`); the [harness server](../../packages/environment/README.md#the-harness-server)
provides both. An agent supplies its declaration, the release it is written for, and
`prepareRun`, which configures a run for the session's endpoint and instructions in a directory of
the session's own: the command, its environment, and how to write a conversation as one of the
agent's sessions.

Preparing starts the agent and checks that it reports the release the harness was written for. An
empty transcript opens a new session (`session/new`). Otherwise the harness writes the transcript,
up to the input that ends it, as a session of the agent's own, loads it (`session/load`), and
checks that the agent replayed each message as written; anything else is `Unsupported`. The input
that ends the transcript is the first prompt when the session resumes.

Each prompt carries every input submitted since the last, each attributed as `Name: text`, and
reports `InputIncorporated` for each batch. When the agent answers it, the last response finishes
and the session is idle unless more input waits. Every permission the agent asks for is granted:
the sandbox is the boundary.

A session ends by cancelling its prompt and ending the agent's input, which ends an ACP agent; one
still running two seconds later is signalled, and killed two seconds after that. The agent's
refusal of a prompt fails the session with the problem its words name, such as `model-access` for
a refused key; its output ending fails it as `ended`, to try again.

## From updates to events

An agent reports a prompt's work as pieces of messages and as tool calls it runs itself. A response
is one model request's output: the pieces of one message (the agent's `messageId`) and the calls it
made. Another message, or a piece after a call's result, starts the next response, since a model
sees results only in its next request; the prompt's end finishes the last, with its stop reason and
usage.

A call is reported once it runs, with its input; its result is its output, or its error when it
failed. ACP gives a call's kind, such as `execute` or `edit`, rather than the agent's name for the
tool, so a call is named by its kind unless the agent names it.

## opencode

`OpenCodeHarness.make(workdir)` runs `opencode acp` from the `PATH`, which must be release
`OpenCodeHarness.version` (1.18.23): sessions fail otherwise. It calls the model itself over
Anthropic's messages API or a chat-completions API at the connection's base URL. Its configuration
enables that provider alone, grants every permission except asking questions or switching modes,
and turns off sharing, updates, snapshots, title requests, and compaction. Everything it stores
goes in the session's directory, and it fetches nothing at start: its bundled model catalog stands
in for models.dev, and it installs no plugins.

A conversation becomes an opencode session in its export format, which `opencode import` reads:
each input a user message, and each response an assistant message answering the input before it.
Earlier tool calls and their results are written into the response's text, since opencode runs its
own tools under other names, and reasoning is left out. A transcript that starts with a response
is `Unsupported`.

On Daytona, whose image has another opencode installed globally, an environment's setup installs
the pinned release:

```sh
sudo env "PATH=$PATH" npm install --global opencode-ai@1.18.23
```

## Testing

The tests run the [harness conformance suites](../../packages/harness-conformance/README.md)
against opencode with a model behind a local chat-completions server, and a test where that model
has opencode run a command. They need opencode 1.18.23 on the `PATH` and skip without it:

```sh
curl -fsSL https://opencode.ai/install | bash -s -- --version 1.18.23
bun run test adapters/harness-acp/test
```
