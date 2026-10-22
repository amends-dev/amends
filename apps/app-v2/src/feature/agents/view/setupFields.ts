/**
 * The fields of an agent's setup, which the page of an agent and the form that adds one both ask for: its
 * instructions, the harness it runs on or Auto, the model connection and the model, how hard the model
 * reasons, and the sandbox it works in. A part that can't be saved as it is, whether the person's last save
 * marked it or the setup shows it already, is marked beside its field.
 */

import type { Integration } from "@amends-dev/connection"
import type { Agent } from "@amends-dev/core/agent"
import type { Connection } from "@amends-dev/core/connection"
import { type Choice, choiceSelect, field, textarea } from "@amends-dev/design/control"
import * as Option from "effect/Option"
import type { Html } from "foldkit/html"
import {
  Integrations,
  connectionItemsGiving,
  findConnection,
  findIntegration,
  areIntegrationsListed
} from "../../../data/connections.ts"
import type { AgentsViewBuilder } from "../composition.ts"
import {
  listedModelOf,
  Message,
  type Model,
  modelProblem,
  offeredBy,
  OfferedModels,
  problemAt,
  sandboxProblem,
  type SetupTarget
} from "../definition.ts"
import type * as AgentSetup from "../setup.ts"

/** How the person reads each effort a model takes. */
const effortLabels: Readonly<Record<NonNullable<Agent.Model["effort"]>, string>> = {
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high",
  max: "Max"
}

const effortLabel = (effort: string): string =>
  (effortLabels as Readonly<Record<string, string | undefined>>)[effort] ?? effort

/** What a form asks its setup fields: which setup they change, what it is now, and what is marked in it. */
export type SetupFieldsConfig = Readonly<{
  /** Starts the ID of each field, so that a form beside another in the document names its own. */
  idPrefix: string
  target: SetupTarget
  setup: AgentSetup.Draft
  /** The parts a refused save marked, which the person's changes to the setup clear. */
  problems: ReadonlyArray<AgentSetup.Problem>
  isDisabled: boolean
}>

/** Why the field `field` is marked: the last save marked it, or the setup shows it can't be saved as it is. */
const problemOf = (
  model: Model,
  { problems, setup }: SetupFieldsConfig,
  field: AgentSetup.Field
): Option.Option<string> =>
  Option.orElse(problemAt(problems, field), () =>
    field === "Model" ? modelProblem(model, setup) : field === "Sandbox" ? sandboxProblem(model, setup) : Option.none()
  )

/** Whether the host listed its integrations and no connection gives `capability`. */
const hasNoneGiving = (model: Model, capability: "harnesses" | "models"): boolean =>
  Integrations.isAnyOf(["Loaded"])(model.integrations) && connectionItemsGiving(model, capability).length === 0

/** The model of the setup, from what its connection offers: those it lists, any other by its id, and the effort. */
const modelFields = (h: AgentsViewBuilder, model: Model, config: SetupFieldsConfig): ReadonlyArray<Html> => {
  const { idPrefix, target, setup, isDisabled } = config
  const chooseModel = (modelId: string) => Message.ChoseModel({ target, modelId })
  const problem = problemOf(model, config, "Model")
  const enterModel = (label: string, hint?: string, error: Option.Option<string> = problem) =>
    field(
      h,
      {
        id: `${idPrefix}-model`,
        label,
        type: "text",
        value: setup.modelId,
        ...(hint === undefined ? {} : { hint }),
        isAutofocus: false,
        isDisabled,
        onInput: chooseModel
      },
      error
    )
  const modelId = setup.modelId.trim()
  const chooseListed = (
    listed: ReadonlyArray<Choice<string>>,
    select: Readonly<{ id: string; hint: string; error: Option.Option<string>; isOff: boolean }>
  ) =>
    choiceSelect(h, {
      id: select.id,
      label: "Model",
      choices: [["", "Choose a model"], ...listed],
      value: listed.some(([id]) => id === modelId) ? modelId : "",
      hint: select.hint,
      error: select.error,
      isDisabled: select.isOff,
      onChange: chooseModel
    })

  if (setup.modelConnectionId === "") {
    return [
      chooseListed([], {
        id: `${idPrefix}-model`,
        hint: "Choose a model connection first.",
        error: problem,
        isOff: true
      })
    ]
  }

  return Option.match(offeredBy(model, setup.modelConnectionId), {
    onNone: () => [enterModel("Model")],
    onSome: (offered) =>
      OfferedModels.match(offered, {
        Loading: () => [
          chooseListed(modelId === "" ? [] : [[modelId, modelId]], {
            id: `${idPrefix}-model`,
            hint: "Loading this connection’s models…",
            error: problem,
            isOff: true
          })
        ],
        Failed: ({ error }) => [
          enterModel(
            "Model",
            "Its models couldn’t be loaded. You can still enter a model’s ID.",
            Option.orElse(problem, () => Option.some(error))
          )
        ],
        Loaded: ({ models }) => {
          const listed = models.listed.map((listedModel): Choice<string> => [listedModel.id, listedModel.name])
          if (listed.length === 0 && models.unlisted) {
            return [enterModel("Model", "Enter the ID of any model it serves.")]
          }

          return models.unlisted
            ? [
                chooseListed(listed, {
                  id: `${idPrefix}-model-listed`,
                  hint: "Choose one it lists, or enter any model’s ID.",
                  error: Option.none(),
                  isOff: isDisabled
                }),
                enterModel("Model ID")
              ]
            : [
                chooseListed(listed, {
                  id: `${idPrefix}-model`,
                  hint: "Choose one of the models it lists.",
                  error: problem,
                  isOff: isDisabled
                })
              ]
        }
      })
  })
}

