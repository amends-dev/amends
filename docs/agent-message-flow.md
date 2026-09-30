# From a message to an agent's reply

This guide follows one path through the system: a person posts a message that asks an agent for
work, and the agent's reply appears in the thread. It names each step, the code that performs it,
the commit it happens in, and what hands control to the next step. The steps are joined by
published facts and stored requests, not by calls, so no single file reads from top to bottom;
this page is that reading.

It describes the implementation, checked against the code and against a run of the
[local host](../hosts/local/README.md) over PostgreSQL. The reasons for the design are in the
[core model](core-model.md), chiefly
[thread activity as the sole source of notifications](core-model.md#agreed-thread-activity-is-the-sole-source-of-notifications)
and [atomic turn creation and acknowledgment](core-model.md#turn-creation-and-notification-acknowledgment-are-atomic).
Each mechanism's own behavior is in the guide linked where it first appears.
[Known limitations](current-status.md) lists what turns do not do yet; agents have no tools, so a
turn is one conversation with a model.

## The path

| #   | Step                       | Runs in                                         | Commit               | Hands off through                                                                                       |
| --- | -------------------------- | ----------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | The person's request       | HTTP handler, then core                         | A                    | A pending notification for the agent, and a stored `Wake` for `turn.accept`, both written by commit A   |
| 2   | `turn.accept` wakes        | Cluster entity `amends/WorkspaceProcess`        | none                 | `TurnAcceptance.run`, which reads the agent's pending notifications                                     |
| 3   | The agent accepts the work | `TurnAcceptance`, acting as the agent           | B                    | A turn, the notifications settled as accepted, and a stored `Run` for the turn, all written by commit B |
| 4   | The turn runs              | Cluster entity `amends/Turn`, then `TurnRunner` | C, then one per step | The turn's log, which every step reads its next move from                                               |
| 5   | The turn closes            | `TurnExecution.close`                           | D                    | The reply message, `turn.completed`, and a stored `Wake` for `turn.accept`                              |
| 6   | `turn.accept` runs again   | As step 2                                       | none                 | Nothing, usually: it finds no work left                                                                 |
| 7   | Readers see each change    | Change feed, turn log stream, signals           | none                 | Client invalidation and the side panel's log                                                            |

Commits A to D are the commits that publish journal facts. Between C and D the runner also makes
a commit for each step it records, described in [step 4](#4-the-turn-runs).

A **person's** message asks the agents it reaches for work. An **agent's** message asks no other
agent, so agents do not wake one another.

## 1. The request (commit A)

`ThreadsHandlers` (`start` for a new thread, `publish` for a reply) enter the workspace through
`gateway.asMember` and call `ThreadApplication.startInGroup` or `ThreadMessageApplication.publish`
([server-http](../packages/server-http/README.md), [thread workflows](thread-workflows.md)).
Both end in `ThreadMessagePublication.publish`, inside one `journal.commit`:

1. The application authorizes the request. A message with no mentions addresses every current
   participant; with mentions, only the author and those mentioned. Mentioning an agent needs
   the author's `agent.use`; replying where it already takes part does not.
2. `ThreadActivityPublisher` takes the thread's next position and admits the participants the
   message selects, then runs the step `ThreadMessagePublication` supplies: it publishes
   `thread.message.published` and chooses the **recipients** of the activity, with one flag each,
   `requestsWork`. That flag is true for an agent recipient of a message whose author is not an
   agent. This is the one place the rule is decided.
3. `ThreadActivityRecording` publishes `thread.activity.recorded`, carrying the recipients.

Publishing that fact does two things in the same transaction, in this order
([journal](journal.md#live-projections)):

- **Projections** apply it. `NotificationProjection` inserts a notification for each recipient:
  `Pending` when `requestsWork`, and `Informational`, already settled, for an agent asked for
  nothing. The thread, group, and activity read models update.
- **Reactions** run after the projections ([journal](journal.md#reactions)). `turn.accept` is
  registered to wake on `thread.activity.recorded` when any recipient has `requestsWork`
  (`BackgroundProcess.on` in `TurnAcceptance.process`), so the reaction asks the host's
  `WorkspaceWakes` for a wake, once per process per commit. The host stores that wake as a
  **persisted Cluster message** for the entity `amends/WorkspaceProcess`, keyed by workspace and
  process name, with the primary key `commit:<commit id>`. The local host gives Cluster and the
  workspace storage one SQL client, so the message is a row written in the commit's own
  transaction ([gateway](../packages/gateway/README.md#background-work-on-effect-cluster)).

The wake is a reaction and not a projection because a projection also runs when a read model is
rebuilt from the journal, and a rebuild must not ask for work again. A reaction runs only when a
commit first publishes the fact. If commit A fails, none of it happened: no message, no
notification, no wake. If it succeeds, the wake exists. The HTTP response returns here; the agent
has not started.

## 2. `turn.accept` wakes

Cluster keeps an entity on one runner at a time and serves its messages one at a time. The
runner that owns the `amends/WorkspaceProcess` entity for this workspace and `turn.accept` picks
up the stored message when it next reads storage, every `pollInterval` (two seconds by default on
the local host), and `ClusterBackground.layerWorker` handles it:

1. `gateway.runBackground(workspaceId, "turn.accept")` leases the workspace's prepared runtime,
   booting it if need be.
2. `BackgroundRuns.run` runs the registered process once, as the system performer `turn.accept`.
   The process is `TurnAcceptance.run`.
3. The worker then asks for the next run from what the process left outstanding: `Continue` runs
   again at once, `At` at that time, `Idle` waits for the next wake.

The wake carries no work. A process finds what is outstanding from stored records each time, so
a late, repeated, or redelivered wake does no harm and a run after a restart is an ordinary run.
One entity per workspace and process means the process never runs against itself.

## 3. The agent accepts the work (commit B)

`TurnAcceptance.run` goes through each active agent's pending notifications a page at a time,
groups them by thread, and calls `acceptThread` for each thread in a commit of its own, **acting
as the agent**: the agent is the actor and the performer of everything in the commit. The commit
rechecks that the notifications are still pending and that the agent can still open the thread,
then:

- if the agent has an active turn on the thread, publishes `turn.input-accepted`, extending what
  the turn has accepted, unless that turn is `cancelling` or its participation ended (the agent
  left and came back, so the work belongs to its new participation), in which case the work waits
  for the turn to end;
- otherwise creates a turn: `turn.created`, with the input boundaries set from the agent's log,
  plus a `turn.created` activity on the thread (it informs no one).

`NotificationProjection` also handles `turn.created` and `turn.input-accepted`: it settles the
notifications as accepted into that turn in the same commit, so there is no state in which a turn
exists and its notification is still pending, or the reverse. Several pending notifications on a
thread join one turn.

A second reaction, `TurnDispatch.reactions` on `turn.created` and `turn.retried`, asks the host's
`WorkspaceTurns` to run the turn, which stores a persisted `Run` message for the entity
`amends/Turn`, keyed by workspace and turn, in this same transaction.

## 4. The turn runs

`ClusterTurns.layerWorker` handles the `Run` message on the turn's entity and calls
`TurnRunner.run` ([execution](../packages/execution/README.md)). Turns are separate entities, so
different turns run side by side while one turn runs once at a time.

The runner never touches storage. Every step goes through `gateway.executeTurns` to
`TurnExecution`, core's interface for the runner, and is a commit of its own, attributed to the
turn's agent. The runner decides the next step only from what `prepare` reads out of the turn and
its log:

| Step                             | What it records                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`                        | Nothing. Assembles the plan: instructions, model access, environment, transcript, pending input, attempts.                       |
| `start`                          | Commit C: the thread's history (the agent's first turn there) and `Started` in the turn's log, `turn.started`, and its activity. |
| `checkpoint`                     | A summary of older history, when the conversation would not fit the model's context.                                             |
| `attempt`                        | That a harness session, or a summary, is beginning. Attempts since the turn last got further are counted.                        |
| `submitted`                      | The batch of input handed to the harness, under a key of its range so a restart records it once.                                 |
| `report`                         | What the environment and harness produced: completed blocks, responses, tool results, the environment ready.                     |
| `draft`                          | Nothing durable: streaming text, as a `TurnDraft` signal for readers.                                                            |
| `interrupted`, `fail`, `stopped` | Why a run stopped short, or how the turn ended without a reply.                                                                  |
| `close`                          | Commit D, below.                                                                                                                 |

Between steps the runner spawns the agent's environment, prepares the harness with the transcript,
and waits on the model. None of that is inside a commit. The in-process amends harness runs over
Effect AI's `LanguageModel`, built from the agent's connection.

The turn's state is its **log**, kept per agent and participation apart from the journal. A run
keeps nothing in memory that it needs to continue, so a run cut short by a crash or restart is
redelivered by Cluster and continues from `prepare`. One run of a turn that took a single model answer made
four commits between C and D that touched only the turn's log: the attempt, the submitted batch,
and the reports.

## 5. The turn closes (commit D)

`TurnExecution.close` first checks that the turn is still running (a `cancelling` turn ends as
cancelled) and that all accepted input has been taken in with no work still waiting for the agent
on the thread; otherwise it returns `InputPending` and the runner submits the rest. Then, in one
commit:

1. Each reply the log says the turn owes is published as the agent's own message through the same
   `ThreadMessagePublication` as step 1, with the turn's ID on the message. Its recipients are the
   thread's other participants, and none of the agents among them is asked for work.
2. `TurnEnding.end` publishes `turn.completed`, records the `turn.ended` activity in the thread,
   and appends `Ended` to the agent's log.

The reply and the turn's completion become visible together or not at all. A turn can complete
without a reply. `turn.completed`, `turn.failed`, and `turn.cancelled` all wake `turn.accept`
(step 6) through the same reaction as step 1.

## 6. `turn.accept` runs again

Work that arrived while the turn was closing, or that waited because the turn was stopping, is
accepted now. Usually the run finds nothing and ends `Idle`.

## 7. What readers see

Every fact published in a commit reaches the workspace change feed, which the client maps to
the reads it invalidates ([live updates](live-updates.md)); the thread's timeline shows
`turn.created`, `turn.started`, the reply, and `turn.ended`, and the Agents page shows activity
([turns](turns.md)). Streaming text and typing are signals, not journal facts. A turn's log is
followed over its own stream.

## Other ways through

| Situation                                | What happens                                                                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another message while the turn works     | Steps 1 to 3 run again; `turn.input-accepted` extends the running turn, and `close` returns `InputPending` for what it has not taken in.                                                                      |
| Stop                                     | `TurnApplication.cancel` publishes `turn.cancel-requested`. A queued turn ends at once; a running one is noticed by the runner, which checks every `checkInterval` (one second), and confirms with `stopped`. |
| Retry                                    | `TurnApplication.retry` publishes `turn.retried` for a new queued turn, and the dispatch reaction stores its `Run`.                                                                                           |
| The agent leaves the thread or the group | `turn.stop-departed` wakes on the departure facts and stops the agent's active turns there.                                                                                                                   |
| An agent posts a message                 | Its recipients are informational for agents, so nothing wakes another agent.                                                                                                                                  |

## Failure and recovery

| Where                        | What happens                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit A fails               | Nothing is stored, including the wake.                                                                                                                               |
| Wake stored, nothing running | It stays unhandled in Cluster's storage until a runner owns the shard and reads it.                                                                                  |
| `turn.accept` run fails      | The worker asks for another run after a backoff that doubles from two seconds to five minutes. An unknown process is dropped after ten failed runs.                  |
| Commit B fails               | No turn, notifications still pending, no `Run`; the next run accepts them.                                                                                           |
| A turn's run fails           | The worker stores another `Run` after the same backoff; after eight failed runs it fails the turn (`abandon`), asking again with backoff until that is recorded.     |
| A turn's run is cut short    | Cluster redelivers it; the runner continues from the log. Interruptions worth retrying count against `retries` (three) in the log, so a restart does not reset them. |
| Model silent, context full   | The runner records the interruption, and retries or checkpoints; see [execution](../packages/execution/README.md#running-a-turn).                                    |

## Timing

Two runs of the local host, each asking an agent in a new thread with a scripted model that
answers at once, one with the host's default `pollInterval` and one with the host test's 100 ms.
Times are from the message being published:

| Step                       | `pollInterval` 100 ms | `pollInterval` 2 s (default) |
| -------------------------- | --------------------- | ---------------------------- |
| `turn.created` (commit B)  | 107 ms                | 1.76 s                       |
| `turn.started` (commit C)  | 203 ms                | 3.78 s                       |
| Reply published (commit D) | 280 ms                | 3.89 s                       |

In both runs the time before the reply was almost entirely the two Cluster hops, the wake and the
turn's `Run`, and each took about one poll interval; the steps inside the runner took tens of
milliseconds. Two measurements do not establish why: Cluster also notifies the runner when it
stores a message, which the [gateway guide](../packages/gateway/README.md#background-work-on-effect-cluster)
calls best effort. A real model adds its own time to step 4.

## Words that mean several things

| Word      | Meanings                                                                                                                                                                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run       | `BackgroundRuns.run(name)`, a host running a registered process once; a process's `run` effect; `TurnAcceptance.run`, `turn.accept`'s body; the `Run` message that asks a turn's entity to run; `TurnRunner.run`, running one turn to its end. |
| execution | `TurnExecution` in core, the interface the runner calls through the gateway; and the `@amends/execution` package, which holds `TurnRunner` and `ClusterTurns`.                                                                                 |
| process   | A `BackgroundProcess`: a workspace's sweep such as `turn.accept`. Not an operating system process, which other guides also call a process.                                                                                                     |
| wake      | A stored request for a `BackgroundProcess` to run (`BackgroundWakes`, the Cluster `Wake` message).                                                                                                                                             |
| dispatch  | A stored request for one turn to run (`TurnDispatch`, the Cluster `Run` message).                                                                                                                                                              |
| reaction  | What a commit does when it first publishes a fact, such as storing a wake. Not replayed. Projections are the replayed ones.                                                                                                                    |

## The two Cluster entities

|                  | `amends/WorkspaceProcess` (`ClusterBackground`, in gateway)      | `amends/Turn` (`ClusterTurns`, in execution)                                 |
| ---------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| One entity per   | Workspace and process                                            | Workspace and turn                                                           |
| Message          | `Wake`, keyed `commit:<id>` (and the time, for a later wake)     | `Run`, keyed `created`, or `retry:<n>`                                       |
| Runs             | A sweep: never two at once per workspace and process             | A turn: turns in parallel, each once at a time                               |
| After a run      | Schedules the next from `Idle`, `Continue`, or `At`              | Nothing, unless the run failed                                               |
| A run that fails | Retries without limit, with backoff                              | Retries eight times, then fails the turn, retrying that until it is recorded |
| Lives in         | Gateway, beside the `WorkspaceWakes` host contract it implements | Execution, since it needs `TurnRunner`, which gateway cannot depend on       |

## Where to change things

| To change                                     | Look at                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Which messages ask an agent for work          | `requestsWork` in `ThreadMessagePublication`; how it becomes a notification, `Notification.generated` |
| When a process wakes                          | `wakesOn` in `TurnAcceptance.process`; processes are registered in `Core.processes`                   |
| How work is accepted into turns               | `acceptThread` in `TurnAcceptance`                                                                    |
| Which facts run reactions                     | `reactions` given to `Journal.layer` in `core.ts`                                                     |
| How a turn runs                               | `TurnRunner.run`, and the step it calls in `TurnExecution`                                            |
| How the reply is published, and the turn ends | `TurnExecution.close`, `TurnEnding`                                                                   |
| Retry, backoff, pruning of wakes and requests | `ClusterBackground`, `ClusterTurns`                                                                   |
| What the host supplies                        | `LocalHost.layer`: `layerWakes`, `layerDispatch`, and the two workers                                 |

To find what reacts to a fact, find references to its constant, such as `ThreadActivityFacts.Recorded`:
projections, reactions, the change feed, and `wakesOn` triggers all name it.

## Tests that pin the path

- `hosts/local/test/turns.test.ts` runs the path over PostgreSQL and Cluster: the question, the
  reply, and the timeline's `turn.created`, `turn.started`, reply, `turn.ended`.
- `hosts/local/test/background.test.ts` checks a wake is stored with its commit and not if the
  commit rolls back.
- `packages/gateway/test/cluster-background.test.ts` covers wake dedupe, rescheduling, backoff,
  dropping, and pruning.
- `packages/execution/test/runner.test.ts` runs the runner over turn execution in memory.
