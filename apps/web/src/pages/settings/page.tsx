import {
  Invitation,
  InvitationPermissions,
  Member,
  MemberPermissions,
} from "@amends/core/workspace";
import { Permission } from "@amends/core/authorization";
import { Identity } from "@amends/core/identity";
import {
  ActionGroup,
  Breadcrumbs,
  Button,
  Checkbox,
  CollectionView,
  DescriptionList,
  EmptyState,
  Field,
  FormActions,
  FormColumns,
  FormLayout,
  MasterDetail,
  Notice,
  RadioCardGroup,
  Section,
  SectionStack,
  StatusBadge,
  Tabs,
  Tag,
  Text,
  TextField,
  WorkItemList,
  WorkItemRow,
} from "@amends/ui/components";
import { useAtom, useAtomValue } from "@effect/atom-solid";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { DateTime, Exit, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, createSignal, For, Show } from "solid-js";
import { ApiClient } from "../../api/client.ts";
import { href } from "../../routes.tsx";
import { usePageHeader } from "../../shell/page-header.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { explain } from "../../workspace/explain.ts";

type Panel = "people" | "invites" | "workspace";
const panelOf = (value: string | undefined): Panel =>
  value === "invites" || value === "workspace" ? value : "people";
const day = (value: DateTime.Utc) => DateTime.formatIsoDate(value);
const identityKind = (member: Member.Record) =>
  member.identity._tag === "Human" ? ("user" as const) : ("agent" as const);
const failureOf = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  AsyncResult.isFailure(result) ? result : undefined;

/** Members and invitations of the opened workspace, read through the same authorized operations the CLI uses. */
export function SettingsPage() {
  const opened = useWorkspace();
  const [query, setQuery] = useSearchParams<{ tab?: string; person?: string }>();
  const panel = () => panelOf(query.tab);
  const members = useAtomValue(() =>
    ApiClient.query("members", "list", {
      params: { workspaceId: opened().id },
      reactivityKeys: ["members"],
    }),
  );
  const people = createMemo(() =>
    Option.getOrElse(AsyncResult.value(members()), (): ReadonlyArray<Member.Record> => []),
  );
  const active = () => people().filter((member) => member.status === "active");
  const selected = () => people().find((member) => member.id === query.person);
  usePageHeader(() => ({
    title: panel() === "workspace" ? "Workspace" : panel() === "invites" ? "Invitations" : "People",
    breadcrumbs: <Breadcrumbs items={[{ label: "Configure" }, { label: "Settings" }]} />,
    summary:
      panel() === "people"
        ? `${active().length} active · ${people().length - active().length} removed`
        : panel() === "invites"
          ? "single use, one address each"
          : `owned by ${opened().owner ? "you" : opened().record.ownerMemberId}`,
  }));
  return (
    <CollectionView label="Settings">
      <Tabs
        label="Settings sections"
        value={panel()}
        onChange={(tab) => setQuery({ tab, person: undefined })}
        items={[
          {
            value: "people",
            label: "people",
            content: (
              <MasterDetail
                selected={!!selected()}
                backLabel="people"
                onBack={() => setQuery({ person: undefined })}
                detail={
                  <Show when={selected()} fallback={<PermissionGuide />}>
                    {(member) => <Person member={member()} />}
                  </Show>
                }
              >
                <People
                  result={members()}
                  people={people()}
                  selectedId={selected()?.id}
                  onSelect={(person) => setQuery({ person })}
                />
              </MasterDetail>
            ),
          },
          { value: "invites", label: "invites", content: <Invites /> },
          { value: "workspace", label: "workspace", content: <WorkspaceSettings /> },
        ]}
      />
    </CollectionView>
  );
}

