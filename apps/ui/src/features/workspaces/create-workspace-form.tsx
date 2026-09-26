import { createEffect, createSignal, createUniqueId, Show, splitProps, type JSX } from "solid-js";
import { Field } from "../../compositions/field/index.ts";
import { Button } from "../../primitives/button/index.ts";
import { Input } from "../../primitives/input/index.ts";
import { Column } from "../../primitives/layout/index.ts";
import { Text } from "../../primitives/text/index.ts";
import { classes } from "../../primitives/internal/props.ts";
import * as s from "./create-workspace-form.css.ts";

export type CreateWorkspaceFormProps = Omit<
  JSX.FormHTMLAttributes<HTMLFormElement>,
  "children" | "onSubmit" | "onReset" | "noValidate" | "novalidate"
> & {
  name: string;
  onNameChange: (name: string) => void;
  /** What people in the new workspace will call its creator; optional. */
  memberName?: string;
  onMemberNameChange?: (name: string) => void;
  memberNameError?: string;
  onSubmit: (name: string) => void;
  pending?: boolean;
  nameError?: string;
  requestError?: string;
  headingAs?: "h1" | "h2" | "h3";
};
export function CreateWorkspaceForm(props: CreateWorkspaceFormProps) {
  const [local, native] = splitProps(props, [
    "name",
    "onNameChange",
    "memberName",
    "onMemberNameChange",
    "memberNameError",
    "onSubmit",
    "pending",
    "nameError",
    "requestError",
    "headingAs",
    "class",
    "classList",
    "aria-labelledby",
  ]);
  const id = createUniqueId();
  let input!: HTMLInputElement;
  const [error, setError] = createSignal<string>();
  createEffect(() => {
    const value = local.name;
    if (input.value !== value) input.value = value;
    setError(undefined);
  });
  return (
    <Column
      {...native}
      as="form"
      gap={6}
      class={classes(s.root, local.class, local.classList)}
      aria-labelledby={local["aria-labelledby"] ?? `${id}-heading`}
      onReset={(e) => e.preventDefault()}
      onSubmit={(e) => {
        e.preventDefault();
        if (local.pending || input.matches(":disabled")) return;
        if (!input.value.trim()) {
          setError("Enter a workspace name.");
          input.focus();
          return;
        }
        if (!input.reportValidity() || local.nameError) {
          input.focus();
          return;
        }
        local.onSubmit(input.value);
      }}
    >
      <Column gap={2}>
        <Text as={local.headingAs ?? "h1"} variant="heading" id={`${id}-heading`}>
          Name your workspace
        </Text>
        <Text tone="secondary">A shared place for your work. You’ll be its owner.</Text>
      </Column>
      <Field label="Workspace name" required error={local.nameError || error()} aria-live="polite">
        {(control) => (
          <Input
            {...control}
            ref={(element) => {
              input = element;
            }}
            name="workspaceName"
            autocomplete="off"
            placeholder="Acme Finance"
            readOnly={local.pending}
            onInput={(e) => {
              setError(undefined);
              local.onNameChange(e.currentTarget.value);
            }}
            onInvalid={(e) => {
              e.preventDefault();
              setError("Enter a workspace name.");
              input.focus();
            }}
          />
        )}
      </Field>
      <Show when={local.onMemberNameChange}>
        {(change) => (
          <Field
            label="Your name"
            description="What people in this workspace will call you. You can change it later."
            error={local.memberNameError}
          >
            {(control) => (
              <Input
                {...control}
                name="memberName"
                autocomplete="name"
                value={local.memberName ?? ""}
                readOnly={local.pending}
                onInput={(e) => change()(e.currentTarget.value)}
              />
            )}
          </Field>
        )}
      </Show>
      <div>
        <Button type="submit" pending={local.pending} class={s.submit}>
          Create workspace
        </Button>
        <Text role="status" aria-atomic="true" tone="secondary" class={s.feedback}>
          {local.pending ? "Creating your workspace…" : ""}
        </Text>
        <Text role="alert" aria-atomic="true" tone="danger" class={s.feedback}>
          {local.requestError ?? ""}
        </Text>
      </div>
    </Column>
  );
}
