import { For, Show, createUniqueId } from "solid-js";
import { IconMarkNew, IconMarkOpen, IconUsers } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Count } from "../../components/count/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import { Field } from "../../components/field/index.ts";
import { Input } from "../../components/input/index.ts";
import { Centered } from "../../patterns/centered/index.ts";
import { Modal } from "../../patterns/modal/index.ts";
import { Pane } from "../../patterns/pane/index.ts";
import * as s from "./workspaces.css.ts";

export interface PickerWorkspace {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  /** Such as "12 members" or "4 members · Owner". */
  readonly detail: string;
  readonly href: string;
}

export interface PickerInvitation {
  readonly id: string;
  readonly name: string;
  readonly initials?: string;
  /** Such as "Pending invitation · Expires in 7 days". */
  readonly detail: string;
}

export interface WorkspacePickerProps {
  readonly homeHref: string;
  readonly account: { readonly email: string; readonly name: string; readonly initials?: string };
  readonly onSignOut: () => void;
  readonly workspaces: readonly PickerWorkspace[];
  readonly invitations: readonly PickerInvitation[];
  readonly onAccept: (id: string) => void;
  /** The invitation being accepted, if any. */
  readonly acceptingId?: string;
  /** Opens a workspace in place of following its link. */
  readonly onOpen?: (id: string) => void;
  readonly onCreateWorkspace: () => void;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** After sign-in: the reader's workspaces and invitations, and creating a workspace. */
export function WorkspacePicker(props: WorkspacePickerProps) {
  const id = createUniqueId();
  const empty = () => props.workspaces.length === 0 && props.invitations.length === 0;
  const summary = () => {
    if (empty()) return "Create a workspace to get started.";
    if (props.workspaces.length === 0)
      return `${plural(props.invitations.length, "invitation", "invitations")} waiting for you.`;
    const parts = [plural(props.workspaces.length, "workspace", "workspaces")];
    if (props.invitations.length > 0)
      parts.push(plural(props.invitations.length, "pending invitation", "pending invitations"));
    return parts.join(" · ");
  };
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
        <Centered.Actions>
          <span class={s.account}>
            <Avatar
              name={props.account.name}
              initials={props.account.initials}
              variant="workspace"
              size={28}
              decorative
            />
            <span class={s.accountEmail}>{props.account.email}</span>
          </span>
          <Button onClick={() => props.onSignOut()}>Sign out</Button>
        </Centered.Actions>
      </Centered.Header>
      <Centered.Body width="directory">
        <div class={s.heading}>
          <div class={s.titles}>
            <h1 class={s.title}>Choose a workspace</h1>
            <p class={s.summary}>{summary()}</p>
          </div>
          <Show when={!empty()}>
            <Button icon={IconMarkNew} onClick={() => props.onCreateWorkspace()}>
              Create workspace
            </Button>
          </Show>
        </div>
        <Show when={empty()}>
          <div class={s.empty}>
            <EmptyState
              icon={IconUsers}
              title="No workspaces yet"
              lines={["Create a workspace for your team. Invitations will appear here."]}
            />
          </div>
          <Button
            variant="primary"
            icon={IconMarkNew}
            class={s.emptyAction}
            onClick={() => props.onCreateWorkspace()}
          >
            Create workspace
          </Button>
        </Show>
        <Show when={props.workspaces.length > 0}>
          <section class={s.section} aria-labelledby={`${id}-workspaces`}>
            <h2 class={s.sectionHeading} id={`${id}-workspaces`}>
              <span class={s.sectionLabel}>Your workspaces</span>
              <Count value={props.workspaces.length} />
              <Divider class={s.sectionStitch} />
            </h2>
            <ul class={s.list}>
              <For each={props.workspaces}>
                {(workspace) => (
                  <li class={s.row} data-link="">
                    <Avatar
                      name={workspace.name}
                      initials={workspace.initials}
                      variant="workspace"
                      size={40}
                      decorative
                    />
                    <span class={s.text}>
                      <a
                        href={workspace.href}
                        class={s.name}
                        onClick={(event) => {
                          if (!props.onOpen) return;
                          event.preventDefault();
                          props.onOpen(workspace.id);
                        }}
                      >
                        {workspace.name}
                      </a>
                      <span class={s.detail}>{workspace.detail}</span>
                    </span>
                    <span class={s.open} aria-hidden="true">
                      Open
                      <IconMarkOpen class={s.openIcon} />
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
        <Show when={props.invitations.length > 0}>
          <section class={s.section} aria-labelledby={`${id}-invitations`}>
            <h2 class={s.sectionHeading} id={`${id}-invitations`}>
              <span class={s.sectionLabel}>Invitations</span>
              <Count value={props.invitations.length} />
              <Divider class={s.sectionStitch} />
            </h2>
            <ul class={s.list}>
              <For each={props.invitations}>
                {(invitation) => (
                  <li class={s.row}>
                    <Avatar
                      name={invitation.name}
                      initials={invitation.initials}
                      variant="workspace"
                      size={40}
                      decorative
                    />
                    <span class={s.text}>
                      <span class={s.name}>{invitation.name}</span>
                      <span class={s.detail}>{invitation.detail}</span>
                    </span>
                    <Button
                      class={s.accept}
                      aria-label={`Accept invite to ${invitation.name}`}
                      disabled={props.acceptingId === invitation.id}
                      onClick={() => props.onAccept(invitation.id)}
                    >
                      Accept invite
                    </Button>
                  </li>
                )}
              </For>
            </ul>
          </section>
          <Show when={props.workspaces.length === 0}>
            <p class={s.footnote}>Accept an invitation above, or create your own workspace.</p>
          </Show>
        </Show>
      </Centered.Body>
    </Centered.Root>
  );
}

export interface CreateWorkspaceProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly error?: string;
  readonly creating?: boolean;
  readonly onCreate: () => void;
}

/** Naming a new workspace in a compact modal; the reader becomes its owner. */
export function CreateWorkspace(props: CreateWorkspaceProps) {
  const formId = `create-workspace-${createUniqueId()}`;
  return (
    <Modal.Root
      open={props.open}
      onClose={() => props.onClose()}
      aria-label="Create workspace"
      size="compact"
    >
      <Pane.Root variant="modal">
        <Pane.Header>
          <Pane.Title>Create workspace</Pane.Title>
          <Pane.Actions>
            <Pane.Close label="Close" onClick={() => props.onClose()} />
          </Pane.Actions>
          <Pane.Subtitle>A shared place for your team.</Pane.Subtitle>
        </Pane.Header>
        <Pane.Body>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              if (props.name.trim() && !props.creating) props.onCreate();
            }}
          >
            <Field.Root hint="You’ll be the owner of this workspace." error={props.error}>
              <Field.Label>Workspace name</Field.Label>
              <Input
                value={props.name}
                onInput={(event) => props.onNameChange(event.currentTarget.value)}
                autocomplete="organization"
                autofocus
                required
              />
            </Field.Root>
          </form>
        </Pane.Body>
        <Modal.Actions>
          <Button onClick={() => props.onClose()}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!props.name.trim() || props.creating}
          >
            Create workspace
          </Button>
        </Modal.Actions>
      </Pane.Root>
    </Modal.Root>
  );
}
