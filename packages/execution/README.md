# Execution

`@amends/execution` runs the [turns](../core/README.md#turns) agents accept. `TurnRunner` runs one
turn with an agent's model access in a spawned [environment](../environment/README.md), and
`ClusterTurns` runs each turn as its own Effect Cluster entity. A host composes both over its
[gateway](../gateway/README.md), as the [local host](../../hosts/local/README.md#turns) does.

The package depends on Effect, core, the gateway, and the harness, environment, and connection
contracts. It knows no harness or model provider: the host passes in the ones it installs.

## Running a turn

`TurnRunner.layer({ harnesses, models })` provides a runner over `Gateway.Service` and
`Crypto.Crypto`. `harnesses` are the harnesses the host runs in process, found by name, and
`models` the model inference code behind its connections, found by implementation ID. A harness
here takes Effect AI's `LanguageModel`, which the connection's implementation builds from the
connection's settings and key.

`run(workspaceId, turnId)` takes the turn from where its last commit left it. Each step goes
through `gateway.executeTurns` as its own commit, attributed to the turn's agent:

1. `prepare` the turn. A finished turn is left as it is, one asked to stop is confirmed
   `stopped`, and one whose agent, connection, key, or environment is gone is failed with the
   reason `prepare` gives.
2. Fail the turn if its environment has a sandbox, its harness is not among `harnesses`, or its
   connection's implementation is not among `models`. Otherwise `start` a queued turn with the
   model access and environment it prepared with, which records them with the agent's
   instructions in the agent's log, and prepare again, since starting a participation's first turn
   records the thread's history there first.
3. Count the turn's attempts since it last got further, as its log records them: past `retries`
   (three), fail the turn with its latest interruption, or say it kept stopping. After an
   interruption worth retrying, and when a run begins after an attempt that died without recording
   why, as when its process did, wait 2, 4, then 8 seconds first and prepare again. Then record the
   `attempt`, a harness session or a summary.
4. When `prepare` proposes a checkpoint, record it first: the turn's model summarizes the older
   history and input (`Compaction.summarize`) in passes of up to 200,000 characters, each reading
   the summary so far, and the run prepares again. A pass that fails or stays silent past
   `idleTimeout` interrupts the run like a harness failure, so it is retried and then fails the
   turn; nothing is left out instead.
5. Spawn the environment with a new session ID and the instructions the turn started with, and prepare the
   harness with the transcript `prepare` gave, read from the agent's log for the thread, so a run
   continuing an interrupted turn repeats no input and asks for a fresh response in place of one
   left unfinished.
6. Hand the harness the input the turn has not taken in, what was asked of the turn itself and
   what it accepted from the thread, as one batch recorded as `submitted` first. A batch is named
   by its turn and the positions it follows and reaches, and its first record stands: submitting
   the same input again after a restart hands the harness the batch as recorded. Without new input, `resume` a conversation that awaits
   a response.
7. `report` what the environment and its harness report until the harness is idle: each completed
   block, finished response, tool start and result, and the environment becoming ready; text and
   reasoning deltas are not recorded. Text deltas are shown to the thread's readers instead, as
   drafts: at most every 150 milliseconds, each block's new text in pieces of up to 1,500
   characters, at the offset it continues. A block that completes first replaces its draft, and a
   draft that fails is not retried. Then `close` the turn, which publishes the replies it owes. When closing finds
   more input, the run submits what the agent accepted and continues in the same session, or
   waits while the agent is still accepting it, checking every second (`checkInterval`) for up to
   a minute (`inputWait`) before failing the turn.

While a session runs, the runner reads the turn every `checkInterval` and ends the session once
the turn is no longer running, as when someone asks it to stop; preparing again then confirms the
stop. While the harness waits on its model, a silence longer than `idleTimeout` (five minutes)
counts as the harness stopping, with a failure worth retrying, so a model that stops answering does
not hold the turn; time a tool call the harness started spends running does not count. A harness
that stops is recorded as `interrupted` in the turn's log, with its `problem`. When its failure is
worth retrying, the run prepares again and counts it as above, so a new session continues from the
log after a wait; otherwise it fails the turn. The count lives in the log, so a restart does not
reset it, and a turn whose runs keep dying with their process is given up too. Readers are told the failure's `problem` in words that name
the connection and model, such as "Anthropic didn't accept its API key." or "claude-sonnet-5 sent
nothing for 5 minutes."; a summary that fails says the earlier conversation couldn't be
summarized, and why. The harness's own reason, and a provider's message, which can name addresses
and request details, go to the host's logs only, as do why an environment did not start or a
transcript was refused. `abandon` fails a
turn that runs could not finish.

## Turns on Effect Cluster

Each turn is an entity, `amends/Turn`, keyed by workspace and turn, whose persisted `Run` asks it
to run. Cluster keeps an entity on one runner at a time, so a turn runs once at a time while
different turns run side by side, and redelivers a run cut short, so a turn continues after a
restart.

- `layerDispatch` provides the gateway's `WorkspaceTurns.Service`. Core asks for a run in the
  commit that creates or retries a turn, through a journal reaction to `TurnFacts.Created` and
  `TurnFacts.Retried`, and the request is keyed `created`, so a commit asks once. Sent inside the commit, it is stored in the commit's
  transaction when Cluster's message storage uses the workspace storage's SQL client, as with
  [background wakes](../gateway/README.md#background-work-on-effect-cluster).
- `layerWorker` registers the entity over a `TurnRunner.Service`. A run that fails before its
  turn finishes, such as when storage fails, asks to run again after a backoff that doubles from
  two seconds up to five minutes. After eight failed runs the worker abandons the turn, and a
  turn whose workspace was never created is dropped. Failures are logged.
- `layer` provides both. Every runner over the same storage runs the worker.

Handled runs are pruned with background wakes when the host passes `TurnEntity.type` to
`ClusterBackground.layerPruning`.

## Limits

Turns are conversation only. Agents have no tools, so a turn left waiting on a tool call fails,
and environments with a sandbox fail their turns. A turn records each completed block and what
the environment reported, and shows text still streaming to readers only as best-effort drafts,
each giving way to its block once logged. Stop requests are noticed by polling, within
`checkInterval`; a stopped response keeps only the blocks it completed.

## Verify

```bash
bun run check
bun run test
```

`test/runner.test.ts` runs the runner over turn execution in memory, amends's own harness, and a
scripted model: drafts as a response streams, a model gone silent interrupted until retries run out, a queued turn from start to reply with what the
environment reported, input accepted while it works and while it waits, each answer owed, stopping, retrying from the log, failing without retry, a sandbox environment, and turns
already finished or stopping. The [local host's](../../hosts/local/README.md#verify) `turns.test.ts`
runs a turn end to end over PostgreSQL and Cluster against a local chat-completions server.
