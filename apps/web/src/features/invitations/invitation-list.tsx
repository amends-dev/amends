import { Key } from "@solid-primitives/keyed";
import type { Invitation } from "@amends/core/workspace";
import {
  EmptyState,
  Section,
  SectionStack,
  StatusBadge,
  Text,
  WorkItemList,
  WorkItemRow,
} from "@amends/ui/components";
import { DateTime } from "effect";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Invitations } from "../../api/invitations.ts";
import { useQuery } from "../../api/hooks.ts";
import { QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { RevokeInvitationButton } from "./revoke-invitation-button.tsx";
const day = DateTime.formatIsoDate;
const stateOf = (invitation: Invitation.Record, now: DateTime.Utc) =>
  invitation.state._tag === "Accepted"
    ? "accepted"
    : invitation.state._tag === "Revoked"
      ? "revoked"
      : DateTime.isGreaterThan(invitation.details.expiresAt, now)
        ? "pending"
        : "expired";
const describe = (invitation: Invitation.Record) =>
  invitation.state._tag === "Accepted"
    ? `accepted ${day(invitation.state.acceptedAt)} · member ${invitation.state.memberId}`
    : invitation.state._tag === "Revoked"
      ? `revoked ${day(invitation.state.revokedAt)}`
      : `issued ${day(invitation.details.issuedAt)} · expires ${day(invitation.details.expiresAt)}`;
export function InvitationList() {
  const membership = useWorkspace();
  const query = useQuery(() => Invitations.list(membership().workspace.id));
  const [now, setNow] = createSignal(DateTime.nowUnsafe());
  onMount(() => {
    const timer = setInterval(() => setNow(DateTime.nowUnsafe()), 30_000);
    onCleanup(() => clearInterval(timer));
  });
  return (
    <QueryView result={query.result()} retry={query.refresh} loading="Loading invitations…">
      {(invitations) => (
        <SectionStack>
          <Section title="Invitations" count={invitations().length} note="single use">
            <Show
              when={invitations().length > 0}
              fallback={
                <EmptyState
                  title="No invitations yet"
                  description="Invite someone by the address they sign in with."
                />
              }
            >
              <WorkItemList label="Invitations">
                <Key each={[...invitations()].reverse()} by={(item) => item.details.id}>
                  {(invitation) => (
                    <WorkItemRow
                      title={invitation().details.recipientId}
                      identityKind="user"
                      titleAccessory={
                        <StatusBadge
                          tone={
                            stateOf(invitation(), now()) === "accepted"
                              ? "success"
                              : stateOf(invitation(), now()) === "pending"
                                ? "pending"
                                : "neutral"
                          }
                          label={stateOf(invitation(), now())}
                        />
                      }
                      supportingText={describe(invitation())}
                      metadata={
                        invitation().details.grants.length === 0
                          ? "no permissions"
                          : `grants ${invitation()
                              .details.grants.map((grant) => grant.permission)
                              .join(", ")}`
                      }
                      actions={
                        <Show when={stateOf(invitation(), now()) === "pending"}>
                          <RevokeInvitationButton invitationId={invitation().details.id} />
                        </Show>
                      }
                    />
                  )}
                </Key>
              </WorkItemList>
            </Show>
          </Section>
          <Text variant="caption">
            An invitation names the address it is for. It appears in that person's workspace picker
            until it expires, is revoked, or is accepted.
          </Text>
        </SectionStack>
      )}
    </QueryView>
  );
}
