import { Key } from "@solid-primitives/keyed";
import type { Member } from "@amends/core/workspace";
import {
  EmptyState,
  Section,
  SectionStack,
  Tag,
  Text,
  WorkItemList,
  WorkItemRow,
} from "@amends/ui/components";
import { For, Show } from "solid-js";
import { Members } from "../../api/members.ts";
import { useQuery } from "../../api/hooks.ts";
import { QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
export function MemberList(props: {
  selectedId?: Member.Id | undefined;
  onSelect: (id: Member.Id) => void;
}) {
  const membership = useWorkspace();
  const query = useQuery(() => Members.list(membership().workspace.id));
  return (
    <QueryView result={query.result()} retry={query.refresh} loading="Loading members…">
      {(members) => (
        <SectionStack>
          <Show
            when={members().length > 0}
            fallback={
              <EmptyState
                title="No readable members"
                description="Only memberships you have permission to read appear here."
              />
            }
          >
            <For each={["active", "removed"] as const}>
              {(status) => (
                <Show
                  when={status === "active" || members().some((member) => member.status === status)}
                >
                  <Section
                    title={status === "active" ? "People" : "Removed"}
                    count={members().filter((member) => member.status === status).length}
                  >
                    <WorkItemList label={status === "active" ? "People" : "Removed people"}>
                      <Key by="id" each={members().filter((member) => member.status === status)}>
                        {(member) => (
                          <WorkItemRow
                            title={member().identity.id}
                            supportingText={member().id}
                            identityKind={member().identity._tag === "Human" ? "user" : "agent"}
                            titleAccessory={
                              member().id === membership().member.id ? <Tag>YOU</Tag> : undefined
                            }
                            metadata={
                              <>
                                {member().identity._tag === "Human" ? "human" : "agent"} ·{" "}
                                {member().id === membership().workspace.ownerMemberId
                                  ? "owner"
                                  : "member"}
                                {status === "removed" ? " · removed" : ""}
                              </>
                            }
                            active={props.selectedId === member().id}
                            onOpen={() => props.onSelect(member().id)}
                          />
                        )}
                      </Key>
                    </WorkItemList>
                  </Section>
                </Show>
              )}
            </For>
          </Show>
          <Text variant="caption">
            Only memberships you may read are listed. Removed people keep their history; rejoining
            needs a fresh invitation and a new membership.
          </Text>
        </SectionStack>
      )}
    </QueryView>
  );
}
