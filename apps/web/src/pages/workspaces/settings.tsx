import { DocumentTitle } from "../../components/document-title.tsx";
import { Member } from "@amends/core/workspace";
import {
  Breadcrumbs,
  CollectionView,
  FormColumns,
  MasterDetail,
  PageHeader,
  SectionStack,
  Shell,
  Tabs,
} from "@amends/ui/components";
import { useNavigate, useSearchParams } from "@solidjs/router";
import { Schema } from "effect";
import { createMemo, Show } from "solid-js";
import { Members } from "../../api/members.ts";
import { useQuery } from "../../api/hooks.ts";
import { valueOf } from "../../api/errors.ts";
import { MemberList } from "../../features/members/member-list.tsx";
import { MemberDetails } from "../../features/members/member-details.tsx";
import { PermissionGuide } from "../../features/members/permission-guide.tsx";
import { InvitationList } from "../../features/invitations/invitation-list.tsx";
import { IssueInvitationForm } from "../../features/invitations/issue-invitation-form.tsx";
import { WorkspaceDetails } from "../../features/workspaces/workspace-details.tsx";
import { useWorkspace } from "../../workspace/context.tsx";
import { href } from "../../routes.tsx";
const isMemberId = Schema.is(Member.Id);
export function SettingsPage() {
  const membership = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams<{ tab?: string; member?: string; person?: string }>();
  const panel = () =>
    search.tab === "workspace"
      ? "workspace"
      : search.tab === "invitations" || search.tab === "invites"
        ? "invitations"
        : "members";
  const selectedId = () => {
    const value = search.member ?? search.person;
    return isMemberId(value) ? value : undefined;
  };
  const members = useQuery(() => Members.list(membership().workspace.id));
  const summary = createMemo(() => {
    if (panel() === "invitations") return "single use, one address each";
    if (panel() === "workspace")
      return `owned by ${membership().workspace.ownerMemberId === membership().member.id ? "you" : membership().workspace.ownerMemberId}`;
    const value = valueOf(members.result());
    if (!value) return "Memberships you may read";
    const active = value.filter((member) => member.status === "active").length;
    return `${active} active · ${value.length - active} removed`;
  });
  return (
    <>
      <DocumentTitle title="Workspace settings" />
      <Shell.Header>
        <PageHeader
          title={
            panel() === "members"
              ? "People"
              : panel() === "invitations"
                ? "Invitations"
                : "Workspace"
          }
          navigation={<Shell.NavigationToggle />}
          breadcrumbs={<Breadcrumbs items={[{ label: "Configure" }, { label: "Settings" }]} />}
          summary={summary()}
        />
      </Shell.Header>
      <Shell.Main scroll="panels">
        <CollectionView label="Settings">
          <Tabs
            label="Settings sections"
            value={panel()}
            onChange={(tab) => setSearch({ tab, member: undefined, person: undefined })}
            items={[
              {
                value: "members",
                label: "people",
                content: (
                  <MasterDetail
                    selected={!!selectedId()}
                    backLabel="people"
                    onBack={() => setSearch({ member: undefined, person: undefined })}
                    detail={
                      <Show when={selectedId()} fallback={<PermissionGuide />}>
                        {(id) => (
                          <MemberDetails
                            memberId={id()}
                            onRemoved={(memberId) => {
                              if (memberId === membership().member.id)
                                navigate(href.picker({ choose: true }));
                            }}
                          />
                        )}
                      </Show>
                    }
                  >
                    <MemberList
                      selectedId={selectedId()}
                      onSelect={(member) => setSearch({ member, person: undefined })}
                    />
                  </MasterDetail>
                ),
              },
              {
                value: "invitations",
                label: "invitations",
                content: (
                  <FormColumns>
                    <InvitationList />
                    <SectionStack>
                      <IssueInvitationForm />
                      <PermissionGuide />
                    </SectionStack>
                  </FormColumns>
                ),
              },
              { value: "workspace", label: "workspace", content: <WorkspaceDetails /> },
            ]}
          />
        </CollectionView>
      </Shell.Main>
    </>
  );
}