/** How hard the model reasons, from the efforts the model of the setup takes, when it takes any or the setup names one. */
const effortField = (h: AgentsViewBuilder, model: Model, config: SetupFieldsConfig): Html => {
  const { idPrefix, target, setup, isDisabled } = config
  const efforts = Option.match(listedModelOf(model, setup), {
    onNone: () => [],
    onSome: (listedModel) => listedModel.reasoning?.efforts ?? []
  })
  const named = setup.effort === "" || efforts.some((effort) => effort === setup.effort) ? [] : [setup.effort]

  return efforts.length === 0 && setup.effort === ""
    ? h.empty
    : choiceSelect(h, {
        id: `${idPrefix}-effort`,
        label: "Effort",
        choices: [
          ["", "Model default"],
          ...[...efforts, ...named].map((effort): Choice<string> => [effort, effortLabel(effort)])
        ],
        value: setup.effort,
        hint: "How hard the model reasons before it answers.",
        isDisabled,
        onChange: (effort) => Message.ChoseEffort({ target, effort })
      })
}

/** The instructions, the harness, the model connection, the model and its effort, and the sandbox of a setup. */
export const setupFields = (h: AgentsViewBuilder, model: Model, config: SetupFieldsConfig): ReadonlyArray<Html> => {
  const { idPrefix, target, setup, isDisabled } = config

  return [
    textarea(h, {
      id: `${idPrefix}-instructions`,
      label: "Instructions",
      value: setup.instructions,
      rows: 6,
      hint: "What the agent works by: its role, how it answers, and what to avoid.",
      error: problemOf(model, config, "Instructions"),
      isDisabled,
      onInput: (instructions) => Message.TypedInstructions({ target, instructions })
    }),
    choiceSelect(h, {
      id: `${idPrefix}-harness`,
      label: "Harness",
      choices: [
        ["", "Auto", { description: "amends chooses a harness as the agent works" }],
        ...connectionChoices(
          model,
          "harnesses",
          setup.harness,
          ({ name, requiresSandbox }) =>
            `${name} · ${requiresSandbox ? "Works only in a sandbox" : "Works on this host"}`
        )
      ],
      value: setup.harness,
      ...(hasNoneGiving(model, "harnesses")
        ? { hint: "No connection gives a harness yet. On Auto, the agent waits for one." }
        : {}),
      error: problemOf(model, config, "Harness"),
      isDisabled,
      onChange: (harness) => Message.ChoseHarness({ target, harness })
    }),
    choiceSelect(h, {
      id: `${idPrefix}-model-connection`,
      label: "Model connection",
      choices: [
        ["", "Choose a model connection"],
        ...connectionChoices(model, "models", setup.modelConnectionId, ({ name }) => name)
      ],
      value: setup.modelConnectionId,
      ...(hasNoneGiving(model, "models") ? { hint: "No connection gives models yet. Add one in Connections." } : {}),
      error: problemOf(model, config, "ModelConnection"),
      isDisabled,
      onChange: (connectionId) => Message.ChoseModelConnection({ target, connectionId })
    }),
    ...modelFields(h, model, config),
    effortField(h, model, config),
    choiceSelect(h, {
      id: `${idPrefix}-sandbox`,
      label: "Sandbox",
      choices: [
        ["", "No sandbox", { description: "Answers from its model alone" }],
        ...connectionChoices(model, "sandboxes", setup.sandbox, ({ name }) => name)
      ],
      value: setup.sandbox,
      error: problemOf(model, config, "Sandbox"),
      isDisabled,
      onChange: (sandbox) => Message.ChoseSandbox({ target, sandbox })
    })
  ]
}

/**
 * The connections that give `capability` as the choices of a select, each with what `describe` says of its
 * integration, and, when `current` names one that does not give it, that connection too, listed as unavailable:
 * a connection the agent names that was removed or whose integration is not installed stays chosen, and says so.
 */
export const connectionChoices = (
  model: Pick<Model, "connections" | "integrations">,
  capability: Integration.Capability,
  current: string,
  describe: (integration: Connection.IntegrationView) => string
): ReadonlyArray<Choice<string>> => {
  const giving = connectionItemsGiving(model, capability)
  const choices = giving.map(({ connection }): Choice<string> => [
    connection.id,
    connection.name,
    Option.match(findIntegration(model, connection.integration), {
      onNone: () => ({}),
      onSome: (integration) => ({ description: describe(integration) })
    })
  ])

  return current === "" || giving.some(({ connection }) => connection.id === current)
    ? choices
    : [...choices, unavailableChoice(model, current)]
}

/** The connection `connectionId`, which does not give what a select asks for, as a choice that can't be chosen. */
const unavailableChoice = (model: Pick<Model, "connections" | "integrations">, connectionId: string): Choice<string> =>
  Option.match(findConnection(model, connectionId), {
    onNone: () => [
      connectionId,
      "Removed connection",
      { description: "This connection was removed.", isDisabled: true }
    ],
    onSome: ({ connection }) => [
      connectionId,
      connection.name,
      {
        ...(areIntegrationsListed(model)
          ? {
              description: Option.isSome(findIntegration(model, connection.integration))
                ? "Its integration doesn’t give this."
                : "Its integration isn’t installed on this host."
            }
          : {}),
        isDisabled: true
      }
    ]
  })
