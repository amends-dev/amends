# Harnesses in sandboxes

Status: agreed on 2026-10-02, not built. This plans how agents' turns run inside a sandbox, such as
amends's own harness or opencode on Daytona, so that adding another harness or sandbox provider
means adding one adapter. The [core model](core-model.md) states the ownership this follows.

## Goal

A turn whose agent's environment is Daytona with opencode runs through the ordinary flow: someone
asks the agent, it accepts the work into a turn, the turn runs, and the agent's reply is posted. The
turn survives its host restarting, and its conversation continues in a fresh sandbox. The same
end-to-end suite passes for the local and Daytona sandboxes with amends's harness and with opencode,
and the four runs differ only in the stored environment.

## How it works

The host talks to every harness that runs in a sandbox the same way: the
[harness contract](../packages/harness/README.md) itself, carried over Effect RPC. Inside the
sandbox, a runner that amends ships serves that contract and hosts the harness's adapter, which
drives the agent there and translates in both directions.

```text
host                                         sandbox
turn runner                                  runner (amends binary)
  └─ environment                               ├─ amends adapter: amends's loop, unchanged
       └─ remote harness ── Effect RPC ──────> ├─ opencode adapter: drives opencode
            prepare, submit, resolve, resume   └─ ACP adapter: any agent speaking ACP
            events, held until recorded
```

| Built once                                                         | Chosen by the stored environment                   |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| The environment: spawning, reacquiring, setup, retention           | The sandbox provider: local or Daytona             |
| The runner and its RPC server, which keeps events until recorded   | The harness adapter: amends or opencode            |
| The remote harness on the host                                     | The model connection: Anthropic, OpenAI-compatible |
| How the turn runner uses an environment, records, closes, recovers |                                                    |

Adding a harness means writing its adapter, passing the harness suite, and registering it; nothing
outside the adapter changes. Adding a sandbox provider means the same with the sandbox suite.

### The turn's log is the conversation

The turn's log is the only record of the conversation. A harness's `prepare` rebuilds the agent's own
session from the transcript every time, in that agent's format, such as opencode's session export,
and then loads it. Nothing relies on a session the agent kept, so a new turn, a retry, a crash, a
fresh sandbox, and a different harness all take the same path. A sandbox's files are separate: they
are kept when the sandbox is reacquired and lost when it is fresh. When they are lost, the agent is
told so in its input rather than led to assume them.

Agents' own formats are private and change between versions. Each adapter names the agent version the
environment's setup installs, and checks the conversation the agent replays when it loads a session
against what it wrote, failing with `Unsupported` when they differ.

### Lifetimes

A harness session lasts one attempt. The running environment lasts the turn's run and is released,
applying its retention, when the turn ends. The turn's log records the running environment it
acquired, so a later attempt or run reacquires the same sandbox rather than starting another.

## Acceptance

1. An environment created through the API or the Environments page runs a mentioned agent's turn,
   and its reply is posted. The turn's log shows the input taken in, the response's blocks, its tool
   calls, and the finished response; the text being written shows while it streams.
2. Asking the turn to stop ends the agent's work within seconds.
3. With its host killed partway through, the turn continues from another host, which reconnects to
   the runner. No input is submitted twice and no tool call runs twice.
4. With its sandbox destroyed partway through, the next attempt continues the conversation in a new
   sandbox, rebuilt from the log, and the agent is told its earlier files are gone.
5. A second message in the thread is answered knowing the first.
6. When the turn ends, the sandbox is stopped or destroyed as its environment's retention says.
7. Each adapter passes the harness suite. The end-to-end suite runs for every combination: the local
   sandbox with amends's harness and the local stand-in model in CI, and Daytona with a real model
   as an opt-in live suite.

Not in this goal: platform tools and the amends MCP endpoint, snapshots, moving a turn between
environments, Claude Code and Codex adapters, other sandbox providers, and opencode's own context
compaction, so a conversation longer than its model's window is not yet covered there.

## Decisions

- Daytona with amends's harness is built first, since both ends are ours; the goal is met when
  opencode passes the same suite.
- The model connection's key reaches the sandbox as an environment variable. A model proxy on the
  host, which gives the sandbox a base URL and a token for the turn instead, is the next goal.
- The host uploads its own build of the runner when it spawns an environment, unless the sandbox
  already has that version, so the runner and the host always agree.

## Milestones

1. The environment does its own work for in-process runs: it resolves the harness the host
   installed, configures the turn's model access, starts a session per attempt, and records what it
   acquired. Nothing visible changes, and the turn runner slims down.
2. The remote harness: the RPC contract, the runner with amends's adapter, and the host side, on the
   local sandbox in CI.
3. Recovery: the runner listens on a port with a token for the turn; reconnecting and resuming
   events; rebuilding into a fresh sandbox.
4. Daytona with a real model.
5. The opencode adapter, which proves the goal: only the adapter, its registration, and the stored
   environment change.
