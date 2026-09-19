import type { Member } from "@amends/core/workspace";
import { DescriptionList, Section, SectionStack, WorkItemRow } from "@amends/ui/components";
import { Show } from "solid-js";
import { Members } from "../../api/members.ts";
import { useQuery } from "../../api/hooks.ts";
import { QueryView } from "../../components/query-view.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { RemoveMemberButton } from "./remove-member-button.tsx";
import { MemberAccess } from "./member-access.tsx";
type Props = { memberId: Member.Id; onRemoved?: ((memberId: Member.Id) => void) | undefined };
export function MemberDetails(props: Props) {
  const membership = useWorkspace();
  return (
    <Show when={JSON.stringify([membership().workspace.id, props.memberId])} keyed>
      {(identity) => {
        void identity;
        return <Details {...props} />;
      }}
    </Show>
  );
}
function Details(props: Props) {
  const membership = useWorkspace();
  const query = useQuery(() => Members.get(membership().workspace.id, props.memberId));
  return (
    <QueryView result={query.result()} retry={query.refresh} loading="Loading member…">
      {(member) => (
        <SectionStack>
          <Section title={member().status === "removed" ? "Removed person" : "Person"}>
            <WorkItemRow
              title={member().identity.id}
              supportingText={member().id}
              identityKind={member().identity._tag === "Human" ? "user" : "agent"}
            />
            <DescriptionList
              items={[
                { label: "membership", value: member().id },
                { label: "identity", value: `${member().identity._tag} ${member().identity.id}` },
                { label: "status", value: member().status },
              ]}
            />
          </Section>
          <MemberAccess memberId={member().id} />
          <Show when={member().status === "active"}>
            <RemoveMemberButton memberId={member().id} onRemoved={props.onRemoved} />
          </Show>
        </SectionStack>
      )}
    </QueryView>
  );
}
