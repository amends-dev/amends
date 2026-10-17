import { IconMarkNew, IconMarkOpen } from "@amends-dev/icons"
import { For, Show, createEffect, createSignal, createUniqueId, onCleanup } from "solid-js"
import { Avatar } from "../../components/avatar/index.ts"
import { Button } from "../../components/button/index.ts"
import { Count } from "../../components/count/index.ts"
import { Divider } from "../../components/divider/index.ts"
import { EmptyState } from "../../components/empty-state/index.ts"
import { Field } from "../../components/field/index.ts"
import { Input } from "../../components/input/index.ts"
import { Toast } from "../../components/toast/index.ts"
import { Keyed } from "../../internal/keyed.tsx"
import { Modal } from "../../patterns/modal/index.ts"
import { Pane } from "../../patterns/pane/index.ts"
import { StandaloneScreen, type StandaloneAccount } from "../standalone/index.ts"
import * as s from "./workspaces.css.ts"

export interface PickerWorkspace {
  readonly id: string
  readonly name: string
  readonly initials?: string
  /** Active members, the reader included. */
  readonly memberCount: number
  /** The reader owns it. */
  readonly owner?: boolean
  readonly href: string
}

export interface PickerInvitation {
  readonly id: string
  /** Once joined, focus moves to this workspace in the list. */
  readonly workspaceId: string
  /** Absent when the reader may not see it yet. */
  readonly workspaceName?: string
  readonly initials?: string
  readonly expiresAt: Date
}

/** Why accepting failed, or `refresh-failed` when it joined but the list did not reload. */
export type AcceptInvitationError =
  | "invalid-name"
  | "changed"
  | "denied"
  | "gone"
  | "invalid"
  | "failed"
  | "refresh-failed"

/** The latest attempt to accept an invitation. */
export interface PickerAccept {
  readonly invitationId: string
  readonly pending: boolean
  readonly error?: AcceptInvitationError
  /** The reader is a member now; a retry only reloads the list. */
  readonly joined: boolean
}

export interface WorkspacePickerProps {
  readonly homeHref: string
  readonly account: StandaloneAccount
  readonly workspaces: ReadonlyArray<PickerWorkspace>
  readonly invitations: ReadonlyArray<PickerInvitation>
  /** The list could not be reloaded; it shows what was loaded before. */
  readonly refreshFailed?: boolean
  readonly onRetry?: () => void
  readonly accept?: PickerAccept
  /** The name Join suggests, such as one from the reader's email address. */
  readonly suggestedName?: string
  /** Join as `name`. */
  readonly onAccept: (id: string, name: string) => void
  /** Opens a workspace in place of following its link. */
  readonly onOpen?: (id: string) => void
  readonly onCreateWorkspace: () => void
  /** For expiry wording. Default the current time. */
  readonly now?: Date
}

