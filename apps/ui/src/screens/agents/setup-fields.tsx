import { Show } from "solid-js"
import { Combobox } from "../../components/combobox/index.ts"
import { Field } from "../../components/field/index.ts"
import { TextArea } from "../../components/input/index.ts"
import { Select } from "../../components/select/index.ts"
import {
  effortLabels,
  efforts,
  type ConnectionOption,
  type Effort,
  type HarnessOption,
  type ModelChoices,
  type SetupField
} from "./wording.tsx"

/** The harness choice that lets amends choose one as the agent works. */
export const autoHarness = "auto"

/** A connection as a choice: its integration under its name, and why it can't be chosen. */
const connectionChoice = (option: ConnectionOption, description = option.integrationName) => ({
  value: option.id,
  label: option.name,
  description,
  ...(option.unavailable === undefined
    ? {}
    : {
        detail: option.unavailable,
        status: { mark: "blocked", label: "Unavailable" } as const,
        disabled: true
      })
})

export interface SetupFieldsProps {
  readonly instructions: string
  readonly onInstructionsChange: (instructions: string) => void
  /** `auto`, or the id of a connection that gives harnesses. */
  readonly harness: string | undefined
  readonly onHarnessChange: (harness: string) => void
  readonly harnesses: ReadonlyArray<HarnessOption>
  readonly modelConnections: ReadonlyArray<ConnectionOption>
  readonly modelConnectionId: string | undefined
  readonly onModelConnectionChange: (connectionId: string) => void
  /** The models the chosen connection offers. */
  readonly models?: ModelChoices
  /** The model's id, as its provider gives it. */
  readonly model: string
  readonly onModelChange: (model: string) => void
  /** Undefined for the model's default. */
  readonly effort: Effort | undefined
  readonly onEffortChange: (effort: Effort | undefined) => void
  readonly sandboxes: ReadonlyArray<ConnectionOption>
  /** Undefined for no sandbox. */
  readonly sandboxId: string | undefined
  readonly onSandboxChange: (sandboxId: string | undefined) => void
  /** What the host refused, beside each part's field. */
  readonly problems?: Partial<Record<SetupField, string>>
  readonly disabled?: boolean
}

const noSandbox = "none"
const defaultEffort = "default"

/**
 * How an agent is set up, as adding and configuring ask for it: its instructions, the harness it
 * runs on or Auto, the model connection and the model, which the connection's list suggests and
 * which may be any other when the connection takes one it doesn't list, how hard the model
 * reasons, and the sandbox it works in, if any.
 */
export function SetupFields(props: SetupFieldsProps) {
  const harness = () => props.harnesses.find((option) => option.id === props.harness)
  const loaded = () => (props.models?.status === "loaded" ? props.models : undefined)
  const listedModel = () => loaded()?.listed.find((model) => model.id === props.model.trim())
  /** The efforts the chosen model takes: its own when listed, any when it isn't. */
  const offeredEfforts = (): ReadonlyArray<Effort> => listedModel()?.efforts ?? efforts
  const modelProblem = () => {
    const models = loaded()
    if (props.problems?.model) return props.problems.model
    if (models === undefined || models.unlisted || props.model.trim() === "") return undefined
    return listedModel() ? undefined : "This connection offers only the models it lists."
  }
  const sandboxProblem = () =>
    props.problems?.sandbox ??
    (harness()?.requiresSandbox && props.sandboxId === undefined
      ? `${harness()?.name} works only in a sandbox. Choose one.`
      : undefined)
  const modelHint = () => {
    if (props.modelConnectionId === undefined) return "Choose a model connection first."
    switch (props.models?.status) {
      case "loading":
        return "Loading this connection’s models…"
      case "failed":
        return "Its models couldn’t be loaded. You can still enter a model’s ID."
      case "loaded":
        if (!props.models.unlisted) return "Choose one of the models it lists."
        return props.models.listed.length > 0
          ? "Choose one it lists, or enter any model’s ID."
          : "Enter the ID of any model it serves."
      default:
        return undefined
    }
  }
  return (
    <>
      <Field.Root hint="What the agent works by: its role, how it answers, and what to avoid.">
        <Field.Label>Instructions</Field.Label>
        <TextArea
          value={props.instructions}
          onInput={(event) => props.onInstructionsChange(event.currentTarget.value)}
          rows={6}
          maxLength={20_000}
          disabled={props.disabled}
        />
      </Field.Root>
      <Field.Root
        hint={
          props.harnesses.every((option) => option.unavailable !== undefined)
            ? "No connection gives a harness yet. On Auto, the agent waits for one."
            : undefined
        }
        error={props.problems?.harness}
      >
        <Field.Label>Harness</Field.Label>
        <Select
          options={[
            {
              value: autoHarness,
              label: "Auto",
              description: "amends chooses a harness as the agent works"
            },
            ...props.harnesses.map((option) =>
              connectionChoice(
                option,
                `${option.integrationName} · ${
                  option.requiresSandbox ? "Works only in a sandbox" : "Works on this host"
                }`
              )
            )
          ]}
          value={props.harness}
          onChange={props.onHarnessChange}
          placeholder="Choose a harness"
          heading="Harnesses"
          disabled={props.disabled}
        />
      </Field.Root>
      <Field.Root
        hint={
          props.modelConnections.every((option) => option.unavailable !== undefined)
            ? "No connection gives models yet. Add one in Connections."
            : undefined
        }
        error={props.problems?.["model-connection"]}
      >
        <Field.Label>Model connection</Field.Label>
        <Select
          options={props.modelConnections.map((option) => connectionChoice(option))}
          value={props.modelConnectionId}
          onChange={props.onModelConnectionChange}
          placeholder="Choose a model connection"
          heading="Model connections"
          disabled={props.disabled}
        />
      </Field.Root>
      <Field.Root hint={modelHint()} error={modelProblem()}>
        <Field.Label>Model</Field.Label>
        <Combobox
          value={props.model}
          onChange={props.onModelChange}
          suggestions={(loaded()?.listed ?? []).map((model) => ({
            value: model.id,
            label: model.name
          }))}
          heading="Models"
          placeholder="Model ID"
          disabled={props.disabled || props.modelConnectionId === undefined}
          monospace
        />
      </Field.Root>
      <Show when={offeredEfforts().length > 0 || props.effort !== undefined}>
        <Field.Root hint="How hard the model reasons before it answers.">
          <Field.Label>Effort</Field.Label>
          <Select
            options={[
              { value: defaultEffort, label: "Model default" },
              ...[
                ...offeredEfforts(),
                ...(props.effort !== undefined && !offeredEfforts().includes(props.effort) ? [props.effort] : [])
              ].map((effort) => ({ value: effort, label: effortLabels[effort] }))
            ]}
            value={props.effort ?? defaultEffort}
            onChange={(value) => props.onEffortChange(value === defaultEffort ? undefined : (value as Effort))}
            disabled={props.disabled}
          />
        </Field.Root>
      </Show>
      <Field.Root error={sandboxProblem()}>
        <Field.Label>Sandbox</Field.Label>
        <Select
          options={[
            { value: noSandbox, label: "No sandbox", description: "Answers from its model alone" },
            ...props.sandboxes.map((option) => connectionChoice(option))
          ]}
          value={props.sandboxId ?? noSandbox}
          onChange={(value) => props.onSandboxChange(value === noSandbox ? undefined : value)}
          heading="Sandboxes"
          disabled={props.disabled}
        />
      </Field.Root>
    </>
  )
}
