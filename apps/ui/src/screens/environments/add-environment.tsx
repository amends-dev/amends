import { For, Show, createUniqueId } from "solid-js";
import { Button } from "../../components/button/index.ts";
import { Choice } from "../../components/choice/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { sandboxProblem } from "./environment-pane.tsx";
import { SandboxFields, type SandboxFieldsProps } from "./sandbox-fields.tsx";
import {
  EnvironmentsAlert,
  placementLabels,
  problemMessage,
  type EnvironmentProblem,
  type EnvironmentsError,
  type HarnessOption,
  type Placement,
  type SandboxProviderOption,
} from "./wording.tsx";
import * as s from "./environments.css.ts";

export interface AddEnvironmentProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Basics, then the sandbox settings when the environment has a sandbox. */
  readonly step: "basics" | "sandbox";
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly harnesses: readonly HarnessOption[];
  readonly harnessId: string | undefined;
  readonly onHarnessChange: (harnessId: string) => void;
  readonly providers: readonly SandboxProviderOption[];
  /** The chosen sandbox provider; undefined for no sandbox. */
  readonly providerId: string | undefined;
  readonly onProviderChange: (providerId: string | undefined) => void;
  /** Where the harness can run with the chosen sandbox; offered only when there are two. */
  readonly placements: readonly Placement[];
  readonly placement: Placement | undefined;
  readonly onPlacementChange: (placement: Placement) => void;
  /** The basics are complete. */
  readonly basicsReady: boolean;
  readonly onContinue: () => void;
  readonly onBack: () => void;
  /** The sandbox settings being edited; the provider is the chosen one. */
  readonly sandbox: Omit<SandboxFieldsProps, "provider" | "problems" | "disabled">;
  /** Everything is complete, so the environment can be created. */
  readonly ready: boolean;
  readonly onCreate: () => void;
  readonly pending?: boolean;
  /** Why creating failed; the draft stays and retrying does not create it twice. */
  readonly error?: EnvironmentsError;
  readonly problems?: readonly EnvironmentProblem[];
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

const none = "none";

/**
 * Adding an environment. Basics name it and choose its harness and sandbox; an environment with a
 * sandbox then takes its sandbox settings in a second step. Choices are fixed once created.
 */
