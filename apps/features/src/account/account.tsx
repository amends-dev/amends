import {
  useAppearance,
  useMemberName,
  useSession,
  useWorkspace,
  type WorkspaceFailure,
} from "@amends/client";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Field } from "@amends/ui/compositions/field";
import { AccountMenu } from "@amends/ui/features/account";
import { ThemeChoice } from "@amends/ui/features/appearance";
import { Button } from "@amends/ui/primitives/button";
import { Input } from "@amends/ui/primitives/input";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createEffect, createUniqueId, on, Show } from "solid-js";
import { initials } from "../internal/names.ts";

export const Root = AccountMenu.Root;
export const Content = AccountMenu.Content;
export const Actions = AccountMenu.Actions;
export const Link = AccountMenu.Link;
/** The name the reader chose in a workspace, when one is open and they have. */
function useOwnName(workspaceId: () => string | undefined) {
  const membership = useWorkspace(() => workspaceId() ?? "");
  return () => (workspaceId() === undefined ? undefined : membership()?.member.name);
}
/** Opens the account menu. Inside a workspace it names the reader as they are called there. */
export function Trigger(props: { readonly workspaceId?: string }) {
  const session = useSession();
  const name = useOwnName(() => props.workspaceId);
  const shown = () => name() ?? session.session?.humanId;
  return (
    <AccountMenu.Trigger
      label={`Your account: ${shown() ?? "Signed out"}`}
      initials={initials(shown() ?? "?")}
    />
  );
}
/** Who is signed in, and inside a workspace, what people there call them. */
export function Identity(props: { readonly workspaceId?: string }) {
  const session = useSession();
  const name = useOwnName(() => props.workspaceId);
  return (
    <AccountMenu.Identity
      identifier={session.session?.humanId ?? "Signed out"}
      name={name()}
      initials={initials(name() ?? session.session?.humanId ?? "?")}
    />
  );
}
/** Opens a way to change what people in the open workspace call the reader. */
export function ChangeName(props: { readonly onClick: () => void }) {
  return <AccountMenu.Action onClick={() => props.onClick()}>Change your name</AccountMenu.Action>;
}
const nameMessages: { readonly [Failure in WorkspaceFailure]: string } = {
  changed: "Your name changed meanwhile. Try again.",
  denied: "You can no longer change your name here.",
  gone: "You are no longer in this workspace.",
  invalid: "Use 1 to 80 characters.",
  failed: "Your name could not be saved. Try again when the host is available.",
};
export interface NameDialogProps {
  readonly workspaceId: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}
/**
 * Change what people in a workspace call the reader, starting from their name there, or a
 * suggestion from the identity they sign in as.
 */
export function NameDialog(props: NameDialogProps) {
  const form = createUniqueId();
  let field: HTMLInputElement | undefined;
  const name = useMemberName(props.workspaceId, () => props.onOpenChange(false));
  // The app opens the dialog from the menu, so each opening starts again from the saved name.
  createEffect(
    on(
      () => props.open,
      (open) => {
        if (open) name.reset();
      },
    ),
  );
  return (
    <Dialog.Root
      open={props.open}
      initialFocus={() => {
        queueMicrotask(() => field?.select());
        return field;
      }}
      onOpenChange={(next) => {
        if (name.pending()) return;
        props.onOpenChange(next);
      }}
    >
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>Your name</Dialog.Title>
          <Dialog.Description>
            What people in this workspace call you. Other workspaces keep their own.
          </Dialog.Description>
        </Dialog.Header>
        <Dialog.Body>
          <form
            id={form}
            onSubmit={(event) => {
              event.preventDefault();
              name.save();
            }}
          >
            <Column gap={3}>
              <Field label="Name">
                {(control) => (
                  <Input
                    {...control}
                    ref={(element) => {
                      field = element;
                    }}
                    autocomplete="name"
                    value={name.name()}
                    onInput={(event) => name.setName(event.currentTarget.value)}
                    disabled={name.pending()}
                  />
                )}
              </Field>
              <Show when={name.error()}>
                {(failure) => (
                  <Text role="alert" tone="danger">
                    {nameMessages[failure()]}
                  </Text>
                )}
              </Show>
            </Column>
          </form>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close variant="secondary" disabled={name.pending()}>
            Cancel
          </Dialog.Close>
          <Button
            type="submit"
            form={form}
            pending={name.pending()}
            disabled={!name.ready() && !name.pending()}
          >
            Save name
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
export function Appearance() {
  const appearance = useAppearance();
  return <ThemeChoice value={appearance.preference()} onValueChange={appearance.setPreference} />;
}
export function SignOut() {
  const session = useSession();
  return <AccountMenu.SignOut onClick={() => session.replace(undefined)} />;
}
