import type { Invitation } from "@amends/core/workspace";
import type { WorkspaceDirectory } from "@amends/gateway/directory";
import {
  Button,
  EmptyState,
  EmptyStateIllustration,
  Notice,
  Section,
  SectionStack,
  Text,
  WorkItemList,
  WorkItemRow,
  WorkspaceMark,
} from "@amends/ui/components";
import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Navigate, useNavigate, useSearchParams } from "@solidjs/router";
import { Exit } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, For, onMount, Show, Switch, Match } from "solid-js";
import { ApiClient } from "../../api/client.ts";
import { href } from "../../routes.tsx";
import { lastWorkspaceAtom, sessionAtom } from "../../session/session.ts";
import { explain } from "../../workspace/explain.ts";
import * as s from "./entry.css.ts";
import { Entry } from "./shell.tsx";

/** Everything the signed-in address can reach, or the way to make a first workspace. */
export function PickerPage() {
  const session = useAtomValue(() => sessionAtom);
  const [search] = useSearchParams<{ choose?: string }>();
  return (
    <Show when={session()} fallback={<Navigate href={href.signIn()} />}>
      <Picker choose={search.choose !== undefined} />
    </Show>
  );
}

function Picker(props: { choose: boolean }) {
  const listing = useAtomValue(() =>
    ApiClient.query("me", "workspaces", { reactivityKeys: ["me"] }),
  );
  const [last, setLast] = useAtom(() => lastWorkspaceAtom);
  const navigate = useNavigate();
  const open = (workspaceId: string) => {
    setLast(workspaceId);
    navigate(href.home(workspaceId));
  };
  return (
    <>
      {AsyncResult.matchWithError(listing(), {
        onInitial: () => (
          <Entry
            title="Where are you working?"
            blurb="Looking up your workspaces."
            width="wide"
            align="start"
          >
            <Text as="span" variant="inherit" role="status" />
          </Entry>
        ),
        // The only declared error is an unaccepted credential: the session is stale.
        onError: () => <StaleSession />,
        onDefect: (defect) => (
          <Entry title="Where are you working?" width="wide" align="start">
            <Notice tone="danger" live="assertive">
              Your workspaces could not be loaded. {String(defect)}
            </Notice>
          </Entry>
        ),
        onSuccess: ({ value }) => (
          <Choices listing={value} choose={props.choose} last={last()} onOpen={open} />
        ),
      })}
    </>
  );
}

