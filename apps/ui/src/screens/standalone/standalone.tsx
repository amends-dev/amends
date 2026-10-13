import { Match, Show, Switch, type JSX } from "solid-js"
import { Avatar } from "../../components/avatar/index.ts"
import { Button } from "../../components/button/index.ts"
import { EmptyState } from "../../components/empty-state/index.ts"
import { Centered } from "../../patterns/centered/index.ts"
import * as s from "./standalone.css.ts"

export interface StandaloneAccount {
  /** The address the reader signed in with. */
  readonly identity: string
  readonly onSignOut: () => void
}

export interface StandaloneScreenProps {
  readonly homeHref: string
  /** Shows the identity and Sign out; omit for guests. */
  readonly account?: StandaloneAccount
  readonly width: "form" | "directory"
  readonly children: JSX.Element
}

/** A Centered screen with the brand and, when signed in, the account and Sign out. */
export function StandaloneScreen(props: StandaloneScreenProps) {
  return (
    <Centered.Root>
      <Centered.Header>
        <Centered.Brand href={props.homeHref} />
        <Show when={props.account}>
          {(account) => (
            <Centered.Actions>
              <span class={s.account}>
                <Avatar name={account().identity} variant="workspace" size={28} decorative />
                <span class={s.identity}>{account().identity}</span>
              </span>
              <Button onClick={() => account().onSignOut()}>Sign out</Button>
            </Centered.Actions>
          )}
        </Show>
      </Centered.Header>
      <Centered.Body width={props.width}>{props.children}</Centered.Body>
    </Centered.Root>
  )
}

interface StatusProps {
  readonly homeHref: string
  readonly account?: StandaloneAccount
}

/** While a restored session is checked against the host. */
export function CheckingSessionScreen(props: StatusProps) {
  return (
    <StandaloneScreen homeHref={props.homeHref} account={props.account} width="form">
      <div class={s.status} role="status">
        <EmptyState
          level={1}
          art="working"
          title="Checking your session"
          lines={["Connecting to your workspace host…"]}
        />
      </div>
    </StandaloneScreen>
  )
}

/** The host could not be reached; the reader stays signed in. */
export function HostUnavailableScreen(props: StatusProps & { readonly onRetry: () => void }) {
  return (
    <StandaloneScreen homeHref={props.homeHref} account={props.account} width="form">
      <div class={s.status}>
        <EmptyState
          level={1}
          art="lost-thread"
          title="Can’t reach your workspace host"
          lines={["You’re still signed in. Try again once the host is running."]}
        >
          <Button variant="primary" onClick={() => props.onRetry()}>
            Try again
          </Button>
        </EmptyState>
      </div>
    </StandaloneScreen>
  )
}

/** An address that matches no route. */
export function NotFoundScreen(props: StatusProps & { readonly onContinue: () => void; readonly signedIn: boolean }) {
  return (
    <StandaloneScreen homeHref={props.homeHref} account={props.account} width="form">
      <div class={s.status}>
        <EmptyState
          level={1}
          art="nothing-here"
          title="Nothing at this address"
          lines={["This page doesn’t exist. Check the link, or start again from your workspaces."]}
        >
          <Button variant="primary" onClick={() => props.onContinue()}>
            {props.signedIn ? "Your workspaces" : "Sign in"}
          </Button>
        </EmptyState>
      </div>
    </StandaloneScreen>
  )
}

/** A view stopped on an unexpected error. Shown outside the session, so without the account. */
export function CrashedScreen(props: { readonly homeHref: string; readonly onReload: () => void }) {
  return (
    <StandaloneScreen homeHref={props.homeHref} width="form">
      <div class={s.status}>
        <EmptyState
          level={1}
          art="came-apart"
          title="Something went wrong"
          lines={["amends stopped on an unexpected error. Reloading usually fixes it."]}
        >
          <Button variant="primary" onClick={() => props.onReload()}>
            Reload
          </Button>
        </EmptyState>
      </div>
    </StandaloneScreen>
  )
}

/** Why the reader cannot open a workspace. */
export type WorkspaceAccess =
  | { readonly reason: "invited"; readonly workspaceName?: string }
  | { readonly reason: "removed"; readonly workspaceName: string }
  | { readonly reason: "unknown" }

/** A workspace route without an active membership: an invitation to accept, an ended membership, or none. */
export function WorkspaceUnavailableScreen(
  props: StatusProps & {
    readonly access: WorkspaceAccess
    readonly identity: string
    readonly onWorkspaces: () => void
  }
) {
  return (
    <StandaloneScreen homeHref={props.homeHref} account={props.account} width="form">
      <div class={s.status}>
        <Switch>
          <Match when={props.access.reason === "invited" && props.access}>
            {(access) => (
              <EmptyState
                level={1}
                art="held-back"
                title="You haven’t joined this workspace yet"
                lines={[
                  `You’ve been invited to ${access().workspaceName ?? "this workspace"}. Accept the invitation from your workspaces to open it.`
                ]}
              >
                <Button variant="primary" onClick={() => props.onWorkspaces()}>
                  Your workspaces
                </Button>
              </EmptyState>
            )}
          </Match>
          <Match when={props.access.reason === "removed" && props.access}>
            {(access) => (
              <EmptyState
                level={1}
                art="held-back"
                title="That workspace is closed to you"
                lines={[
                  `Your membership of ${access().workspaceName} has ended. The work you did stays on that workspace’s record.`,
                  "Rejoining needs a fresh invitation."
                ]}
              >
                <Button onClick={() => props.onWorkspaces()}>Your workspaces</Button>
              </EmptyState>
            )}
          </Match>
          <Match when={props.access.reason === "unknown"}>
            <EmptyState
              level={1}
              art="held-back"
              title="That workspace is closed to you"
              lines={[
                `This workspace doesn’t exist, or it hasn’t been shared with ${props.identity}.`,
                "Ask a member to invite this address."
              ]}
            >
              <Button onClick={() => props.onWorkspaces()}>Your workspaces</Button>
            </EmptyState>
          </Match>
        </Switch>
      </div>
    </StandaloneScreen>
  )
}
