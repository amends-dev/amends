import { Key } from "@solid-primitives/keyed";
import type { Workspace } from "@amends/core/workspace";
import {
  EmptyState,
  Section,
  SectionStack,
  Text,
  WorkItemList,
  WorkItemRow,
  WorkspaceMark,
} from "@amends/ui/components";
import { For, Show } from "solid-js";
import { Me } from "../../api/me.ts";
import { useQuery } from "../../api/hooks.ts";
import { QueryView } from "../../components/query-view.tsx";
import { AcceptInvitationButton } from "../invitations/accept-invitation-button.tsx";
import { CreateWorkspaceButton } from "./create-workspace-button.tsx";
export function WorkspacePicker(props: { onSelect: (workspaceId: Workspace.Id) => void }) {
  const query = useQuery(Me.workspaces);
  return (
    <SectionStack>
      <QueryView result={query.result()} retry={query.refresh} loading="Loading workspaces…">
        {(listing) => (
          <SectionStack>
            <Show
              when={listing().memberships.some(
                (membership) => membership.member.status === "active",
              )}
              fallback={
                <EmptyState
                  title="No workspaces"
                  description="Make a workspace or accept an invitation below."
                />
              }
            >
              <Section title="Workspaces">
                <WorkItemList label="Your workspaces">
                  <For
                    each={listing().memberships.filter(
                      (membership) => membership.member.status === "active",
                    )}
                  >
                    {(membership) => (
                      <WorkItemRow
                        title={membership.workspace.id}
                        titleKind="code"
                        leadingIcon={<WorkspaceMark name={membership.workspace.id} />}
                        supportingText={`${membership.activeMemberCount === 1 ? "just you" : `${membership.activeMemberCount} people`} · ${membership.workspace.ownerMemberId === membership.member.id ? "owner" : "member"}`}
                        onOpen={() => props.onSelect(membership.workspace.id)}
                      />
                    )}
                  </For>
                </WorkItemList>
              </Section>
            </Show>
            <Show when={listing().invitations.length > 0}>
              <Section
                title="Invited"
                count={listing().invitations.length}
                note="accepting creates the membership"
              >
                <WorkItemList label="Invitations">
                  <Key each={listing().invitations} by={(item) => item.details.id}>
                    {(invitation) => (
                      <WorkItemRow
                        title={invitation().details.workspaceId}
                        titleKind="code"
                        leadingIcon={<WorkspaceMark name={invitation().details.workspaceId} />}
                        supportingText={
                          invitation().details.grants.length === 0
                            ? "no permissions yet"
                            : `grants ${invitation()
                                .details.grants.map((grant) => grant.permission)
                                .join(", ")}`
                        }
                        actions={
                          <AcceptInvitationButton
                            workspaceId={invitation().details.workspaceId}
                            invitationId={invitation().details.id}
                            onAccepted={props.onSelect}
                          />
                        }
                      />
                    )}
                  </Key>
                </WorkItemList>
              </Section>
            </Show>
          </SectionStack>
        )}
      </QueryView>
      <Section title="New workspace" note="you become its owner">
        <CreateWorkspaceButton onCreated={props.onSelect} />
      </Section>
      <Text variant="caption" tone="muted">
        last one opens by default next time
      </Text>
    </SectionStack>
  );
}
