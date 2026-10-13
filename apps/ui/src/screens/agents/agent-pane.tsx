import { For, Match, Show, Switch, createUniqueId } from "solid-js"
import { Button } from "../../components/button/index.ts"
import { Divider } from "../../components/divider/index.ts"
import { EmptyState } from "../../components/empty-state/index.ts"
import { Field } from "../../components/field/index.ts"
import { Input } from "../../components/input/index.ts"
import { Notice } from "../../components/notice/index.ts"
import { TurnActivity } from "../../components/turn-status/index.ts"
import { calendarDate } from "../../internal/when.ts"
import { Pane } from "../../patterns/pane/index.ts"
import { Shell } from "../../patterns/shell/index.ts"
import * as s from "./agents.css.ts"
import { SetupFields, type SetupFieldsProps } from "./setup-fields.tsx"
import {
  AgentsAlert,
  agentStatus,
  issueMessage,
  setupProblems,
  turnStateWord,
  type AgentSummary,
  type AgentTurn,
  type AgentsAction,
  type AgentsFailure
} from "./wording.tsx"

export interface AgentPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string
  /** The agent, once it has loaded. */
  readonly agent?: AgentSummary
  /** In place of the page, while it loads or when it cannot show. */
  readonly status?: "loading" | "failed" | "unavailable"
  readonly onRetry?: () => void
  /** Opens the full list of agents, from one that is gone. */
  readonly onBrowse?: () => void
  /** The name being edited. */
  readonly name: string
  readonly onNameChange: (name: string) => void
  /** The name differs from the saved one and can be saved. */
  readonly nameChanged: boolean
  readonly onSaveName: () => void
  /** The setup being edited, with what each part may be. */
  readonly setup: Omit<SetupFieldsProps, "problems" | "disabled">
  /** The setup differs from the saved one and can be saved. */
  readonly setupChanged: boolean
  readonly onSaveSetup: () => void
  /** Puts the saved setup back in place of the edits. */
  readonly onDiscardSetup: () => void
  /** Asks to remove the agent from the workspace. */
  readonly onRemove?: () => void
  /** Its turns in progress, each where it works. */
  readonly turns?: ReadonlyArray<AgentTurn>
  /** The change running, if any. */
  readonly pending?: AgentsAction | "refresh"
  /** A failed change made here, or a read that failed. */
  readonly failure?: AgentsFailure
  readonly onRefresh?: () => void
}

/**
 * An agent's page in the main content, in one column: a notice when it can't run as it is set up,
 * listing why; its name as its own save; its setup, saved as a whole; its details, with where it is
 * at work, each turn opening its log; and removal. A reader who may not configure it sees the same
 * values without the actions.
 */
