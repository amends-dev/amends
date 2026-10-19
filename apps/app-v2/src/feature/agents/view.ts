import { Agent, AgentPermissions } from "@amends-dev/core/agent"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import type * as AgentSetup from "../../agentSetup.ts"
import { button, choiceSelect, errorView, field, sending, submit, textarea } from "../../controls.ts"
import { may, memberTarget, workspaceTarget } from "../../permissions.ts"
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

/** How ready an agent is, as the person reads it. */
const readinessText = (readiness: Agent.Readiness) =>
  Agent.Readiness.match(readiness, {
    Ready: () => "Ready",
    Incomplete: ({ issues }) => `Can't run: ${issues.map(issueText).join("; ")}`
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
          Loading: () => [h.p([], ["Loading the models…"])],
          Failed: ({ error }) => [h.p([h.Role("alert")], [error])],
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
const setupFields = (setup: AgentSetup.Draft, model: Model, h: AgentsViewBuilder) => [
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
const formView = (form: Form, model: Model, h: AgentsViewBuilder): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelForm())
  const nameField = (name: string) =>
    field(
      h,
      { id: "agent-name", label: "Name", type: "text", value: name, onInput: (name) => Message.TypedName({ name }) },
      Option.none()
    )
  return Form.match(form, {
    Adding: ({ name, roleId, setup, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Add an agent")],
        [
          nameField(name),
          choiceSelect(h, {
            id: "agent-role",
            label: "Role",
            choices: givableRoles(model).map(({ id, name }) => [id, name] as const),
            value: roleId,
            onChange: (roleId) => Message.ChoseRole({ roleId })
          }),
          ...setupFields(setup, model, h),
          errorView(error, h),
          submit(h, "Add"),
          cancel
        ]
      ),
    Configuring: ({ setup, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Change the agent's setup")],
        [...setupFields(setup, model, h), errorView(error, h), submit(h, "Save"), cancel]
      ),
    Renaming: ({ name }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedForm()), h.AriaLabel("Rename the agent")],
        [nameField(name), submit(h, "Save"), cancel]
      )
  })
}

/** An agent, with how ready it is and what it runs on, and what the person may do with it. */
const agentView = ({ agent, pending }: AgentItem, model: Model, h: AgentsViewBuilder): Html => {
  const name = model.members.find(({ id }) => id === agent.memberId)?.name ?? "An agent"
  const configurable = may(model.grants, AgentPermissions.Configure, memberTarget(model.workspaceId, agent.memberId))
  return h.keyed("li")(
    agent.id,
    [],
    [
      // How ready a new agent is the server tells, once it has it.
      h.p([], [h.strong([], [name]), pending ? sending(pending, h) : ` · ${readinessText(agent.readiness)}`]),
      h.p([], [`Runs ${setupText(agent, model)}.`]),
      ...(configurable && !pending
        ? [
            button(h, "Rename", Message.ClickedRename({ agentId: agent.id })),
            button(h, "Change setup", Message.ClickedConfigure({ agentId: agent.id }))
          ]
        : [])
    ]
  )
}

/** Adding an agent, for a person who may: once the host listed its integrations, and a connection gives models. */
const addView = (model: Model, h: AgentsViewBuilder): Html =>
  may(model.grants, AgentPermissions.Create, workspaceTarget(model.workspaceId))
    ? Integrations.match(model.integrations, {
        Loading: () => h.p([], ["Loading the integrations…"]),
        Failed: ({ error }) =>
          h.div([], [h.p([h.Role("alert")], [error]), button(h, "Try again", Message.ClickedReloadIntegrations())]),
        Loaded: () =>
          connectionsGiving(model, "models").length === 0
            ? h.p([], ["An agent needs a connection that gives models."])
            : button(h, "Add an agent", Message.ClickedAdd())
      })
    : h.empty

/** The workspace's agents, the form open among them, and adding one, for a person who may. */
export const view = AgentsComposition.makeView((model, h) => {
  const listed = listedAgents(model)
  return h.section(
    [h.AriaLabel("Agents")],
    [
      h.h3([], ["Agents"]),
      errorView(model.notice, h),
      listed.length === 0
        ? h.p([], ["No agents yet."])
        : h.ul(
            [],
            listed.map((item) => agentView(item, model, h))
          ),
      Option.match(model.form, {
        onSome: (form) => formView(form, model, h),
        onNone: () => addView(model, h)
      })
    ]
  )
})