export function AddEnvironment(props: AddEnvironmentProps) {
  const formId = `add-environment-${createUniqueId()}`;
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  const provider = () => props.providers.find((option) => option.id === props.providerId);
  const sandboxStep = () => props.step === "sandbox" && provider() !== undefined;
  const has = (problem: EnvironmentProblem) => (props.problems ?? []).includes(problem);
  const generalProblems = () =>
    (props.problems ?? []).filter(
      (problem) =>
        !sandboxProblem(problem) &&
        problem !== "unknown-harness" &&
        problem !== "unknown-sandbox-provider" &&
        problem !== "unsupported-placement",
    );
  return (
    <Modal.Root
      open={props.open}
      onClose={close}
      aria-label="Add environment"
      size={sandboxStep() ? "wide" : "form"}
    >
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Add environment</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>
            {sandboxStep()
              ? `${props.name.trim() || "New environment"} · ${provider()?.name}`
              : props.providerId === undefined
                ? "Basics"
                : "1 of 2 · Basics"}
          </Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (busy()) return;
              if (!sandboxStep() && props.providerId !== undefined) {
                if (props.basicsReady) props.onContinue();
              } else if (props.ready) props.onCreate();
            }}
          >
            <Show
              when={sandboxStep() && provider()}
              fallback={
                <>
                  <Field.Root>
                    <Field.Label>Environment name</Field.Label>
                    <Input
                      value={props.name}
                      onInput={(event) => props.onNameChange(event.currentTarget.value)}
                      maxLength={80}
                      autocomplete="off"
                      disabled={busy()}
                      autofocus
                      required
                    />
                  </Field.Root>
                  <Field.Root
                    error={
                      has("unknown-harness") ? problemMessage("unknown-harness", "") : undefined
                    }
                  >
                    <Field.Label>Harness</Field.Label>
                    <Select
                      options={props.harnesses.map((harness) => ({
                        value: harness.id,
                        label: harness.name,
                      }))}
                      value={props.harnessId}
                      onChange={props.onHarnessChange}
                      placeholder="Choose a harness"
                      disabled={busy()}
                    />
                  </Field.Root>
                  <div class={s.field}>
                    <Choice.Group
                      label="Sandbox"
                      value={props.providerId ?? none}
                      onChange={(value) =>
                        props.onProviderChange(value === none ? undefined : value)
                      }
                      variant="card"
                      disabled={busy()}
                    >
                      <Choice.Option value={none} description="Run without a sandbox.">
                        No sandbox
                      </Choice.Option>
                      <For each={props.providers}>
                        {(option) => (
                          <Choice.Option value={option.id} description={option.description}>
                            {option.name}
                          </Choice.Option>
                        )}
                      </For>
                    </Choice.Group>
                    <Show when={has("unknown-sandbox-provider")}>
                      <Field.Alert>{problemMessage("unknown-sandbox-provider", "")}</Field.Alert>
                    </Show>
                  </div>
                  <Show when={props.placements.length > 1}>
                    <div class={s.field}>
                      <Choice.Group
                        label="Harness runs"
                        value={props.placement ?? "in-process"}
                        onChange={(value) => props.onPlacementChange(value as Placement)}
                        variant="card"
                        disabled={busy()}
                      >
                        <For each={props.placements}>
                          {(placement) => (
                            <Choice.Option value={placement}>
                              {placementLabels[placement]}
                            </Choice.Option>
                          )}
                        </For>
                      </Choice.Group>
                    </div>
                  </Show>
                  <Show when={has("unsupported-placement")}>
                    <Field.Alert>{problemMessage("unsupported-placement", "")}</Field.Alert>
                  </Show>
                </>
              }
            >
              {(chosen) => (
                <SandboxFields
                  {...props.sandbox}
                  provider={chosen()}
                  problems={props.problems}
                  disabled={busy()}
                />
              )}
            </Show>
            <Show when={props.error}>
              {(error) => (
                <EnvironmentsAlert
                  action="create"
                  error={error()}
                  problems={generalProblems()}
                  provider={provider()?.name}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Show
            when={sandboxStep()}
            fallback={
              <Button class={s.leading} onClick={close} disabled={busy()}>
                Cancel
              </Button>
            }
          >
            <Button class={s.leading} onClick={() => props.onBack()} disabled={busy()}>
              Back
            </Button>
          </Show>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            class={s.primary}
            disabled={
              busy() ||
              (!sandboxStep() && props.providerId !== undefined ? !props.basicsReady : !props.ready)
            }
          >
            {!sandboxStep() && props.providerId !== undefined ? "Continue" : "Create environment"}
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}

export interface ConfirmRemoveEnvironmentProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: EnvironmentsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Confirms removing an environment; its record stays in history. */
export function ConfirmRemoveEnvironment(props: ConfirmRemoveEnvironmentProps) {
  const busy = () => props.pending || props.refreshing;
  const close = () => {
    if (!busy()) props.onClose();
  };
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Remove environment" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Remove environment?</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.name}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <div class={s.stack}>
            <p class={s.confirm}>
              This environment will no longer be available in the workspace. Its record stays in
              history.
            </p>
            <Show when={props.error}>
              {(error) => (
                <EnvironmentsAlert
                  action="remove"
                  error={error()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </div>
        </Pane.Body>
        <Modal.Actions>
          <Button class={s.leading} onClick={close} disabled={busy()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            class={s.primary}
            disabled={busy()}
            onClick={() => props.onConfirm()}
          >
            Remove environment
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
