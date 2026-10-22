/** An agent’s identity, setup, and current work. */

import { Agent } from "@amends-dev/core/agent"
import type { Identity } from "@amends-dev/core/identity"
import { button, buttonRow, field, hint, loadingLine, notice, noticeBox, submit } from "@amends-dev/design/control"
import { activityList, detailList } from "@amends-dev/design/details"
import { form } from "@amends-dev/design/form"
import { pane, paneColumn, paneEmpty, paneForm, paneSection } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import {
  type TurnUnderWay,
  activityOfAgent,
  type AgentItem,
  readinessOfAgent,
  turnsOfAgent
} from "../../../data/agents.ts"
import { memberName } from "../../../data/members.ts"
import { calendarDate } from "../../../seen.ts"
import { motionOfState, stateWord, turnLabel, issueSentence, statusOfAgent } from "../../../view/agents.ts"
import { AgentsBlock } from "../block.ts"
import type { AgentsViewBuilder } from "../composition.ts"
import {
  type AgentAction,
  type Edit,
  failureMessage,
  findEdit,
  findListedAgent,
  isNameChanged,
  isSetupChanged,
  mayConfigure,
  mayRemove,
  Message,
  type Model,
  nameDraftOf,
  nameOfAgent,
  problemsOf,
  SetupTarget,
  setupDraftOf
} from "../definition.ts"
import { isUnread, unreadAgents } from "./feedback.ts"
import { setupFields } from "./setupFields.ts"

/** The agent whose page it is, and the name of the workspace, which a phone shows under the title. */
export type AgentInputs = Readonly<{ agentId: Identity.AgentId; workspaceName: string }>

/** The message of the failure the edit holds about `action`, when it holds one. */
const failureAbout = (edit: Option.Option<Edit>, action: AgentAction): Option.Option<string> =>
  Option.map(
    Option.filter(
      Option.flatMap(edit, (open) => open.failure),
      (failure) => failure.action === action
    ),
    failureMessage
  )

/** The form that renames the agent, where the person may; for another, the name alone. */
const nameForm = (
  item: AgentItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: AgentsViewBuilder
): Html => {
  const agentId = item.agent.id
  const isSaving = Option.exists(edit, (open) => Option.exists(open.saving, (action) => action === "Rename"))

  return form(h, { onSubmit: Message.SubmittedName({ agentId }), label: "Name", variant: "pane" }, [
    field(
      h,
      {
        id: "agent-name",
        label: "Agent name",
        type: "text",
        value: nameDraftOf(model, item),
        isAutofocus: false,
        isDisabled: !isEditable || isSaving,
        onInput: (name) => Message.TypedName({ agentId, name })
      },
      Option.none()
    ),
    notice(h, failureAbout(edit, "Rename")),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save name", { variant: "secondary", isDisabled: !isNameChanged(model, item) || isSaving })
          ])
        ]
      : [])
  ])
}

/** The form that sets the agent up again as a whole, where the person may; for another, the setup alone. */
const setupForm = (
  item: AgentItem,
  model: Model,
  edit: Option.Option<Edit>,
  isEditable: boolean,
  h: AgentsViewBuilder
): Html => {
  const agentId = item.agent.id
  const isSaving = Option.exists(edit, (open) => Option.exists(open.saving, (action) => action === "Configure"))
  const isChanged = isSetupChanged(model, item)
  const failure = Option.filter(
    Option.flatMap(edit, (open) => open.failure),
    (about) => about.action === "Configure"
  )

  return paneForm(h, { title: "Setup", onSubmit: Message.SubmittedSetup({ agentId }), hasStitch: true }, [
    ...setupFields(h, model, {
      idPrefix: "agent-setup",
      target: SetupTarget.Agent({ agentId }),
      setup: setupDraftOf(model, item),
      problems: problemsOf(failure),
      isDisabled: !isEditable || isSaving
    }),
    notice(h, Option.map(failure, failureMessage)),
    ...(isEditable
      ? [
          buttonRow(h, [
            submit(h, "Save setup", { isDisabled: !isChanged || isSaving }),
            ...(isChanged
              ? [button(h, "Discard changes", Message.ClickedDiscardSetup({ agentId }), { isDisabled: isSaving })]
              : [])
          ])
        ]
      : [])
  ])
}

/**
 * A turn under way as a line of the agent's page: the logo as the turn goes, its state, and the place it is in, as one
 * button that opens the turn's thread, named as `apps/ui` names its link to the turn's log: "Working in #general: open
 * its log".
 */
const turnLine = (turn: TurnUnderWay) => ({
  key: turn.turnId,
  state: stateWord[turn.state],
  motion: motionOfState[turn.state],
  place: Option.getOrUndefined(turn.place),
  action: {
    name: `${turnLabel(turn)}: open its log`,
    onClick: Message.ClickedTurn({ groupId: turn.groupId, threadId: turn.threadId })
  }
})

