# Amends harness

`@amends/harness-amends` is amends's own harness: an agent loop that runs in process over Effect
AI's `LanguageModel`. It implements the [harness contract](../harness/README.md) and records the
same events any other harness would, so its work can continue in another session, environment, or
harness that accepts a transcript.

`AmendsHarness.make()` returns a `Harness.Interface<LanguageModel.LanguageModel>`. Sessions use the
`LanguageModel` in their context, so model access is whatever provider layer the environment supplies
for the agent's connection and model; the harness itself depends on no provider. It declares both
capabilities: it continues any valid transcript and takes results for calls left pending.

## The loop

A session works whenever its transcript awaits a response:

1. Once no tool call is waiting, it takes in every submitted batch, in order, reporting
   `InputIncorporated` for each. Input submitted while a response streams or tools run waits for
   the next such point, so it joins the following request rather than starting another.
2. It streams one response, reporting text and reasoning deltas, then `ResponseCompleted`.
3. It runs the response's tool calls concurrently through `Tools.invoke`, reporting each
   `ToolCallCompleted` as it finishes, and goes back to step 1.
4. When nothing is owed, it reports `Idle` once.

The loop runs calls itself rather than letting Effect AI resolve them, so it records every outcome
and can leave a call unanswered: a call still running when the session's scope closes has no
result, and the next session receives it through `resolve`. Transfer and recovery rely on this.

## Translation

Each request is built from the transcript alone: the instructions as a system message, each input
as a user message starting with its author's name, each response as an assistant message, and each
run of tool results as one tool message. A tool result's value is its `structured` JSON, or else its
text.

Response parts keep the provider metadata Effect AI attached to them as native data under
`amends`, and each request returns it as that part's options. Providers need this to continue
exactly; Anthropic, for example, requires its signature over earlier reasoning when a tool loop
continues. The tests check that a session prepared from events stored as JSON sends the same request
the failed session would have sent, signature included.

## Declaration

`AmendsHarness.declaration` is what a host registers: placement `in-process` only, and
`LanguageModel` model access, so any model connection the host installed works. It declares no
reasoning levels, since the loop requests none.

## Limits

- A response the harness cannot record stops the session with `ExecutionFailed`: a part carrying a
  call its provider ran, a file, a source, or an approval request.
- A call to a tool the session did not offer fails Effect AI's decoding of the response, so the
  session stops rather than telling the model. Effect AI classifies this as retryable.
- Tools are declared from JSON Schema through `Tool.dynamic`; nothing checks a call's parameters
  against that schema before `invoke`.
- Whether each provider accepts history containing calls to tools a later session no longer offers
  is not verified. Moving between environments whose tools differ may need those tools declared.
