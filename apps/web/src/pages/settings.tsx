import { paths, type SettingsSection } from "@amends/client";
import * as Settings from "@amends/features/settings";
import { SegmentedControl } from "@amends/ui/compositions/segmented-control";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { Column, Container } from "@amends/ui/primitives/layout";
import { useLocation, useNavigate, useParams, useSearchParams, Navigate } from "@solidjs/router";
import { Show, type ParentProps } from "solid-js";
const href = (path: string) => path;
export function SettingsLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation(),
    navigate = useNavigate();
  const section = () => {
    const segment = location.pathname.split("/").at(-1);
    return segment === "members" || segment === "invites" ? segment : "workspace";
  };
  return (
    <Column gap={4}>
      <SegmentedControl.Root
        aria-label="Settings sections"
        value={section()}
        onValueChange={(next) => {
          if (next === "workspace" || next === "members" || next === "invites")
            navigate(paths.settingsSection(params.workspaceId, next));
        }}
      >
        <SegmentedControl.Item value="members">People</SegmentedControl.Item>
        <SegmentedControl.Item value="invites">Invites</SegmentedControl.Item>
        <SegmentedControl.Item value="workspace">Workspace</SegmentedControl.Item>
      </SegmentedControl.Root>
      {props.children}
    </Column>
  );
}
export function SettingsIndex() {
  const params = useParams<{ workspaceId: string }>();
  return <Navigate href={paths.settingsSection(params.workspaceId, "workspace")} />;
}
function Scope(props: ParentProps<{ section: SettingsSection }>) {
  const params = useParams<{ workspaceId: string }>();
  return (
    <Settings.Root workspaceId={params.workspaceId} section={props.section}>
      <Column gap={6}>
        {props.children}
        <Settings.Feedback />
      </Column>
    </Settings.Root>
  );
}
export function WorkspaceSettingsPage() {
  return (
    <Scope section="workspace">
      <Container maxWidth="40rem" gutter={0} align="start">
        <Column gap={6}>
          <Settings.WorkspaceName />
          <Settings.WorkspaceDetails />
          <Settings.OwnershipTransfer />
        </Column>
      </Container>
    </Scope>
  );
}
export function MembersSettingsPage() {
  const params = useParams<{ workspaceId: string }>(),
    [search] = useSearchParams<{ member?: string }>();
  const base = () => paths.settingsSection(params.workspaceId, "members");
  return (
    <Scope section="members">
      <ListDetail.Root selected={!!search.member}>
        <ListDetail.List>
          <Settings.MemberList
            memberHref={(id) => href(`${base()}?member=${encodeURIComponent(id)}`)}
            selectedId={search.member}
          />
        </ListDetail.List>
        <Show when={search.member}>
          {(id) => (
            <ListDetail.Detail aria-label="Member details">
              <Settings.MemberDetail memberId={id()} backHref={href(base())} />
            </ListDetail.Detail>
          )}
        </Show>
      </ListDetail.Root>
    </Scope>
  );
}
export function InvitesSettingsPage() {
  return (
    <Scope section="invites">
      <Settings.InvitationHistory />
      <Container maxWidth="40rem" gutter={0} align="start">
        <Settings.InviteForm />
      </Container>
    </Scope>
  );
}
