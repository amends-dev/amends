import { Agent, AgentPermissions } from "@amends-dev/core/agent"
import {
  button,
  buttonRow,
  choiceSelect,
  field,
  hint,
  notice,
  sending,
  submit,
  textarea
} from "@amends-dev/design/control"
import { badge, entry, entryList } from "@amends-dev/design/details"
import { pane, paneColumn, paneEmpty, paneForm } from "@amends-dev/design/pane"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type * as AgentSetup from "../../agentSetup.ts"
import { may, memberTarget, workspaceTarget } from "../../permissions.ts"
import { initials } from "../../seen.ts"
import { connectionsGiving, Integrations } from "../connections/definition.ts"
import { givableRoles } from "../settings/definition.ts"
import { AgentsComposition, type AgentsViewBuilder } from "./composition.ts"
import { type AgentItem, connectionName, Form, listedAgents, Message, type Model, OfferedModels } from "./definition.ts"

/** Why an agent can't run, as the person reads it. */
const issueText = (issue: Agent.Issue) =>
  Agent.Issue.match(issue, {
    Removed: ({ part }) => `its ${part}'s connection was removed`,
    Uninstalled: ({ part }) => `its ${part}'s integration is no longer installed`,
    Invalid: ({ part, description }) => `its ${part}: ${description}`,
    SandboxRequired: () => "its harness works only in a sandbox",
    NoHarness: () => "no connection gives a harness it can run on"
  })

/** How ready an agent is, as the badge beside its name says it and is toned. */
const readinessBadge = (readiness: Agent.Readiness, h: AgentsViewBuilder): Html =>
  Agent.Readiness.match(readiness, {
    Ready: () => badge(h, { label: "Ready", tone: "success" }),
    Incomplete: () => badge(h, { label: "Can't run", tone: "danger" })
  })

/** Why an agent can't run, when it can't. */
const readinessNotes = (readiness: Agent.Readiness, h: AgentsViewBuilder): ReadonlyArray<Html> =>
  Agent.Readiness.match(readiness, {
    Ready: () => [],
    Incomplete: ({ issues }) => [hint(h, issues.map(issueText).join("; "))]
  })

/** What an agent runs on, as the person reads it: its model, its harness, and its sandbox. */
const setupText = (agent: AgentItem["agent"], model: Model) =>
  [
    `${agent.model.id} on ${connectionName(model, agent.model.connectionId)}`,
    Agent.Harness.match(agent.harness, {
      Auto: () => "any harness",
      Connection: ({ connectionId }) => `the ${connectionName(model, connectionId)} harness`
    }),
    agent.sandbox === null ? "no sandbox" : `sandboxes on ${connectionName(model, agent.sandbox.connectionId)}`
  ].join(", ")

/** The model of the setup, from what its connection offers: those it lists, its id for others, and its effort. */
const modelFields = (setup: AgentSetup.Draft, model: Model, h: AgentsViewBuilder): ReadonlyArray<Html> =>
  Option.match(
    Option.filter(model.offered, ({ connectionId }) => connectionId === setup.modelConnectionId),
    {
      onNone: () => [],
      onSome: (offered) =>
        OfferedModels.match(offered, {
          Loading: () => [hint(h, "Loading the models…")],
          Failed: ({ error }) => [notice(h, Option.some(error))],
          Loaded: ({ models }) => {
            const chosen = models.listed.find(({ id }) => id === setup.modelId)
            const efforts = chosen?.reasoning?.efforts ?? []
            return [
              models.listed.length === 0
                ? h.empty
                : choiceSelect(h, {
                    id: "agent-model",
                    label: "Model",
                    choices: [
                      ["", "Choose a model"] as const,
                      ...models.listed.map(({ id, name }) => [id, name] as const)
                    ],
                    value: chosen === undefined ? "" : chosen.id,
                    onChange: (modelId) => Message.ChoseModel({ modelId })
                  }),
              models.unlisted
                ? field(
                    h,
                    {
                      id: "agent-model-id",
                      label: "Model ID",
                      type: "text",
                      value: setup.modelId,
                      onInput: (modelId) => Message.ChoseModel({ modelId })
                    },
                    Option.none()
                  )
                : h.empty,
              efforts.length === 0
                ? h.empty
                : choiceSelect(h, {
                    id: "agent-effort",
                    label: "Effort",
                    choices: [["", "The model's own"] as const, ...efforts.map((effort) => [effort, effort] as const)],
                    value: setup.effort,
                    onChange: (effort) => Message.ChoseEffort({ effort })
                  })
            ]
          }
        })
    }
  )

