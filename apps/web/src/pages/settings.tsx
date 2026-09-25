import { paths, type SettingsSection } from "@amends/client";
import * as Settings from "@amends/features/settings";
import { SectionNav } from "@amends/ui/compositions/section-nav";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { Column, Container } from "@amends/ui/primitives/layout";
import { useLocation, useParams, useSearchParams, Navigate } from "@solidjs/router";
import { For, Show, type ParentProps } from "solid-js";
const href = (path: string) => path;
export function SettingsLayout(props: ParentProps) {
  const params = useParams<{ workspaceId: string }>(),
    location = useLocation();
  return (
    <Column gap={6}>
      <SectionNav.Root aria-label="Settings sections">
        <For each={["workspace", "members", "invites"] as const}>
          {(section) => (
            <SectionNav.Link
              href={href(paths.settingsSection(params.workspaceId, section))}
              aria-current={
                location.pathname.replace(/\/$/, "") ===
                paths.settingsSection(params.workspaceId, section)
                  ? "page"
                  : undefined
              }
            >
              {section === "workspace"
                ? "Workspace"
                : section === "members"
                  ? "Members"
                  : "Invites"}
            </SectionNav.Link>
          )}
        </For>
      </SectionNav.Root>
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
      <Container maxWidth="40rem" gutter={0}>
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
      <Container maxWidth="40rem" gutter={0}>
        <Settings.InviteForm />
      </Container>
      <Settings.InvitationHistory />
    </Scope>
  );
}
