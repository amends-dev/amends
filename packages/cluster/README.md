# Cluster

`@amends/cluster` runs **jobs**: work outside any request that a commit asks for and Effect Cluster
delivers, runs, and retries ([core's jobs](../core/README.md#jobs)). Its kind of job is the
**turn job**, one for each agent in each thread, which runs the agent's
[turns](../core/README.md#turns) there on [harness-v2](../harness-v2/README.md). Jobs enter
workspaces through the [gateway](../gateway/README.md)'s `inWorkspace`, as any caller without an
actor does. No host runs turn jobs yet.

| Module                        | What it holds                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `jobs/turn-job.ts`            | `TurnJob`: the `amends/TurnJob` entity, its `Run`, `Stop`, and `GiveUp` requests, the requests commits store, and the worker for them. |
| `turns/runner.ts`             | `TurnRunner`: an agent's turns in one thread, run one at a time; see [running a turn](#running-a-turn).                                |
| `turns/session-log-writer.ts` | `SessionLogWriter`: what a run writes to its participation's session log.                                                              |
| `turns/agent.ts`              | `TurnAgent`: the agent's harness and sandbox, built from what core gives with the host's integrations.                                 |
| `turns/workspace.ts`          | `inWorkspace`, through which a run calls the workspace.                                                                                |
| `jobs/retry.ts`               | `JobRetry.delay`, the delay before a job's failed request runs again.                                                                  |
| `jobs/pruning.ts`             | `JobPruning`, the hourly job that removes handled requests.                                                                            |

The package depends on Effect, core, the gateway, and the harness-v2, sandbox-v2, and
connection-v2 contracts. It knows no harness, model provider, or sandbox platform: the host
installs their integrations.

## Jobs

Each kind of job is a Cluster entity, and each job one entity instance, whose persisted
**requests** say what to do and when. A commit stores a request with itself, and the runner that
owns the entity handles it when it arrives. Cluster keeps an entity on one runner at a time, and
redelivers a request whose handling was cut short, so work resumes after a restart.

### Turn jobs

A turn job is one agent in one thread: an entity, `amends/TurnJob`, keyed by workspace, the agent's
membership, and the thread, whose requests ask it to run the agent's next turn (`Run`), to stop a
turn (`Stop`), or to give up a turn its runs kept failing (`GiveUp`). Its runs take turns, while a
stop reaches the run in progress, so the entity takes its requests side by side and its
[turn runner](#running-a-turn) runs one turn at a time.

`TurnJob.layerRequests` provides core's `TurnJobs.Service`, through which core's reactions request
a run or a stop in the commit whose facts ask for it, keyed by the commit, so a commit that asks
twice asks once. Sent inside the commit, a request is stored in the commit's transaction when
Cluster's message storage uses the same SQL client as the workspace's storage; the host composing
them owns that. Cluster saves such a request and only notifies its runner best-effort, and its
notice comes before the commit can show the request, so `layerRequests` asks the commit's
`afterCommit` to have this process's runner read storage again (`Sharding.pollStorage`). A request
for a job another process runs waits for that process's next read, unless sockets carry it.
`TurnJob.layerWorker` registers the entity and handles its requests, and `TurnJob.layer` provides
both. Every runner over the same storage runs the worker, as Cluster requires of every entity type.

A request that fails asks for what `TurnJob.afterFailure` decides, keyed after its own: another
after `JobRetry.delay`, which doubles from two seconds up to five minutes, until it failed
`maxFailures` (eight) times in a row. Then a run that accepted a turn asks to give the turn up,
which fails it and is tried until it holds, so a turn never stays active with nothing to run it;
any other request is dropped, its work left for the next request to find. A request whose workspace
was never created is dropped, and one cut short as its runner shuts down is left to Cluster, which
delivers it again. Failures are logged.

### Pruning

`JobPruning.layer({ prune, entityTypes, keep? })` removes the handled requests of the entity types
it is given, such as `TurnJob.entity.type`, with the pruning job's own past runs, once they are
older than `keep` (seven days by default), every hour on one runner, through `ClusterCron`. Cluster
removes neither, and only the host's storage knows how, so the host supplies `prune`. By then a
request's key no longer needs to stop a repeat, since nothing asks again days later, and requests
not yet handled are kept however old.

## Running a turn

`TurnRunner.make(job)` runs one agent's turns in one thread over `Gateway.Service` and the host's
`Integrations`. Each call into the workspace is a step of core's `TurnExecution`, or a read or
append of the session log, through `inWorkspace`. `runNextTurn` runs one turn at a time:

1. `accept` the agent's active turn in the thread, or a new one that accepts the work that waits;
   with neither, there is nothing to run.
2. `start` the turn, which answers `Idle` for a turn that ended as it stood, and otherwise `Ready`
   with the agent's `Runnable`, the prompt's texts, and what its session resumes from.
3. Open the session log (`SessionLogWriter.open`): read the participation's log and write the run's
   opening, the turn's prompt, after the conversation the agent joined when the log is new
   (`joinedConversation`). A log that has the turn's prompt already, as a run cut short leaves it,
   gets `Interrupted` instead, and the turn runs again from that prompt. The conversation before
   the turn, rebuilt from the log (`SessionLog.historyOf`), is what the session starts with.
4. Build the agent (`TurnAgent.open`): the model's endpoint and the harness, from their connections'
   integrations with their keys, and, for an agent with a sandbox, the sandbox named for the
   participation, resumed, or created from the harness's template when it does not exist yet.
5. Start the session, named for the participation: anew, or from what the participation's last turn
   left, with the conversation either way.
6. Stream the turn with its prompt and the agent's instructions. Each step that finishes is
   appended to the log, named by the run's opening position in the log and the step's index, and
   what a step writes before it finishes is shown to readers as drafts (`showDraft`), each carrying
   what a text part added since the last at its offset: at once, then at most every 100
   milliseconds, and when the text ends. Drafts are best effort, and the step's entry in the log
   replaces them.
7. End the turn: log the step it left unfinished, let go of the session (`detach`), and `close` it
   with its answer (`SessionLog.answerOf`), `fail` it, when the agent reported a failure or its
   harness, model, connection, or sandbox failed, or `confirmStopped`, each keeping what the session
   resumes from.

`stopTurn(turnId)` stops the turn a run holds, which interrupts its stream, aborting the harness's
turn, and ends it as above; a turn no run holds is confirmed stopped as it stands. An append to the
log is never cut short. A run whose append finds the log past what it wrote was replaced by another
run of the turn, as when Cluster moved the job to another runner, and stops without ending the turn
(`SessionLogWriter.Superseded`). Any other failure of a step fails the run, for the job to run it
again. `giveUp` fails a turn the job could not run.

A session's sandbox is left running between turns; nothing stops an idle one or destroys it once
its participation ends. A turn `suspendTurn` cut short is not continued: a run cut short runs again
from its prompt.

## Verify

```bash
bun run check
bun run test
```

`test/turns/runner.test.ts` runs turns over a workspace in memory, reached through a fake gateway,
with a scripted agent: the log a run writes, drafts, closing, failing, stopping, running a turn cut
short again, and a run another one replaced. `test/jobs/turn-job.test.ts` runs the entity on Cluster
in memory: a commit's run and stop requests, runs that fail and run again, and giving a turn up.
`test/jobs/pruning.test.ts` checks that pruning runs every hour for the entity types it is given and
its own runs.