/** How an agent is set up, as the form fills it in. */
const setupFields = (setup: AgentSetup.Draft, model: Model, h: AgentsViewBuilder): ReadonlyArray<Html> => [
  textarea(h, {
    id: "agent-instructions",
    label: "Instructions",
    value: setup.instructions,
    onInput: (instructions) => Message.TypedInstructions({ instructions })
  }),
  choiceSelect(h, {
    id: "agent-harness",
    label: "Harness",
    choices: [["", "Auto"] as const, ...connectionsGiving(model, "harnesses")],
    value: setup.harness,
    onChange: (harness) => Message.ChoseHarness({ harness })
  }),
  choiceSelect(h, {
    id: "agent-model-connection",
    label: "Model connection",
    choices: [["", "Choose a connection"] as const, ...connectionsGiving(model, "models")],
    value: setup.modelConnectionId,
    onChange: (connectionId) => Message.ChoseModelConnection({ connectionId })
  }),
  ...modelFields(setup, model, h),
  choiceSelect(h, {
    id: "agent-sandbox",
    label: "Sandbox",
    choices: [["", "None"] as const, ...connectionsGiving(model, "sandboxes")],
    value: setup.sandbox,
    onChange: (sandbox) => Message.ChoseSandbox({ sandbox })
  })
]

/** The form open among the agents. */
const formView = (open: Form, model: Model, h: AgentsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm(), { variant: "quiet" })
  const nameField = (name: string) =>
    field(
      h,
      { id: "agent-name", label: "Name", type: "text", value: name, onInput: (name) => Message.TypedName({ name }) },
      Option.none()
    )
  return Form.match(open, {
    Adding: ({ name, roleId, setup, error }) =>
      paneForm(h, { title: "Add an agent", onSubmit: Message.SubmittedForm() }, [
        nameField(name),
        choiceSelect(h, {
          id: "agent-role",
          label: "Role",
          choices: givableRoles(model).map(({ id, name }) => [id, name] as const),
          value: roleId,
          onChange: (roleId) => Message.ChoseRole({ roleId })
        }),
        ...setupFields(setup, model, h),
        notice(h, error),
        buttonRow(h, [submit(h, "Add"), cancel])
      ]),
    Configuring: ({ setup, error }) =>
      paneForm(h, { title: "Change the agent's setup", onSubmit: Message.SubmittedForm() }, [
        ...setupFields(setup, model, h),
        notice(h, error),
        buttonRow(h, [submit(h, "Save"), cancel])
      ]),
    Renaming: ({ name }) =>
      paneForm(h, { title: "Rename the agent", onSubmit: Message.SubmittedForm() }, [
        nameField(name),
        buttonRow(h, [submit(h, "Save"), cancel])
      ])
  })
}

/** An agent, with how ready it is and what it runs on, and what the person may do with it. */
const agentEntry = ({ agent, pending }: AgentItem, model: Model, h: AgentsViewBuilder): Html => {
  const name = model.members.find(({ id }) => id === agent.memberId)?.name ?? "An agent"
  const configurable = may(model.grants, AgentPermissions.Configure, memberTarget(model.workspaceId, agent.memberId))
  return entry(h, {
    key: agent.id,
    mark: initials(name),
    title: name,
    // How ready a new agent is the server tells, once it has it.
    trailing: [pending ? sending(h, pending) : readinessBadge(agent.readiness, h)],
    children: [
      ...(pending ? [] : readinessNotes(agent.readiness, h)),
      hint(h, `Runs ${setupText(agent, model)}.`),
      ...(configurable && !pending
        ? [
            buttonRow(h, [
              button(h, "Rename", Message.ClickedRename({ agentId: agent.id }), { variant: "quiet" }),
              button(h, "Change setup", Message.ClickedConfigure({ agentId: agent.id }), { variant: "quiet" })
            ])
          ]
        : [])
    ]
  })
}

/** What the host's integrations say while the person waits for them, or why they could not be listed, with a way to ask again. */
const integrationsView = (model: Model, h: AgentsViewBuilder): Html =>
  Integrations.match(model.integrations, {
    Loading: () => hint(h, "Loading the integrations…"),
    Failed: ({ error }) =>
      h.div(
        [],
        [
          notice(h, Option.some(error)),
          buttonRow(h, [button(h, "Try again", Message.ClickedReloadIntegrations(), { variant: "quiet" })])
        ]
      ),
    Loaded: () =>
      connectionsGiving(model, "models").length === 0
        ? hint(h, "An agent needs a connection that gives models.")
        : h.empty
  })

/** The workspace's agents, the form open among them, and adding one, for a person who may. */
export const view = AgentsComposition.makeView((model, h) => {
  const listed = listedAgents(model)
  const mayAdd =
    Option.isNone(model.form) && may(model.grants, AgentPermissions.Create, workspaceTarget(model.workspaceId))
  return pane(h, {
    variant: "main",
    label: "Agents",
    header: {
      title: "Agents",
      icon: "mark-agents",
      actions:
        mayAdd && connectionsGiving(model, "models").length > 0
          ? [button(h, "Add an agent", Message.ClickedAdd(), { variant: "secondary" })]
          : []
    },
    body: [
      paneColumn(h, [
        notice(h, model.notice),
        mayAdd ? integrationsView(model, h) : h.empty,
        listed.length === 0
          ? paneEmpty(h, {
              icon: "mark-agents",
              title: "No agents yet",
              copy: "Agents are members that take part in threads, running on what the connections give."
            })
          : entryList(h, { label: "Agents", children: listed.map((item) => agentEntry(item, model, h)) }),
        Option.match(model.form, { onNone: () => h.empty, onSome: (open) => formView(open, model, h) })
      ])
    ]
  })
})
