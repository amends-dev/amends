import { BuiltinRoles } from "@amends-dev/core/authorization"
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import { modifyFields } from "foldkit/struct"
import * as AgentSetup from "../../agentSetup.ts"
import { Integrations } from "../connections/definition.ts"
import { ConfigureAgent, CreateAgent, LoadIntegrations, LoadModels, RenameAgent } from "./command.ts"
import { AgentsComposition } from "./composition.ts"
import { findAgent, findAgentName, Form, listedAgents, Message, type Model, OfferedModels } from "./definition.ts"

/** The model with the form open as `change` makes it, while one is open. */
const atForm = (model: Model, change: (form: Form) => Form): Model => modifyFields(model, { form: Option.map(change) })

/** The model with the setup in the form open as `change` makes it, while the form holds one, wanting nothing yet. */
const atSetup = (model: Model, change: (setup: AgentSetup.Draft) => AgentSetup.Draft): Model =>
  atForm(model, (form) =>
    Form.matchOrElse(
      form,
      {
        Adding: (adding) => Form.Adding({ ...adding, setup: change(adding.setup), error: Option.none() }),
        Configuring: (configuring) =>
          Form.Configuring({ ...configuring, setup: change(configuring.setup), error: Option.none() })
      },
      () => form
    )
  )

/** The model with no form open, and so no models offered for it. */
const closed = (model: Model): Model => modifyFields(model, { form: () => Option.none(), offered: () => Option.none() })

/** Ask for the models `connectionId` offers, if it is one of the workspace's connections; otherwise offer none. */
const askForModels = (model: Model, connectionId: string) =>
  Option.match(Option.fromUndefinedOr(model.connections.find(({ connection }) => connection.id === connectionId)), {
    onNone: () => ({ model: modifyFields(model, { offered: () => Option.none() }) }),
    onSome: ({ connection }) => ({
      model: modifyFields(model, {
        offered: () => Option.some(OfferedModels.Loading({ connectionId: connection.id }))
      }),
      commands: [LoadModels({ workspaceId: model.workspaceId, connectionId: connection.id })]
    })
  })

/** Whether `form` is about no agent, or about one the workspace still lists. */
const isAboutListedAgent = (model: Model, form: Form): boolean => {
  const isListed = (agentId: string) => listedAgents(model).some(({ agent }) => agent.id === agentId)
  return Form.matchOrElse(
    form,
    { Configuring: ({ agentId }) => isListed(agentId), Renaming: ({ agentId }) => isListed(agentId) },
    () => true
  )
}

/** Send the form open as an action, or keep it open with what its setup still wants. */
const submitForm = (model: Model, form: Form) => {
  const { workspaceId, memberId } = model
  const member = { workspaceId, memberId }
  const refusing = (refused: Form) => ({ model: modifyFields(model, { form: () => Option.some(refused) }) })
  return Form.match(form, {
    Adding: (adding) =>
      Result.match(AgentSetup.configurationOf(adding.setup), {
        onFailure: (error) => refusing(Form.Adding({ ...adding, error: Option.some(error) })),
        onSuccess: (configuration) => ({
          model: closed(model),
          commands: [CreateAgent({ ...member, name: adding.name, roleId: adding.roleId, configuration })]
        })
      }),
    Configuring: (configuring) =>
      Result.match(AgentSetup.configurationOf(configuring.setup), {
        onFailure: (error) => refusing(Form.Configuring({ ...configuring, error: Option.some(error) })),
        onSuccess: (configuration) => ({
          model: closed(model),
          commands: [ConfigureAgent({ ...member, agentId: configuring.agentId, configuration })]
        })
      }),
    Renaming: ({ agentId, name }) =>
      Option.match(findAgentName(model, agentId), {
        onNone: () => ({ model: closed(model) }),
        onSome: (expectedName) => ({
          model: closed(model),
          commands: [RenameAgent({ ...member, agentId, name, expectedName })]
        })
      })
  })
}