const acceptMessages: { readonly [Error in AcceptInvitationError]: string } = {
  "invalid-name": "Use 1 to 80 characters, with no invisible ones.",
  changed: "This invitation changed while you were accepting it. Try again.",
  denied: "This invitation isn’t addressed to this address.",
  gone: "This invitation is no longer available.",
  invalid: "This invitation can’t be accepted as it is.",
  failed: "We couldn’t accept the invitation. Try again when the host is available.",
  "refresh-failed": "Joined, but we couldn’t load your workspaces. Try again."
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`
const invitationName = (invitation: PickerInvitation) => invitation.workspaceName ?? "Workspace invitation"

const day = 86_400_000
/** Such as "Expires in 7 days", or a date when it is far off. */
function expiry(at: Date, now: Date) {
  const left = at.getTime() - now.getTime()
  if (left <= 0) return "Expired"
  if (left > 30 * day) return `Expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(at)}`
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
  return left < day
    ? `Expires ${relative.format(Math.ceil(left / 3_600_000), "hour")}`
    : `Expires ${relative.format(Math.ceil(left / day), "day")}`
}

/** After sign-in: the reader's workspaces and invitations, and creating a workspace. */
export function WorkspacePicker(props: WorkspacePickerProps) {
  const id = createUniqueId()
  const [joining, setJoining] = createSignal<{
    readonly id: string
    readonly name: string
    readonly workspaceId?: string
  }>()
  const links = new Map<string, HTMLAnchorElement>()
  const [memberName, setMemberName] = createSignal("")
  const [toasts, setToasts] = createSignal<ReadonlyArray<{ id: number; text: string }>>([])
  let toastId = 0
  const attempt = () => {
    const current = joining()
    return current && props.accept?.invitationId === current.id ? props.accept : undefined
  }
  // Joining closes the dialog and confirms it; a failure stays in the dialog to retry.
  createEffect(() => {
    const current = joining(),
      accept = attempt()
    if (!current || !accept?.joined || accept.pending || accept.error) return
    setJoining(undefined)
    setToasts([...toasts(), { id: ++toastId, text: `Joined ${current.name}` }])
    // The invitation's button has gone, so focus goes to the workspace it opened.
    const workspaceId = current.workspaceId
    if (workspaceId) queueMicrotask(() => links.get(workspaceId)?.focus())
  })
  const close = () => {
    if (!attempt()?.pending) setJoining(undefined)
  }
  const empty = () => props.workspaces.length === 0 && props.invitations.length === 0
  const summary = () => {
    if (empty()) return "Create a workspace to get started."
    if (props.workspaces.length === 0)
      return `${plural(props.invitations.length, "invitation", "invitations")} waiting for you.`
    const parts = [plural(props.workspaces.length, "workspace", "workspaces")]
    if (props.invitations.length > 0)
      parts.push(plural(props.invitations.length, "pending invitation", "pending invitations"))
    return parts.join(" · ")
  }
  const formId = `join-${id}`
  const title = () => `Join ${joining()?.name ?? "workspace"}`
  return (
    <StandaloneScreen homeHref={props.homeHref} account={props.account} width="directory">
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
      <Show when={props.refreshFailed}>
        <div class={s.notice}>
          <Field.Alert>Couldn’t refresh your workspaces.</Field.Alert>
          <Show when={props.onRetry}>
            {(retry) => (
              <Button variant="quiet" onClick={() => retry()()}>
                Try again
              </Button>
            )}
          </Show>
        </div>
      </Show>
      <Show when={empty()}>
        <div class={s.empty}>
          <EmptyState
            art="sew-in"
            title="No workspaces yet"
            lines={["Create a workspace for your team. Invitations will appear here."]}
          >
            <Button variant="primary" icon={IconMarkNew} onClick={() => props.onCreateWorkspace()}>
              Create workspace
            </Button>
          </EmptyState>
        </div>
      </Show>
      <Show when={props.workspaces.length > 0}>
        <section class={s.section} aria-labelledby={`${id}-workspaces`}>
          <h2 class={s.sectionHeading} id={`${id}-workspaces`}>
            <span class={s.sectionLabel}>Your workspaces</span>
            <Count value={props.workspaces.length} />
            <Divider class={s.sectionStitch} />
          </h2>
          <ul class={s.list}>
            <Keyed each={props.workspaces} by={(workspace) => workspace.id}>
              {(workspace) => (
                <li class={s.row} data-link="">
                  <Avatar
                    name={workspace().name}
                    initials={workspace().initials}
                    variant="workspace"
                    size={40}
                    decorative
                  />
                  <span class={s.text}>
                    <a
                      ref={(link) => {
                        // Rows are keyed by ID; read it now, since the row's accessor is stale
                        // by the time a removed row cleans up.
                        const id = workspace().id
                        links.set(id, link)
                        onCleanup(() => links.delete(id))
                      }}
                      href={workspace().href}
                      class={s.name}
                      onClick={(event) => {
                        if (!props.onOpen) return
                        event.preventDefault()
                        props.onOpen(workspace().id)
                      }}
                    >
                      {workspace().name}
                    </a>
                    <span class={s.detail}>
                      {plural(workspace().memberCount, "member", "members")}
                      {workspace().owner ? " · Owner" : ""}
                    </span>
                  </span>
                  <span class={s.open} aria-hidden="true">
                    Open
                    <IconMarkOpen class={s.openIcon} />
                  </span>
                </li>
              )}
            </Keyed>
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
            <Keyed each={props.invitations} by={(invitation) => invitation.id}>
              {(invitation) => (
                <li class={s.row}>
                  <Avatar
                    name={invitationName(invitation())}
                    initials={invitation().initials}
                    variant="workspace"
                    size={40}
                    decorative
                  />
                  <span class={s.text}>
                    <span class={s.name}>{invitationName(invitation())}</span>
                    <span class={s.detail}>
                      Pending invitation · {expiry(invitation().expiresAt, props.now ?? new Date())}
                    </span>
                  </span>
                  <Button
                    class={s.accept}
                    aria-label={`Accept invite to ${invitationName(invitation())}`}
                    onClick={() => {
                      setMemberName(props.suggestedName ?? "")
                      setJoining({
                        id: invitation().id,
                        name: invitation().workspaceName ?? "this workspace",
                        workspaceId: invitation().workspaceId
                      })
                    }}
                  >
                    Accept invite
                  </Button>
                </li>
              )}
            </Keyed>
          </ul>
        </section>
        <Show when={props.workspaces.length === 0}>
          <p class={s.footnote}>Accept an invitation above, or create your own workspace.</p>
        </Show>
      </Show>
      <Modal.Root open={joining() !== undefined} onClose={close} aria-label={title()} size="compact">
        <Pane.Root variant="modal">
          <Pane.Header>
            <Pane.Title>{title()}</Pane.Title>
            <Pane.Actions>
              <Pane.Close label="Close" onClick={close} />
            </Pane.Actions>
            <Pane.Subtitle>What should people there call you? You can change it later.</Pane.Subtitle>
          </Pane.Header>
          <Pane.Body>
            <form
              id={formId}
              class={s.form}
              onSubmit={(event) => {
                event.preventDefault()
                const current = joining()
                if (current && !attempt()?.pending) props.onAccept(current.id, memberName().trim())
              }}
            >
              <Field.Root error={attempt()?.error === "invalid-name" ? acceptMessages["invalid-name"] : undefined}>
                <Field.Label>Your name</Field.Label>
                <Input
                  value={memberName()}
                  onInput={(event) => setMemberName(event.currentTarget.value)}
                  onFocus={(event) => event.currentTarget.select()}
                  autocomplete="name"
                  maxLength={80}
                  disabled={attempt()?.pending || attempt()?.joined}
                  autofocus
                  required
                />
              </Field.Root>
              <Show when={attempt()?.error !== "invalid-name" && attempt()?.error}>
                {(error) => <Field.Alert>{acceptMessages[error()]}</Field.Alert>}
              </Show>
            </form>
          </Pane.Body>
          <Modal.Actions>
            <Button onClick={close} disabled={attempt()?.pending}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" disabled={attempt()?.pending}>
              {attempt()?.joined ? "Try again" : "Join"}
            </Button>
          </Modal.Actions>
        </Pane.Root>
      </Modal.Root>
      <Toast.Region>
        <For each={toasts()}>
          {(item) => (
            <Toast.Item onDismiss={() => setToasts(toasts().filter((other) => other.id !== item.id))}>
              {item.text}
            </Toast.Item>
          )}
        </For>
      </Toast.Region>
    </StandaloneScreen>
  )
}
