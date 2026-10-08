# Cluster

`@amends/cluster` runs **jobs**: work outside any request that a commit asks for and Effect Cluster
delivers, runs, and retries ([core's jobs](../core/README.md#jobs)). Its kind of job is the
**turn job**, one for each agent in each thread, which runs the agent's
[turns](../core/README.md#turns) there on [harness](../harness/README.md). Jobs enter
workspaces through the [gateway](../gateway/README.md)'s `inWorkspace`, as any caller without an
actor does. The [local host](../../hosts/local/README.md) runs them.

| Module                        | What it holds                                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `jobs/turn-job.ts`            | `TurnJob`: the `amends/TurnJob` entity, its `Run` and `Stop` requests, the requests commits store, and the worker for them. |
| `turns/runner.ts`             | `TurnRunner`: an agent's turns in one thread, run one at a time; see [running a turn](#running-a-turn).                     |
| `turns/session-log-writer.ts` | `SessionLogWriter`: what a run writes to its participation's session log.                                                   |
| `turns/agent.ts`              | `TurnAgent`: starting the session of the agent a turn runs, built from what core gives with the host's integrations.        |
| `turns/workspace.ts`          | `TurnWorkspace`: the workspace as a run calls it, each call entering it through the gateway for itself.                     |
| `jobs/pruning.ts`             | `JobPruning`, the hourly job that removes handled requests.                                                                 |

The package depends on Effect, core, the gateway, and the harness, sandbox, and
connection contracts. It knows no harness, model provider, or sandbox platform: the host
installs their integrations.

## Jobs

Each kind of job is a Cluster entity, and each job one entity instance, whose persisted
**requests** say what to do and when. A commit stores a request with itself, and the runner that
owns the entity handles it when it arrives. Cluster keeps an entity on one runner at a time, and
redelivers a request whose handling was cut short, so work resumes after a restart.

### Turn jobs

A turn job is one agent in one thread: an entity, `amends/TurnJob`, keyed by workspace, the agent's
membership, and the thread, whose requests ask it to run the agent's next turn (`Run`) or to stop
a turn (`Stop`). Its runs take turns, while a stop reaches the run in progress, so the entity takes
its requests side by side and its [turn runner](#running-a-turn) runs one turn at a time.

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

A request that fails is tried again where it is, after `TurnJob.retryDelays`, which doubles from
two seconds up to five minutes, until it holds or has failed `maxFailures` (eight) times in a row.
Then a run that accepted a turn gives the turn up, which fails it and is tried until it holds, so a
turn never stays active with nothing to run it; any other request is dropped, its work left for the
next request to find. The request stays unhandled in storage meanwhile, so one cut short as its
runner shuts down is left to Cluster, which delivers it again, and its tries start over. A request
whose workspace was never created is dropped at once. Failures are logged.

### Pruning

`JobPruning.layer({ prune, entityTypes, keep? })` removes the handled requests of the entity types
it is given, such as `TurnJob.entity.type`, with the pruning job's own past runs, once they are
older than `keep` (seven days by default), every hour on one runner, through `ClusterCron`. Cluster
removes neither, and only the host's storage knows how, so the host supplies `prune`. By then a
request's key no longer needs to stop a repeat, since nothing asks again days later, and requests
not yet handled are kept however old.

## Running a turn

`TurnRunner.make(job)` runs one agent's turns in one thread over `Gateway.Service` and the host's
`Integrations`. It calls the workspace through `TurnWorkspace`: core's `TurnExecution` and the
session log store as a run calls them, each call entering the workspace through the gateway for
itself, so the runner holds the workspace only while a call runs. `runNextTurn` runs one turn at
a time:

1. `accept` the agent's active turn in the thread, or a new one that accepts the work that waits;
   with neither, there is nothing to run.
2. `start` the turn, which answers `Idle` for a turn that ended as it stood, and otherwise `Ready`
   with the agent's `Runnable`, the prompt, and what its session resumes from.
3. Open the session log (`SessionLogWriter.open`): read the participation's log and write the run's
   opening, the turn's prompt, after the conversation the agent joined when the log is new
   (`joinedConversation`). A log that has the turn's prompt already, as a run cut short leaves it,
   gets `Interrupted` instead. The conversation before the turn, rebuilt from the log
   (`SessionLog.historyOf`), is what the session starts with, and the opening says what it resumes
   from: the turn as the agent that last started it keeps it, when that run's `Started` carries
   what continues the turn, with the steps the log has since, or else what the participation's
   last turn left.
4. Start the agent's session (`TurnAgent.startSession`), named for the participation: build the
   model's endpoint and the harness, from their connections' integrations with their keys, resume
   the sandbox named for the participation for an agent with one, or create it from the harness's
   template when it does not exist yet, and create the session, anew, or from what the opening
   says, with the conversation either way.
5. Stream the turn with the agent's instructions: a turn the agent kept continues after the steps
   the log has (`continueStream`), and any other starts from its prompt. What the run does with
   each part is one decision, `advance`: from the run's progress so far and the part, the entries
   to append to the log, the drafts to show, and the progress after it, which the loop keeps for
   the turn's end. The log notes `Started` once the first part of a run from the prompt arrives,
   with what continues the turn when the agent announces its start (`turn-start`). Each step that
   finishes is appended to the log, named by the run's opening position in the log and the step's
   index, and what a step writes before it finishes is shown to readers as drafts (`showDraft`),
   each carrying what a text part added since the last at its offset: at once, then at most every
   100 milliseconds, and when the text ends. Drafts are best effort, and the step's entry in the
   log replaces them. Recording a part is never cut short: a run stopped meanwhile stops between
   parts, so the progress kept matches the log.
6. End the turn: log the step it left unfinished, release the session (`detach`), and `close` it
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
its participation ends. A run never calls `suspendTurn`: a run cut short, as when its host died,
is continued by the next from what the agent announced at the turn's start, where the agent kept
the turn, and runs again from its prompt otherwise.

## Verify

```bash
bun run check
bun run test
```

`test/turns/runner.test.ts` runs turns over a workspace in memory, reached through a fake gateway,
with a scripted agent: the log a run writes, drafts, closing, failing, stopping, running a turn cut
short again, and a run another one replaced; it also checks `advance`, part by part, on its own.
`test/jobs/turn-job.test.ts` runs the entity on Cluster in memory: a commit's run and stop
requests, runs that fail and run again, giving a turn up, and a workspace never created.
`test/jobs/pruning.test.ts` checks that pruning runs every hour for the entity types it is given and
its own runs.
