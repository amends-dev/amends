# From a message to an agent's reply

> **Historical.** This describes the path before turns moved to harness-v2: through the agent job,
> `AgentWork`, and the turn runner, which no longer exist. [Core's turns](../packages/core/README.md#turns)
> describe the turn flow now, and [known limitations](current-status.md) what does not run yet.

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

| #   | Step                       | Runs in                                      | Commit               | Hands off through                                                                                       |
| --- | -------------------------- | -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | The person's request       | HTTP handler, then core                      | A                    | A pending notification for the agent, and an `AcceptWork` request for its agent job, both written by A  |
| 2   | The agent's job runs       | Agent job `amends/AgentJob`                  | none                 | `AgentWork.acceptWork`, through `gateway.inWorkspace`, which reads the agent's pending notifications    |
| 3   | The agent accepts the work | `AgentWork.acceptWork`, as the agent         | B                    | A turn, the notifications settled as accepted, and a stored `Run` for the turn, all written by commit B |
| 4   | The turn runs              | Turn job `amends/TurnJob`, then `TurnRunner` | C, then one per step | The turn's log, which every step reads its next move from                                               |
| 5   | The turn closes            | `TurnExecution.close`                        | D                    | The reply message, `turn.completed`, and an `AcceptWork` request for the agent's job                    |
| 6   | The agent's job runs again | As step 2                                    | none                 | Nothing, usually: it finds no work left                                                                 |
| 7   | Readers see each change    | Change feed, turn log stream, signals        | none                 | Client invalidation and the side panel's log                                                            |

Commits A to D are the commits that publish journal facts. Between C and D the runner also makes
a commit for each step it records, described in [step 4](#4-the-turn-runs).

A **person's** message asks the agents it reaches for work. An **agent's** message asks no other
agent, so agents do not wake one another.

## 1. The request (commit A)

`ThreadsHandlers` (`start` for a new thread, `publish` for a reply) enter the workspace through
`gateway.asMember` and call `ThreadService.startInGroup` or `ThreadMessageService.publish`
([server-http](../packages/server-http/README.md), [thread workflows](thread-workflows.md)).
Both end in `ThreadCommand.publishMessage`, inside one `journal.commit`:

1. The application authorizes the request. A message with no mentions addresses every current
   participant; with mentions, only the author and those mentioned. Mentioning an agent needs
   the author's `agent.use`; replying where it already takes part does not.
2. `ThreadCommand.publishActivity` takes the thread's next position and admits the participants
   the message selects, then runs the step `publishMessage` supplies: it publishes
   `thread.message.published` and chooses the **recipients** of the activity, with one flag each,
   `requestsWork`. That flag is true for an agent recipient of a message whose author is not an
   agent. This is the one place the rule is decided.
3. The activity is recorded: `thread.activity.recorded`, carrying the recipients.

Publishing that fact does two things in the same transaction, in this order
([journal](journal.md#live-projections)):

- **Projections** apply it. `NotificationProjection` inserts a notification for each recipient:
  `Pending` when `requestsWork`, and `Informational`, already settled, for an agent asked for
  nothing. The thread, group, and activity read models update.
- **Reactions** run after the projections ([journal](journal.md#reactions)). For each agent
  recipient with `requestsWork`, `AgentJobs.reactions` requests `AcceptWork` from the host's
  `AgentJobs`: the agent's **job**, naming the workspace the fact belongs to and the agent by its
  membership. The host stores that request as a **persisted Cluster message**, an `AcceptWork`
  for the entity `amends/AgentJob`, keyed by workspace and the agent's membership, with the
  primary key `commit:<commit id>`. The local host gives Cluster and the workspace storage one SQL
  client, so the message is a row written in the commit's own transaction
  ([cluster](../packages/cluster/README.md)).

The request is a reaction and not a projection because a projection also runs when a read model is
rebuilt from the journal, and a rebuild must not ask for work again. A reaction runs only when a
commit first publishes the fact. If commit A fails, none of it happened: no message, no
notification, no request. If it succeeds, the request exists. The HTTP response returns here; the agent
has not started.

## 2. The agent's job runs

Cluster keeps an entity on one runner at a time and serves its messages one at a time. Once
commit A is done, its `afterCommit` has the local runner read storage, and the runner that owns
this agent's `amends/AgentJob` entity picks up the stored request; `AgentJob.layerWorker` handles
it. Without that read it would wait for the runner's next poll, every `pollInterval` (two seconds
by default on the local host), since Cluster's own look, made as it stored the message, came
before the commit could show it:

1. `gateway.inWorkspace(workspaceId, …)` leases the workspace's prepared runtime, booting it if
   need be, as it does for any caller without an actor.
2. The program calls `AgentWork.acceptWork` for the request's agent.
3. If that fails, the worker asks for the request again after a delay.

The request carries no work. `acceptWork` finds the agent's pending notifications from stored
records each time, so a late, repeated, or redelivered request does no harm and a run after a
restart is an ordinary run. One entity per agent means an agent's work is never done twice at
once, while different agents' work goes on side by side.

## 3. The agent accepts the work (commit B)

`AgentWork.acceptWork` goes through the agent's pending notifications a page at a time, groups
them by thread, and calls `acceptThreadNotifications` for each thread in a commit of its own,
**acting as the agent**: the agent is the actor and the performer of everything in the commit. The commit
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

A second reaction, `TurnJobs.reactions` on `turn.created` and `turn.retried`, requests the turn's
**turn job** from the host's `TurnJobs`, which stores a persisted `Run` message for the
entity `amends/TurnJob`, keyed by workspace and turn, in this same transaction.

## 4. The turn runs

`TurnJob.layerWorker` handles the `Run` message on the turn's entity and calls
`TurnRunner.run` ([cluster](../packages/cluster/README.md)). Turns are separate entities, so
different turns run side by side while one turn runs once at a time.

The runner never touches storage. Every step goes through `gateway.inWorkspace` to
`TurnExecution`, core's service for turn jobs, and is a commit of its own, attributed to the
turn's agent. The runner decides the next step only from what `prepare` reads out of the turn and
its log:

| Step                                           | What it records                                                                                                                  |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `prepare`                                      | Nothing. Assembles the plan: instructions, model access, environment, transcript, pending input, attempts.                       |
| `start`                                        | Commit C: the thread's history (the agent's first turn there) and `Started` in the turn's log, `turn.started`, and its activity. |
| `recordCheckpoint`                             | A summary of older history, when the conversation would not fit the model's context.                                             |
| `recordAttempt`                                | That a harness session, or a summary, is beginning. Attempts since the turn last got further are counted.                        |
| `recordSubmission`                             | The batch of input handed to the harness, under a key of its range so a restart records it once.                                 |
| `recordEnvironment`                            | The running environment the run's sessions work in, and where its files came from, so a later run acquires it again.             |
| `recordSession`                                | The ID of the harness session a run starts, before starting it, so a run that comes back attaches to it.                         |
| `recordEvents`                                 | What the harness produced: completed blocks, responses, tool results.                                                            |
| `showDraft`                                    | Nothing durable: streaming text, as a `TurnDraft` signal for readers.                                                            |
| `recordInterruption`, `fail`, `confirmStopped` | Why a run stopped short, or how the turn ended without a reply.                                                                  |
| `close`                                        | Commit D, below.                                                                                                                 |

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
   `ThreadCommand.publishMessage` as step 1, with the turn's ID on the message. Its recipients are the
   thread's other participants, and none of the agents among them is asked for work.
2. `TurnCommand.endTurn` publishes `turn.completed`, records the `turn.ended` activity in the thread,
   and appends `Ended` to the agent's log.

The reply and the turn's completion become visible together or not at all. A turn can complete
without a reply. `turn.completed`, `turn.failed`, and `turn.cancelled` each name the turn's agent,
and request `AcceptWork` for its job (step 6) through `AgentJobs.reactions`, as step 1 did.

## 6. The agent's job runs again

Work that arrived while the turn was closing, or that waited because the turn was stopping, is
accepted now. Usually it finds nothing.

## 7. What readers see

Every fact published in a commit reaches the workspace change feed, which the client maps to
the reads it invalidates ([change feed](change-feed.md)); the thread's timeline shows
`turn.created`, `turn.started`, the reply, and `turn.ended`, and the Agents page shows activity
([turns](turns.md)). Streaming text and typing are signals, not journal facts. A turn's log is
followed over its own stream.

## Other ways through

| Situation                                | What happens                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another message while the turn works     | Steps 1 to 3 run again; `turn.input-accepted` extends the running turn, and `close` returns `InputPending` for what it has not taken in.                                                                         |
| Stop                                     | `TurnService.cancel` publishes `turn.cancel-requested`. A queued turn ends at once; a running one is noticed by the runner, which checks every `checkInterval` (one second), and confirms with `confirmStopped`. |
| Retry                                    | `TurnService.retry` publishes `turn.retried` for a new queued turn, and the turn job reaction stores its `Run`.                                                                                                  |
| The agent leaves the thread or the group | The departure requests `StopDepartedTurns` for the agent's job, which stops its active turns where it no longer takes part.                                                                                      |
| An agent posts a message                 | Its recipients are informational for agents, so nothing wakes another agent.                                                                                                                                     |

## Failure and recovery

| Where                           | What happens                                                                                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit A fails                  | Nothing is stored, including the request.                                                                                                                            |
| Request stored, nothing running | It stays unhandled in Cluster's storage until a runner owns the shard and reads it.                                                                                  |
| The agent's job fails           | The worker asks for the request again after a backoff that doubles from two seconds to five minutes.                                                                 |
| Commit B fails                  | No turn, notifications still pending, no `Run`; the agent job's retry accepts them.                                                                                  |
| A turn's run fails              | The worker stores another `Run` after the same delay; after eight failed runs it stores an `Abandon`, which fails the turn, asking again until that is recorded.     |
| A turn's run is cut short       | Cluster redelivers it; the runner continues from the log. Interruptions worth retrying count against `retries` (three) in the log, so a restart does not reset them. |
| Model silent, context full      | The runner records the interruption, and retries or checkpoints; see [cluster](../packages/cluster/README.md).                                                       |

## Timing

The local host with its default `pollInterval` of two seconds, asking an agent in a new thread
four times with a scripted model that answers at once. Times are from the message being
published, before and after the Cluster senders read storage again once their commit is done:

| Step                       | Before         | After        |
| -------------------------- | -------------- | ------------ |
| `turn.created` (commit B)  | 30 ms to 1.9 s | 36 to 59 ms  |
| `turn.started` (commit C)  | 1.9 to 3.9 s   | 68 to 92 ms  |
| Reply published (commit D) | 2.0 to 4.0 s   | 94 to 193 ms |

Before, each Cluster hop, the request for the agent's job and the turn job's `Run`, usually took
until the runner's next poll. Cluster notifies the runner as it stores a message, but inside the commit's transaction, so
the runner's read, on another connection, came before the commit and found nothing; it found
the message only when the commit happened to finish first. Now `afterCommit` has the runner read
again once the commit is done, and the steps inside the runner take tens of milliseconds. A real
model adds its own time to step 4.

## The two kinds of job

|                  | Agent job: `AgentJob`, entity `amends/AgentJob`                           | Turn job: `TurnJob`, entity `amends/TurnJob`                                 |
| ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| One job per      | Workspace and agent                                                       | Workspace and turn                                                           |
| Requests         | `AcceptWork` and `StopDepartedTurns`, keyed `commit:<id>` or `retry:<id>` | `Run`, keyed `created` or `retry:<n>`; `Abandon`, keyed `abandon:<n>`        |
| Runs             | `AgentWork` for one agent: agents in parallel, each once at a time        | A turn: turns in parallel, each once at a time                               |
| A run that fails | Retries without limit, after `JobRetry.delay`                             | Retries eight times, then asks to `Abandon` the turn, until that is recorded |
| Lives in         | `@amends/cluster` (`jobs/agent-job.ts`), implementing core's `AgentJobs`  | `@amends/cluster` (`jobs/turn-job.ts`), implementing core's `TurnJobs`       |

## Where to change things

| To change                                     | Look at                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Which messages ask an agent for work          | `requestsWork` in `ThreadCommand.publishMessage`; how it becomes a notification, `Notification.fromActivity` |
| Which facts request an agent's job            | `AgentJobs.reactions` in core's `turn/agent-jobs.ts`                                                         |
| How work is accepted into turns               | `acceptThreadNotifications` in `AgentWork`                                                                   |
| Which facts run reactions                     | `reactions` given to `Journal.layer` in `core.ts`                                                            |
| How a turn runs                               | `TurnRunner.run`, and the step it calls in `TurnExecution`                                                   |
| How the reply is published, and the turn ends | `TurnExecution.close`, `TurnCommand.endTurn`                                                                 |
| Retry, delay, pruning of job requests         | `AgentJob`, `TurnJob`, `JobRetry`, `JobPruning`                                                              |
| What the host supplies                        | `LocalHost.layer`: each job's `layerRequests` and `layerWorker`, and `JobPruning.layer`                      |

To find what reacts to a fact, find references to its constant, such as `ThreadActivityFacts.Recorded`:
projections, reactions, and the change feed all name it.

## Tests that pin the path

- `hosts/local/test/turns.test.ts` runs the path over PostgreSQL and Cluster: the question, the
  reply, and the timeline's `turn.created`, `turn.started`, reply, `turn.ended`.
- `hosts/local/test/jobs.test.ts` checks an agent job request is stored with its commit and not if
  the commit rolls back, and runs once the commit is done rather than at the next poll.
- The storage conformance `turns` suite does the agent work its commits request, so it checks
  which facts request which work for which agent.
- `packages/cluster/test/jobs/agent-job.test.ts` covers request dedupe, retry delays, and
  dropping; `turn-job.test.ts` covers turn retries and abandoning; `pruning.test.ts` covers
  pruning.
- `packages/cluster/test/runner/runner.test.ts` runs the runner over turn execution in memory.
