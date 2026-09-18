import { Workspace } from "@amends/core/workspace";
import { AccountPopover, AppShell, EntryShell, PageHeader, Text } from "@amends/ui/components";
import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { A, Navigate, useNavigate, useParams } from "@solidjs/router";
import { Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, createSignal, onMount, Show, Suspense, type ParentProps } from "solid-js";
import { ApiClient } from "../api/client.ts";
import { ClosedWorkspace } from "../pages/entry/closed.tsx";
import { href } from "../routes.tsx";
import { lastWorkspaceAtom, sessionAtom } from "../session/session.ts";
import { fromMembership, WorkspaceContext, type OpenedWorkspace } from "../workspace/context.tsx";
import { Navigation } from "./navigation.tsx";
import { PageHeaderContext, type PageHeaderContent } from "./page-header.tsx";
import { useTheme } from "./theme.ts";

const isWorkspaceId = Schema.is(Workspace.Id);

/**
 * Resolves the route's workspace against the reader's directory before any page
 * mounts, so an ended or unknown membership is explained instead of meeting a
 * silent permission error. Route changes inside replace only the content.
 */
export function WorkspaceShell(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>();
  const session = useAtomValue(() => sessionAtom);
  return (
    <Show when={session()} fallback={<Navigate href={href.signIn()} />}>
      <Show
        when={isWorkspaceId(params.workspaceId) && params.workspaceId}
        fallback={<ClosedWorkspace />}
      >
        {(workspaceId) => <Resolved workspaceId={workspaceId()}>{props.children}</Resolved>}
      </Show>
    </Show>
  );
}

function Resolved(props: ParentProps<{ workspaceId: Workspace.Id }>) {
  const listing = useAtomValue(() =>
    ApiClient.query("me", "workspaces", { reactivityKeys: ["me"] }),
  );
  const membership = createMemo(() => {
    const result = listing();
    if (!AsyncResult.isSuccess(result)) return undefined;
    const mine = result.value.memberships.filter(
      (candidate) => candidate.workspace.id === props.workspaceId,
    );
    return mine.find((candidate) => candidate.member.status === "active") ?? mine[0] ?? null;
  });
  return (
    <Show
      when={membership() !== undefined || AsyncResult.isFailure(listing())}
      fallback={
        <EntryShell home={{ href: href.picker({ choose: true }) }} title="Opening the workspace">
          <Text as="span" variant="inherit" role="status">
            Checking your membership.
          </Text>
        </EntryShell>
      }
    >
      <Show
        when={
          membership() && membership()!.member.status === "active"
            ? fromMembership(membership()!)
            : undefined
        }
        fallback={<ClosedWorkspace membership={membership() ?? undefined} />}
      >
        {(opened) => <Frame opened={opened()}>{props.children}</Frame>}
      </Show>
    </Show>
  );
}

function Frame(props: ParentProps<{ opened: OpenedWorkspace }>) {
  const [header, setHeader] = createSignal<(() => PageHeaderContent) | undefined>();
  const navigate = useNavigate();
  const setSession = useAtomSet(() => sessionAtom);
  const setLast = useAtomSet(() => lastWorkspaceAtom);
  const theme = useTheme();
  onMount(() => setLast(props.opened.id));
  const opened = () => props.opened;
  return (
    <WorkspaceContext.Provider value={opened}>
      <PageHeaderContext.Provider value={(value) => setHeader(() => value)}>
        <AppShell
          workspace={opened().id}
          caption={`${opened().owner ? "owner" : "member"} · ${opened().me.identity.id}`}
          header={(navigation) => (
            <PageHeader
              navigation={navigation}
              title="Home"
              summary={
                <A href={href.picker({ choose: true })}>
                  {opened().people === 1 ? "just you" : `${opened().people} people`} · switch
                  workspace
                </A>
              }
              {...header()?.()}
            />
          )}
          account={(compact) => (
            <AccountPopover
              name={opened().me.identity.id}
              identityDescription="Signed in with a one-time email code on this host."
              onSettings={() => navigate(href.settings(opened().id))}
              onSignOut={() => {
                setSession(undefined);
                navigate(href.signIn(), { replace: true });
              }}
              theme={theme}
              compact={compact}
              placement={compact ? "top-start" : "bottom-end"}
            />
          )}
          navigation={(compact, close) => <Navigation compact={compact} close={close} />}
        >
          <Suspense
            fallback={
              <Text as="span" variant="inherit" role="status">
                Loading page…
              </Text>
            }
          >
            {props.children}
          </Suspense>
        </AppShell>
      </PageHeaderContext.Provider>
    </WorkspaceContext.Provider>
  );
}