function People(props: {
  result: AsyncResult.AsyncResult<ReadonlyArray<Member.Record>, unknown>;
  people: ReadonlyArray<Member.Record>;
  selectedId: Member.Id | undefined;
  onSelect: (id: Member.Id) => void;
}) {
  const opened = useWorkspace();
  const groups = () =>
    props.people.some((member) => member.status === "removed")
      ? (["active", "removed"] as const)
      : (["active"] as const);
  return (
    <SectionStack>
      <Show when={failureOf(props.result)}>
        {(failed) => (
          <Notice tone="danger" live="polite">
            {explain(failed().cause)}
          </Notice>
        )}
      </Show>
      <For each={groups()}>
        {(status) => (
          <Section
            title={status === "removed" ? "Removed" : "People"}
            count={props.people.filter((member) => member.status === status).length}
            note={status === "active" ? "one owner" : undefined}
          >
            <WorkItemList label={status === "removed" ? "Removed people" : "People"}>
              <For each={props.people.filter((member) => member.status === status)}>
                {(member) => (
                  <WorkItemRow
                    identityKind={identityKind(member)}
                    title={member.identity.id}
                    titleAccessory={member.id === opened().me.id ? <Tag>YOU</Tag> : undefined}
                    supportingText={member.id}
                    metadata={
                      <>
                        {member.identity._tag === "Human" ? "human" : "agent"} ·{" "}
                        {member.id === opened().record.ownerMemberId ? "owner" : "member"}
                        {status === "removed" ? " · removed" : ""}
                      </>
                    }
                    active={props.selectedId === member.id}
                    onOpen={() => props.onSelect(member.id)}
                  />
                )}
              </For>
            </WorkItemList>
          </Section>
        )}
      </For>
      <Text variant="caption">
        Only memberships you may read are listed. Removed people keep their history; rejoining needs
        a fresh invitation and a new membership.
      </Text>
    </SectionStack>
  );
}

const permissions: ReadonlyArray<{ definition: Permission.Definition; description: string }> = [
  { definition: MemberPermissions.Read, description: "Read memberships in the workspace." },
  { definition: MemberPermissions.Remove, description: "Remove members other than the owner." },
  {
    definition: InvitationPermissions.Manage,
    description: "Issue and revoke invitations, as the owner.",
  },
];

function PermissionGuide() {
  return (
    <Section title="Permissions">
      <DescriptionList
        items={permissions.map((permission) => ({
          label: permission.definition.name,
          value: permission.description,
        }))}
      />
      <Text variant="caption">
        Every operation names the permission it needs and the member it targets. The owner receives
        these three at creation; invitations grant them explicitly.
      </Text>
    </Section>
  );
}

function Person(props: { member: Member.Record }) {
  const opened = useWorkspace();
  const navigate = useNavigate();
  const [removal, remove] = useAtom(() => ApiClient.mutation("members", "remove"), {
    mode: "promiseExit",
  });
  const isOwner = () => props.member.id === opened().record.ownerMemberId;
  const isMe = () => props.member.id === opened().me.id;
  const removeMember = async () => {
    const exit = await remove({
      params: { workspaceId: opened().id, memberId: props.member.id },
      reactivityKeys: ["members", "me"],
    });
    if (Exit.isSuccess(exit) && isMe()) navigate(href.picker({ choose: true }));
  };
  return (
    <SectionStack>
      <Section title={props.member.status === "removed" ? "Removed person" : "Person"}>
        <WorkItemRow
          title={props.member.identity.id}
          supportingText={props.member.id}
          identityKind={identityKind(props.member)}
        />
        <DescriptionList
          items={[
            { label: "membership", value: props.member.id },
            {
              label: "identity",
              value: `${props.member.identity._tag} ${props.member.identity.id}`,
            },
            { label: "status", value: props.member.status },
            { label: "role", value: isOwner() ? "owner" : "member" },
          ]}
        />
      </Section>
      <Show when={props.member.status === "active"}>
        <ActionGroup
          description={
            isOwner()
              ? "The current owner cannot be removed. Ownership transfer is a separate workflow."
              : isMe()
                ? "You lose access immediately. Your history stays on the workspace's record."
                : "They lose access immediately, and their pending invitations are revoked. Their history stays readable."
          }
        >
          <Button
            variant="secondary"
            tone="danger"
            disabled={isOwner()}
            pending={AsyncResult.isWaiting(removal())}
            onClick={() => void removeMember()}
          >
            {isMe() ? "leave the workspace" : "remove from the workspace"}
          </Button>
        </ActionGroup>
      </Show>
      <Show when={failureOf(removal())}>
        {(failed) => (
          <Notice tone="danger" live="polite">
            {explain(failed().cause)}
          </Notice>
        )}
      </Show>
    </SectionStack>
  );
}