export const update = AgentsComposition.makeUpdate((model, message) =>
  Message.match(message, {
    ReceivedAgents: ({ agents, members, connections, roles, workspace, grants }) => {
      const received = modifyFields(model, {
        agents: () => agents,
        members: () => members,
        connections: () => connections,
        roles: () => roles,
        workspace: () => workspace,
        grants: () => grants
      })
      // A form about an agent no longer there, as one removed, closes.
      return { model: modifyFields(received, { form: Option.filter((form) => isAboutListedAgent(received, form)) }) }
    },
    ReceivedIntegrations: ({ integrations }) => ({
      model: modifyFields(model, { integrations: () => Integrations.Loaded({ integrations }) })
    }),
    FailedLoadIntegrations: ({ error }) => ({
      model: modifyFields(model, { integrations: () => Integrations.Failed({ error }) })
    }),
    FailedRead: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) }),
    ClickedReloadIntegrations: () =>
      Integrations.isAnyOf(["Failed"])(model.integrations)
        ? {
            model: modifyFields(model, { integrations: () => Integrations.Loading() }),
            commands: [LoadIntegrations({ workspaceId: model.workspaceId })]
          }
        : { model },
    ClickedAdd: () => ({
      model: modifyFields(model, {
        form: () =>
          Option.some(
            Form.Adding({ name: "", roleId: BuiltinRoles.MemberId, setup: AgentSetup.empty, error: Option.none() })
          ),
        offered: () => Option.none()
      })
    }),
    TypedName: ({ name }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(
          form,
          {
            Adding: (adding) => Form.Adding({ ...adding, name }),
            Renaming: (renaming) => Form.Renaming({ ...renaming, name })
          },
          () => form
        )
      )
    }),
    ChoseRole: ({ roleId }) => ({
      model: atForm(model, (form) =>
        Form.matchOrElse(form, { Adding: (adding) => Form.Adding({ ...adding, roleId }) }, () => form)
      )
    }),
    TypedInstructions: ({ instructions }) => ({ model: atSetup(model, (setup) => ({ ...setup, instructions })) }),
    ChoseHarness: ({ harness }) => ({ model: atSetup(model, (setup) => ({ ...setup, harness })) }),
    // Another connection offers other models, so the model is chosen again from what it offers.
    ChoseModelConnection: ({ connectionId }) =>
      askForModels(
        atSetup(model, (setup) => ({ ...setup, modelConnectionId: connectionId, modelId: "", effort: "" })),
        connectionId
      ),
    ChoseModel: ({ modelId }) => ({ model: atSetup(model, (setup) => ({ ...setup, modelId, effort: "" })) }),
    ChoseEffort: ({ effort }) => ({ model: atSetup(model, (setup) => ({ ...setup, effort })) }),
    ChoseSandbox: ({ sandbox }) => ({ model: atSetup(model, (setup) => ({ ...setup, sandbox })) }),
    SubmittedForm: () =>
      Option.match(model.form, { onNone: () => ({ model }), onSome: (form) => submitForm(model, form) }),
    ClickedCancelForm: () => ({ model: closed(model) }),
    ClickedRename: ({ agentId }) => ({
      model: modifyFields(model, {
        form: () => Option.map(findAgentName(model, agentId), (name) => Form.Renaming({ agentId, name }))
      })
    }),
    ClickedConfigure: ({ agentId }) =>
      Option.match(findAgent(model, agentId), {
        onNone: () => ({ model }),
        onSome: ({ agent }) =>
          askForModels(
            modifyFields(model, {
              form: () =>
                Option.some(Form.Configuring({ agentId, setup: AgentSetup.draftOf(agent), error: Option.none() }))
            }),
            agent.model.connectionId
          )
      }),
    ReceivedModels: ({ connectionId, models }) => ({
      model: modifyFields(model, {
        offered: Option.map((offered) =>
          offered.connectionId === connectionId ? OfferedModels.Loaded({ connectionId, models }) : offered
        )
      })
    }),
    FailedLoadModels: ({ connectionId, error }) => ({
      model: modifyFields(model, {
        offered: Option.map((offered) =>
          offered.connectionId === connectionId ? OfferedModels.Failed({ connectionId, error }) : offered
        )
      })
    }),
    WroteAction: () => ({ model: modifyFields(model, { notice: () => Option.none() }) }),
    FailedWriteAction: ({ error }) => ({ model: modifyFields(model, { notice: () => Option.some(error) }) })
  })
)