function StaleSession() {
  const setSession = useAtomSet(() => sessionAtom);
  onMount(() => setSession(undefined));
  return <Navigate href={href.signIn()} />;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const describe = (memberships: number, invitations: number) =>
  invitations === 0
    ? `${count(memberships, "membership", "memberships")} for this address.`
    : `${count(memberships, "membership", "memberships")} and ${count(invitations, "invitation", "invitations")} for this address.`;

function Choices(props: {
  listing: WorkspaceDirectory.Listing;
  choose: boolean;
  last: string | undefined;
  onOpen: (workspaceId: string) => void;
}) {
  const active = createMemo(() =>
    props.listing.memberships.filter((membership) => membership.member.status === "active"),
  );
  const remembered = () =>
    !props.choose && active().find((membership) => membership.workspace.id === props.last);
  return (
    <Switch>
      <Match when={remembered()}>
        {(membership) => <Navigate href={href.home(membership().workspace.id)} />}
      </Match>
      <Match when={active().length === 0 && props.listing.invitations.length === 0}>
        <Empty onOpen={props.onOpen} />
      </Match>
      <Match when={true}>
        <Entry
          title="Where are you working?"
          blurb={describe(active().length, props.listing.invitations.length)}
          width="wide"
          align="start"
        >
          <SectionStack>
            <Show when={active().length > 0}>
              <Section title="Workspaces" count={active().length}>
                <WorkItemList label="Your workspaces">
                  <For each={active()}>
                    {(membership) => {
                      const owner = () =>
                        membership.workspace.ownerMemberId === membership.member.id;
                      return (
                        <WorkItemRow
                          title={membership.workspace.id}
                          titleKind="code"
                          leadingIcon={<WorkspaceMark name={membership.workspace.id} />}
                          supportingText={`${membership.people === 1 ? "just you" : count(membership.people, "person", "people")} · ${owner() ? "owner" : "member"}`}
                          onOpen={() => props.onOpen(membership.workspace.id)}
                        />
                      );
                    }}
                  </For>
                </WorkItemList>
              </Section>
            </Show>
            <Show when={props.listing.invitations.length > 0}>
              <Invitations invitations={props.listing.invitations} onOpen={props.onOpen} />
            </Show>
            <NewWorkspace onOpen={props.onOpen} />
            <Text as="span" variant="caption" tone="muted" class={s.hints}>
              last one opens by default next time
            </Text>
          </SectionStack>
        </Entry>
      </Match>
    </Switch>
  );
}

function Invitations(props: {
  invitations: ReadonlyArray<Invitation.Record>;
  onOpen: (workspaceId: string) => void;
}) {
  const [accepting, accept] = useAtom(() => ApiClient.mutation("invitations", "accept"), {
    mode: "promiseExit",
  });
  const take = async (invitation: Invitation.Record) => {
    const exit = await accept({
      params: { workspaceId: invitation.details.workspaceId, invitationId: invitation.details.id },
      reactivityKeys: ["me"],
    });
    if (Exit.isSuccess(exit)) props.onOpen(invitation.details.workspaceId);
  };
  return (
    <Section
      title="Invited"
      count={props.invitations.length}
      note="accepting creates the membership"
    >
      <WorkItemList label="Invitations">
        <For each={props.invitations}>
          {(invitation) => (
            <WorkItemRow
              title={invitation.details.workspaceId}
              titleKind="code"
              leadingIcon={<WorkspaceMark name={invitation.details.workspaceId} />}
              supportingText={
                invitation.details.grants.length === 0
                  ? "no permissions yet"
                  : `grants ${invitation.details.grants.map((grant) => grant.permission).join(", ")}`
              }
              actions={
                <Button
                  variant="primary"
                  pending={AsyncResult.isWaiting(accepting())}
                  onClick={() => void take(invitation)}
                >
                  accept
                </Button>
              }
            />
          )}
        </For>
      </WorkItemList>
      <Show when={AsyncResult.isFailure(accepting()) ? accepting() : undefined}>
        {(failed) => (
          <Notice tone="danger" live="assertive">
            {explain((failed() as AsyncResult.Failure<unknown, unknown>).cause)}
          </Notice>
        )}
      </Show>
    </Section>
  );
}

function NewWorkspace(props: { onOpen: (workspaceId: string) => void }) {
  const [creating, create] = useAtom(() => ApiClient.mutation("workspaces", "create"), {
    mode: "promiseExit",
  });
  const make = async () => {
    const exit = await create({ reactivityKeys: ["me"] });
    if (Exit.isSuccess(exit)) props.onOpen(exit.value.id);
  };
  return (
    <Section title="New workspace" note="you become its owner">
      <div class={s.actions}>
        <Button
          variant="secondary"
          pending={AsyncResult.isWaiting(creating())}
          onClick={() => void make()}
        >
          make a workspace
        </Button>
        <Show when={AsyncResult.isFailure(creating()) ? creating() : undefined}>
          {(failed) => (
            <Notice tone="danger" live="assertive">
              {explain((failed() as AsyncResult.Failure<unknown, unknown>).cause)}
            </Notice>
          )}
        </Show>
      </div>
    </Section>
  );
}

function Empty(props: { onOpen: (workspaceId: string) => void }) {
  const [creating, create] = useAtom(() => ApiClient.mutation("workspaces", "create"), {
    mode: "promiseExit",
  });
  const make = async () => {
    const exit = await create({ reactivityKeys: ["me"] });
    if (Exit.isSuccess(exit)) props.onOpen(exit.value.id);
  };
  return (
    <Entry
      title="Nothing here yet"
      blurb="You are signed in, but you do not belong to a workspace. Make one and it takes about two minutes to get an agent doing work."
      width="wide"
      align="start"
    >
      <EmptyState
        title="No workspaces"
        description="Waiting on an invitation instead? It will appear here once it is sent to this address."
        illustration={<EmptyStateIllustration kind="empty-hoop" />}
        action={
          <Button
            variant="primary"
            size="touch"
            pending={AsyncResult.isWaiting(creating())}
            onClick={() => void make()}
          >
            make a workspace
          </Button>
        }
        detail={
          <Show when={AsyncResult.isFailure(creating()) ? creating() : undefined}>
            {(failed) => explain((failed() as AsyncResult.Failure<unknown, unknown>).cause)}
          </Show>
        }
      />
    </Entry>
  );
}