const stateOf = (invitation: Invitation.Record, now: DateTime.Utc) =>
  invitation.state._tag === "Accepted"
    ? ("accepted" as const)
    : invitation.state._tag === "Revoked"
      ? ("revoked" as const)
      : DateTime.isGreaterThan(invitation.details.expiresAt, now)
        ? ("pending" as const)
        : ("expired" as const);

function Invites() {
  const opened = useWorkspace();
  const invitations = useAtomValue(() =>
    ApiClient.query("invitations", "list", {
      params: { workspaceId: opened().id },
      reactivityKeys: ["invitations"],
    }),
  );
  const [revocation, revoke] = useAtom(() => ApiClient.mutation("invitations", "revoke"), {
    mode: "promiseExit",
  });
  const now = DateTime.nowUnsafe();
  return (
    <>
      {AsyncResult.matchWithError(invitations(), {
        onInitial: () => (
          <Text as="span" variant="inherit" role="status">
            Loading invitations…
          </Text>
        ),
        onError: (_, failure) => (
          <EmptyState
            title="Invitations need invitation.manage"
            description={explain(failure.cause)}
          />
        ),
        onDefect: (defect) => (
          <Notice tone="danger" live="assertive">
            Invitations could not be loaded. {String(defect)}
          </Notice>
        ),
        onSuccess: ({ value }) => (
          <FormColumns>
            <SectionStack>
              <Section title="Invitations" count={value.length} note="single use">
                <Show
                  when={value.length}
                  fallback={
                    <EmptyState
                      title="No invitations yet"
                      description="Invite someone by the address they sign in with."
                    />
                  }
                >
                  <WorkItemList label="Invitations">
                    <For each={[...value].reverse()}>
                      {(invitation) => (
                        <WorkItemRow
                          title={invitation.details.recipientId}
                          identityKind="user"
                          titleAccessory={
                            <StatusBadge
                              tone={
                                stateOf(invitation, now) === "accepted"
                                  ? "success"
                                  : stateOf(invitation, now) === "pending"
                                    ? "pending"
                                    : "neutral"
                              }
                              label={stateOf(invitation, now)}
                            />
                          }
                          supportingText={
                            invitation.state._tag === "Accepted"
                              ? `accepted ${day(invitation.state.acceptedAt)} · member ${invitation.state.memberId}`
                              : invitation.state._tag === "Revoked"
                                ? `revoked ${day(invitation.state.revokedAt)}`
                                : `issued ${day(invitation.details.issuedAt)} · expires ${day(invitation.details.expiresAt)}`
                          }
                          metadata={
                            <>
                              {invitation.details.grants.length === 0
                                ? "no permissions"
                                : `grants ${invitation.details.grants.map((grant) => grant.permission).join(", ")}`}
                            </>
                          }
                          actions={
                            stateOf(invitation, now) === "pending" ? (
                              <Button
                                variant="secondary"
                                pending={AsyncResult.isWaiting(revocation())}
                                onClick={() =>
                                  void revoke({
                                    params: {
                                      workspaceId: opened().id,
                                      invitationId: invitation.details.id,
                                    },
                                    reactivityKeys: ["invitations"],
                                  })
                                }
                              >
                                revoke
                              </Button>
                            ) : undefined
                          }
                        />
                      )}
                    </For>
                  </WorkItemList>
                </Show>
              </Section>
              <Show when={failureOf(revocation())}>
                {(failed) => (
                  <Notice tone="danger" live="polite">
                    {explain(failed().cause)}
                  </Notice>
                )}
              </Show>
              <Text variant="caption">
                An invitation names the address it is for. It appears in that person's workspace
                picker until it expires, is revoked, or is accepted.
              </Text>
            </SectionStack>
            <SectionStack>
              <NewInvite />
              <PermissionGuide />
            </SectionStack>
          </FormColumns>
        ),
      })}
    </>
  );
}

