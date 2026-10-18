/**
 * The workspace's agents, each with how ready it is and what it runs on, and, for a person who may
 * configure it, renaming it and changing how it is set up; and adding one, for a person who may,
 * on the harnesses, models, and sandboxes the workspace's connections give. An agent's role, and
 * its removal, are its membership's, in the workspace's settings.
 */

import { Agent, AgentPermissions } from "@amends-dev/core/agent"
import { Target } from "@amends-dev/core/authorization"
import * as Option from "effect/Option"
import type { Html, HtmlBuilder } from "foldkit/html"
import type * as AgentSetup from "./agentSetup.ts"
import { connectionsGiving } from "./connectionsView.ts"
import { button, choiceSelect, errorView, field, sending, submit, textarea } from "./controls.ts"
import { Message } from "./message.ts"
import { AgentForm, type AgentItem, type Agents, OfferedModels, type Opened } from "./model.ts"
import { givableRoles, may } from "./permissions.ts"

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

/** What a connection is called, or that it is gone. */
const connectionName = (opened: Opened, connectionId: string) =>
  opened.connections.find(({ connection }) => connection.id === connectionId)?.connection.name ?? "a removed connection"

/** What an agent runs on, as the person reads it: its model, its harness, and its sandbox. */
const setupText = (agent: AgentItem["agent"], opened: Opened) =>
  [
    `${agent.model.id} on ${connectionName(opened, agent.model.connectionId)}`,
    Agent.Harness.match(agent.harness, {
      Auto: () => "any harness",
      Connection: ({ connectionId }) => `the ${connectionName(opened, connectionId)} harness`
    }),
    agent.sandbox === null ? "no sandbox" : `sandboxes on ${connectionName(opened, agent.sandbox.connectionId)}`
  ].join(", ")

/** The model of the setup, from what its connection offers: a choice of those it lists, its id when it offers others, and how hard it reasons. */
const modelFields = (setup: AgentSetup.Draft, agents: Agents, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(
    Option.filter(agents.models, ({ connectionId }) => connectionId === setup.modelConnectionId),
    {
      onNone: () => [],
      onSome: ({ offered }) =>
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
const setupFields = (setup: AgentSetup.Draft, agents: Agents, opened: Opened, h: HtmlBuilder<Message>) => [
  textarea(h, {
    id: "agent-instructions",
    label: "Instructions",
    value: setup.instructions,
    onInput: (instructions) => Message.TypedInstructions({ instructions })
  }),
  choiceSelect(h, {
    id: "agent-harness",
    label: "Harness",
    choices: [["", "Auto"] as const, ...connectionsGiving(opened, "harnesses")],
    value: setup.harness,
    onChange: (harness) => Message.ChoseHarness({ harness })
  }),
  choiceSelect(h, {
    id: "agent-model-connection",
    label: "Model connection",
    choices: [["", "Choose a connection"] as const, ...connectionsGiving(opened, "models")],
    value: setup.modelConnectionId,
    onChange: (connectionId) => Message.ChoseModelConnection({ connectionId })
  }),
  ...modelFields(setup, agents, h),
  choiceSelect(h, {
    id: "agent-sandbox",
    label: "Sandbox",
    choices: [["", "None"] as const, ...connectionsGiving(opened, "sandboxes")],
    value: setup.sandbox,
    onChange: (sandbox) => Message.ChoseSandbox({ sandbox })
  })
]

/** The form open among the agents. */
const formView = (form: AgentForm, agents: Agents, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const cancel = button(h, "Cancel", Message.ClickedCancelAgentForm())
  const nameField = (name: string) =>
    field(
      h,
      {
        id: "agent-name",
        label: "Name",
        type: "text",
        value: name,
        onInput: (name) => Message.TypedAgentName({ name })
      },
      Option.none()
    )
  return AgentForm.match(form, {
    Adding: ({ name, roleId, setup, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedAgentForm()), h.AriaLabel("Add an agent")],
        [
          nameField(name),
          choiceSelect(h, {
            id: "agent-role",
            label: "Role",
            choices: givableRoles(opened).map(({ id, name }) => [id, name] as const),
            value: roleId,
            onChange: (roleId) => Message.ChoseAgentRole({ roleId })
          }),
          ...setupFields(setup, agents, opened, h),
          errorView(error, h),
          submit(h, "Add"),
          cancel
        ]
      ),
    Configuring: ({ setup, error }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedAgentForm()), h.AriaLabel("Change the agent's setup")],
        [...setupFields(setup, agents, opened, h), errorView(error, h), submit(h, "Save"), cancel]
      ),
    Renaming: ({ name }) =>
      h.form(
        [h.OnSubmit(Message.SubmittedAgentForm()), h.AriaLabel("Rename the agent")],
        [nameField(name), submit(h, "Save"), cancel]
      )
  })
}

/** An agent, with how ready it is and what it runs on, and what the person may do with it. */
const agentView = ({ agent, pending }: AgentItem, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const name = opened.members.find(({ member }) => member.id === agent.memberId)?.member.name ?? "An agent"
  const configurable = may(
    opened,
    AgentPermissions.Configure,
    Target.Reference.cases.Member.make({ workspaceId: opened.workspace.id, memberId: agent.memberId })
  )
  return h.keyed("li")(
    agent.id,
    [],
    [
      // How ready a new agent is the server tells, once it has it.
      h.p([], [h.strong([], [name]), pending ? sending(pending, h) : ` · ${readinessText(agent.readiness)}`]),
      h.p([], [`Runs ${setupText(agent, opened)}.`]),
      ...(configurable && !pending
        ? [
            button(h, "Rename", Message.ClickedRenameAgent({ agentId: agent.id })),
            button(h, "Change setup", Message.ClickedConfigureAgent({ agentId: agent.id }))
          ]
        : [])
    ]
  )
}

/** The workspace's agents, the form open among them, and adding one, for a person who may. */
export const agentsView = (agents: Agents, opened: Opened, h: HtmlBuilder<Message>): Html => {
  const listed = opened.agents.filter(({ agent }) =>
    opened.members.some(({ member }) => member.id === agent.memberId && member.status === "active")
  )
  return h.section(
    [h.AriaLabel("Agents")],
    [
      h.h3([], ["Agents"]),
      listed.length === 0
        ? h.p([], ["No agents yet."])
        : h.ul(
            [],
            listed.map((item) => agentView(item, opened, h))
          ),
      Option.match(agents.form, {
        onSome: (form) => formView(form, agents, opened, h),
        onNone: () =>
          may(
            opened,
            AgentPermissions.Create,
            Target.Reference.cases.Workspace.make({ workspaceId: opened.workspace.id })
          )
            ? connectionsGiving(opened, "models").length === 0
              ? h.p([], ["An agent needs a connection that gives models."])
              : button(h, "Add an agent", Message.ClickedAddAgent())
            : h.empty
      })
    ]
  )
}