export function AgentPane(props: AgentPaneProps) {
  const nameForm = `agent-name-${createUniqueId()}`
  const setupForm = `agent-setup-${createUniqueId()}`
  const configurable = () => props.agent?.configurable ?? false
  const busy = () => props.pending !== undefined
  const alert = (action: AgentsAction | "refresh") => (
    <Show when={props.failure?.action === action && props.failure}>
      {(failure) => (
        <AgentsAlert failure={failure()} onRefresh={props.onRefresh} refreshing={props.pending === "refresh"} />
      )}
    </Show>
  )
  const problems = () => (props.failure?.action === "configure" ? setupProblems(props.failure) : undefined)
  return (
    <Pane.Root class={s.pane}>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title
          person={
            props.agent && {
              name: props.agent.name,
              initials: props.agent.name.trim().charAt(0).toUpperCase(),
              tone: "lilac"
            }
          }
          status={props.agent && agentStatus(props.agent.issues, props.agent.activity)}
          context={props.workspaceName}
        >
          {props.agent?.name ?? "Agent"}
        </Pane.Title>
      </Pane.Header>
      <Switch>
        <Match when={props.status === "loading"}>
          <Pane.Body>
            <p class={s.visuallyHidden} role="status">
              Loading agent…
            </p>
          </Pane.Body>
        </Match>
        <Match when={props.status === "unavailable"}>
          <Pane.Body>
            <EmptyState
              art="held-back"
              title="Agents aren’t available"
              lines={["You may no longer be a member of this workspace."]}
            />
          </Pane.Body>
        </Match>
        <Match when={props.status === "failed"}>
          <Pane.Body>
            <EmptyState art="came-apart" title="Couldn’t load agents" lines={["Try again once the host is reachable."]}>
              <Show when={props.onRetry}>{(retry) => <Button onClick={() => retry()()}>Retry</Button>}</Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={!props.agent}>
          <Pane.Body>
            <EmptyState
              art="lost-thread"
              title="This agent isn’t here"
              lines={["It may have been removed, or you can no longer see it."]}
            >
              <Show when={props.onBrowse}>
                {(browse) => <Button onClick={() => browse()()}>Show all agents</Button>}
              </Show>
            </EmptyState>
          </Pane.Body>
        </Match>
        <Match when={props.agent}>
          {(agent) => (
            <Pane.Body>
              <Pane.Column>
                <Show when={agent().issues.length > 0}>
                  <Notice title="This agent can’t run as it is set up">
                    <ul class={s.issues}>
                      <For each={agent().issues}>{(issue) => <li>{issueMessage(issue)}</li>}</For>
                    </ul>
                  </Notice>
                </Show>
                {alert("refresh")}
                {alert("remove")}
                <form
                  id={nameForm}
                  class={s.form}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (props.nameChanged && !busy()) props.onSaveName()
                  }}
                >
                  <Field.Root>
                    <Field.Label>Agent name</Field.Label>
                    <Input
                      value={props.name}
                      onInput={(event) => props.onNameChange(event.currentTarget.value)}
                      maxLength={80}
                      disabled={!configurable() || busy()}
                      required
                    />
                  </Field.Root>
                  {alert("rename")}
                  <Show when={configurable()}>
                    <Button type="submit" class={s.start} disabled={!props.nameChanged || busy()}>
                      Save name
                    </Button>
                  </Show>
                </form>
                <form
                  id={setupForm}
                  class={s.form}
                  aria-label="Setup"
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (props.setupChanged && !busy()) props.onSaveSetup()
                  }}
                >
                  <Heading>Setup</Heading>
                  <SetupFields {...props.setup} problems={problems()} disabled={!configurable() || busy()} />
                  {alert("configure")}
                  <Show when={configurable()}>
                    <div class={s.actions}>
                      <Button type="submit" variant="primary" disabled={!props.setupChanged || busy()}>
                        Save setup
                      </Button>
                      <Show when={props.setupChanged}>
                        <Button disabled={busy()} onClick={() => props.onDiscardSetup()}>
                          Discard changes
                        </Button>
                      </Show>
                    </div>
                  </Show>
                </form>
                <section class={s.section} aria-label="Details">
                  <Heading>Details</Heading>
                  <dl class={s.detailList}>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Role</dt>
                      <dd class={s.detailValue}>Changed in Settings › Members, as any member’s is.</dd>
                    </div>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Current activity</dt>
                      <dd class={s.detailValue}>
                        <Show when={(props.turns ?? []).length > 0} fallback="Idle">
                          <ul class={s.turns}>
                            <For each={props.turns}>
                              {(turn) => (
                                <li>
                                  <a
                                    href={turn.href}
                                    class={s.turn}
                                    aria-label={`${turnStateWord(turn.state)} in ${turn.place}: open its log`}
                                  >
                                    <TurnActivity state={turn.state}>{turnStateWord(turn.state)}</TurnActivity>
                                    <span class={s.turnPlace}>{turn.place}</span>
                                  </a>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      </dd>
                    </div>
                    <div class={s.detail}>
                      <dt class={s.detailName}>Created by</dt>
                      <dd class={s.detailValue}>{`${agent().createdBy} · ${calendarDate(agent().createdAt)}`}</dd>
                    </div>
                  </dl>
                </section>
                <Show when={props.onRemove}>
                  {(remove) => (
                    <section class={s.section} aria-label="Removal">
                      <Heading>Removal</Heading>
                      <p class={s.note}>Removing this agent ends its membership. Its messages stay in their threads.</p>
                      <Button class={s.start} disabled={busy()} onClick={() => remove()()}>
                        Remove agent
                      </Button>
                    </section>
                  )}
                </Show>
              </Pane.Column>
            </Pane.Body>
          )}
        </Match>
      </Switch>
    </Pane.Root>
  )
}

function Heading(props: { readonly children: string }) {
  return (
    <div class={s.heading}>
      <h4 class={s.headingText}>{props.children}</h4>
      <Divider class={s.headingStitch} />
    </div>
  )
}