function NewInvite() {
  const opened = useWorkspace();
  const [recipient, setRecipient] = createSignal("");
  const [days, setDays] = createSignal("7");
  const [granted, setGranted] = createSignal<ReadonlyArray<Permission.Name>>([
    MemberPermissions.Read.name,
  ]);
  const [issuance, issue] = useAtom(() => ApiClient.mutation("invitations", "issue"), {
    mode: "promiseExit",
  });
  const [issued, setIssued] = createSignal<Invitation.Record>();
  const toggle = (name: Permission.Name, on: boolean) =>
    setGranted((current) =>
      on ? [...current.filter((n) => n !== name), name] : current.filter((n) => n !== name),
    );
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    setIssued(undefined);
    const address = recipient().trim();
    if (!Schema.is(Identity.HumanId)(address)) return;
    const exit = await issue({
      params: { workspaceId: opened().id },
      payload: {
        recipientId: address,
        expiresAt: DateTime.add(DateTime.nowUnsafe(), { days: Number(days()) }),
        grants: granted().map((permission) => ({
          permission,
          scope: { _tag: "Workspace" as const, workspaceId: opened().id },
        })),
      },
      reactivityKeys: ["invitations"],
    });
    if (Exit.isSuccess(exit)) {
      setIssued(exit.value);
      setRecipient("");
    }
  };
  return (
    <Section title="New invitation">
      <FormLayout onSubmit={(event) => void submit(event)}>
        <Field
          label="Address"
          description="The email they sign in with. One address is one identity."
          required
        >
          <TextField
            type="email"
            autocomplete="off"
            value={recipient()}
            onInput={(event) => setRecipient(event.currentTarget.value)}
          />
        </Field>
        <RadioCardGroup
          label="Expires"
          value={days()}
          onChange={setDays}
          options={[
            { value: "7", label: "7 days" },
            { value: "30", label: "30 days" },
          ]}
        />
        <Field label="Permissions" description="Granted with workspace scope when they accept.">
          <div>
            <For each={permissions}>
              {(permission) => (
                <Checkbox
                  label={permission.definition.name}
                  description={permission.description}
                  checked={granted().includes(permission.definition.name)}
                  onChange={(event) =>
                    toggle(permission.definition.name, event.currentTarget.checked)
                  }
                />
              )}
            </For>
          </div>
        </Field>
        <FormActions
          primary={
            <Button
              type="submit"
              pending={AsyncResult.isWaiting(issuance())}
              disabled={!recipient().trim()}
            >
              issue the invitation
            </Button>
          }
        />
      </FormLayout>
      <Show when={issued()}>
        {(invitation) => (
          <Notice live="polite">
            Invited {invitation().details.recipientId}. It appears in their picker until{" "}
            {day(invitation().details.expiresAt)}.
          </Notice>
        )}
      </Show>
      <Show when={failureOf(issuance())}>
        {(failed) => (
          <Notice tone="danger" live="polite">
            {explain(failed().cause)}
          </Notice>
        )}
      </Show>
    </Section>
  );
}

function WorkspaceSettings() {
  const opened = useWorkspace();
  return (
    <FormColumns>
      <Section title="Workspace">
        <DescriptionList
          items={[
            { label: "id", value: opened().id },
            { label: "owner", value: opened().record.ownerMemberId },
            { label: "created by", value: opened().record.createdBy },
            { label: "people", value: String(opened().activeMemberCount) },
          ]}
        />
        <Text variant="caption">
          Workspaces have no name yet, so the ID stands in everywhere. Creation attribution is
          recorded once; ownership transfer is a separate workflow.
        </Text>
      </Section>
    </FormColumns>
  );
}