/** What the agent is doing now, a line for each turn under way, the most pressing first, or Idle when it has none. */
const currentActivity = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html | string => {
  const turns = turnsOfAgent(model, item)

  return turns.length === 0 ? "Idle" : activityList(h, { label: "Turns under way", lines: turns.map(turnLine) })
}

/**
 * What the agent's page says about it that is not set up by the person: its role, what it is at work on, and who made
 * it.
 */
const detailsSection = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html =>
  paneSection(h, {
    title: "Details",
    hasStitch: true,
    children: [
      detailList(h, [
        { label: "Role", value: "Changed in Settings › Members, as any member’s is." },
        { label: "Current activity", value: currentActivity(item, model, h) },
        {
          label: "Created by",
          value: `${memberName(model.members, item.agent.createdBy)} · ${calendarDate(item.agent.createdAt)}`
        }
      ])
    ]
  })

/** What removing the agent does, and the button that asks to confirm it, for a person who may remove it. */
const removalSection = (item: AgentItem, model: Model, h: AgentsViewBuilder): Html =>
  mayRemove(model, item.agent) && !item.pending
    ? paneSection(h, {
        title: "Removal",
        hasStitch: true,
        children: [
          hint(h, "Removing this agent ends its membership. Its messages stay in their threads."),
          buttonRow(h, [button(h, "Remove agent", Message.ClickedRemove({ agentId: item.agent.id }))])
        ]
      })
    : h.empty

/** Why the agent can't run as it is set up, as a note over the page, one line for each reason; nothing when it can. */
const readinessNote = ({ agent, pending }: AgentItem, h: AgentsViewBuilder): Html =>
  pending
    ? h.empty
    : Agent.Readiness.match(agent.readiness, {
        Ready: () => h.empty,
        Incomplete: ({ issues }) =>
          noticeBox(h, { title: "This agent can’t run as it is set up", lines: issues.map(issueSentence) })
      })

/** The page of an agent: why it can't run, its name, its setup, its details, and its removal, in one column. */
const agentPage = (item: AgentItem, model: Model, workspaceName: string, h: AgentsViewBuilder): Html => {
  const name = nameOfAgent(model, item.agent)
  const edit = findEdit(model, item.agent.id)
  const isEditable = mayConfigure(model, item.agent) && !item.pending

  return pane(h, {
    variant: "main",
    label: name,
    header: {
      title: name,
      mark: { text: name.slice(0, 1), tone: "lilac" },
      status: statusOfAgent(readinessOfAgent(item), activityOfAgent(model, item)),
      phoneContext: workspaceName,
      ...(item.pending ? { context: "Sending…" } : {})
    },
    body: [
      paneColumn(h, [
        readinessNote(item, h),
        nameForm(item, model, edit, isEditable, h),
        setupForm(item, model, edit, isEditable, h),
        detailsSection(item, model, h),
        removalSection(item, model, h)
      ])
    ]
  })
}

/**
 * What the page of an agent says when the workspace does not list it: it was removed, or the person can no longer see
 * it.
 */
const missingAgent = (workspaceName: string, h: AgentsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Agent",
    header: { title: "Agent", phoneContext: workspaceName },
    body: [
      paneEmpty(h, {
        art: "lost-thread",
        title: "This agent isn’t here",
        copy: "It may have been removed, or you can no longer see it.",
        action: button(h, "Show all agents", Message.ClickedBrowse())
      })
    ]
  })

/** What the page of an agent says before the agents are read, and why they could not be when they could not. */
const readingAgent = (model: Model, workspaceName: string, h: AgentsViewBuilder): Html =>
  pane(h, {
    variant: "main",
    label: "Agent",
    header: { title: "Agent", phoneContext: workspaceName },
    body: [isUnread(model) ? unreadAgents(model, h) : loadingLine(h, "Loading agent…")]
  })

/**
 * The page of one agent, the main content: why it can't run, its name, its setup, its details, and, for a person who
 * may remove it, its removal, which asks to confirm in the dialog `dialogView` renders. A person who may configure
 * it renames it and sets it up again, each saved apart; another reads the same values. An agent the workspace does
 * not list says so, and offers the list; a line says the agents are being read until they are.
 */
export const agentView = AgentsBlock.makeView.withInputs<AgentInputs>((model, { agentId, workspaceName }, h) =>
  Option.match(findListedAgent(model, agentId), {
    onNone: () => (model.isLoaded ? missingAgent(workspaceName, h) : readingAgent(model, workspaceName, h)),
    onSome: (item) => agentPage(item, model, workspaceName, h)
  })
)
