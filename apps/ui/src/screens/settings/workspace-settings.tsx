import { Show, createSignal, createUniqueId, onCleanup } from "solid-js";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Count } from "../../components/count/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Select } from "../../components/select/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import {
  SettingsAlert,
  displayName,
  type SettingsAction,
  type SettingsError,
  type SettingsPerson,
} from "./wording.tsx";
import * as s from "./settings.css.ts";

/** A failure to show, and the change or read it came from. */
export interface SettingsFailure {
  readonly action: SettingsAction | "refresh";
  readonly error: SettingsError;
}

export interface WorkspaceSettingsProps {
  readonly workspaceId: string;
  /** The name being edited. */
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  /** The reader may rename the workspace. */
  readonly renamable: boolean;
  /** The name differs from the saved one. */
  readonly changed: boolean;
  readonly saving?: boolean;
  readonly onSave: () => void;
  readonly owner?: SettingsPerson;
  /** Opens TransferOwnership; shown to a reader who may transfer. */
  readonly onTransfer?: () => void;
  /** Nobody can become the owner yet. */
  readonly noCandidates?: boolean;
  readonly creator?: SettingsPerson;
  /** A failed rename, or a read that failed. */
  readonly failure?: SettingsFailure;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** "6f942c11…5b62": the start and end of a long id. */
const shortId = (id: string) => (id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id);

export function SectionHeading(props: {
  readonly children: string;
  readonly count?: number;
  readonly action?: { readonly label: string; readonly onClick: () => void };
}) {
  return (
    <div class={s.heading}>
      <h2 class={s.headingText}>{props.children}</h2>
      <Show when={props.count !== undefined}>
        <Count value={props.count ?? 0} />
      </Show>
      <Divider class={s.headingStitch} />
      <Show when={props.action}>
        {(action) => (
          <Button variant="quiet" onClick={() => action().onClick()}>
            {action().label}
          </Button>
        )}
      </Show>
    </div>
  );
}

/**
 * The Workspace tab: its name, its owner and transferring ownership, and its details. Place it
 * in SettingsPane.
 */
export function WorkspaceSettings(props: WorkspaceSettingsProps) {
  const formId = `workspace-name-${createUniqueId()}`;
  const [copied, setCopied] = createSignal(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  const copy = () => {
    void navigator.clipboard?.writeText(props.workspaceId).then(() => {
      setCopied(true);
      clearTimeout(timer);
      timer = setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <Pane.Body>
      <div class={s.workspace}>
        <div class={s.column}>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.changed && !props.saving) props.onSave();
            }}
          >
            <Field.Root
              hint={
                props.renamable
                  ? "This name is shown throughout your workspace."
                  : "Only the workspace owner can rename it."
              }
            >
              <Field.Label>Workspace name</Field.Label>
              <Input
                value={props.name}
                onInput={(event) => props.onNameChange(event.currentTarget.value)}
                autocomplete="organization"
                maxLength={80}
                disabled={!props.renamable || props.saving}
                required
              />
            </Field.Root>
            <Show when={props.failure}>
              {(failure) => (
                <SettingsAlert
                  action={failure().action}
                  error={failure().error}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
            <Show when={props.renamable}>
              <Button
                type="submit"
                variant="primary"
                class={s.start}
                disabled={!props.changed || props.saving}
              >
                Save changes
              </Button>
            </Show>
          </form>
          <Show when={props.owner}>
            {(owner) => (
              <section class={s.section} aria-label="Ownership">
                <SectionHeading>Ownership</SectionHeading>
                <div class={s.person}>
                  <Avatar
                    name={owner().name}
                    initials={owner().initials}
                    tone={owner().tone}
                    size={40}
                    decorative
                  />
                  <div class={s.personText}>
                    <span class={s.personName}>{displayName(owner())}</span>
                    <span class={s.personDetail}>Workspace owner</span>
                  </div>
                </div>
                <p class={s.note}>
                  {props.onTransfer && owner().you
                    ? "A workspace has one owner. Transferring ownership makes you an administrator."
                    : "A workspace has one owner."}
                </p>
                <Show when={props.onTransfer}>
                  {(transfer) => (
                    <>
                      <Show when={props.noCandidates}>
                        <p class={s.note}>Invite another person before transferring ownership.</p>
                      </Show>
                      <Button
                        class={s.phoneWide}
                        disabled={props.noCandidates}
                        onClick={() => transfer()()}
                      >
                        Transfer ownership
                      </Button>
                    </>
                  )}
                </Show>
              </section>
            )}
          </Show>
        </div>
        <section class={s.section} aria-label="Details">
          <SectionHeading>Details</SectionHeading>
          <div class={s.details}>
            <div class={s.detail}>
              <span class={s.detailLabel}>Workspace ID</span>
              <div class={s.detailRow}>
                <span class={s.detailValue} title={props.workspaceId}>
                  {shortId(props.workspaceId)}
                </span>
                <Button variant="quiet" onClick={copy} aria-label="Copy workspace ID">
                  {copied() ? "Copied" : "Copy ID"}
                </Button>
              </div>
            </div>
            <Show when={props.creator}>
              {(creator) => (
                <div class={s.detail}>
                  <span class={s.detailLabel}>Created by</span>
                  <span class={s.creator}>
                    <Avatar
                      name={creator().name}
                      initials={creator().initials}
                      tone={creator().tone}
                      size={28}
                      decorative
                    />
                    <span class={s.creatorName}>{creator().name}</span>
                  </span>
                </div>
              )}
            </Show>
          </div>
        </section>
      </div>
    </Pane.Body>
  );
}

export interface TransferOwnershipProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly workspaceName: string;
  /** Who may become the owner. */
  readonly candidates: readonly SettingsPerson[];
  readonly chosen?: string;
  readonly onChoose: (memberId: string) => void;
  readonly onConfirm: () => void;
  readonly pending?: boolean;
  readonly error?: SettingsError;
  readonly onRefresh?: () => void;
  readonly refreshing?: boolean;
}

/** Choosing the new owner and confirming the transfer. */
export function TransferOwnership(props: TransferOwnershipProps) {
  const formId = `transfer-ownership-${createUniqueId()}`;
  const close = () => {
    if (!props.pending) props.onClose();
  };
  const chosen = () => props.candidates.find((person) => person.id === props.chosen);
  return (
    <Modal.Root open={props.open} onClose={close} aria-label="Transfer ownership" size="compact">
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Transfer ownership</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={close} />
          </Pane.Actions>
          <Pane.Subtitle>{props.workspaceName}</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            class={s.form}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.chosen && !props.pending) props.onConfirm();
            }}
          >
            <Field.Root
              hint={`${chosen()?.name ?? "The new owner"} becomes the only owner. You’ll remain an administrator and lose owner-only actions.`}
            >
              <Field.Label>New owner</Field.Label>
              <Select
                options={props.candidates.map((person) => ({
                  value: person.id,
                  label: person.name,
                }))}
                value={props.chosen}
                onChange={props.onChoose}
                placeholder="Choose a member"
                disabled={props.pending}
              />
            </Field.Root>
            <Show when={props.error}>
              {(error) => (
                <SettingsAlert
                  action="transfer"
                  error={error()}
                  onRefresh={props.onRefresh}
                  refreshing={props.refreshing}
                />
              )}
            </Show>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={close} disabled={props.pending}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!props.chosen || props.pending}
          >
            Transfer ownership
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
