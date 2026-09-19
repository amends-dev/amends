import { DocumentTitle } from "../../components/document-title.tsx";
import { ContentColumn, PageHeading, Shell } from "@amends/ui/components";
import { useAtom } from "@effect/atom-solid";
import { Navigate, useNavigate, useSearchParams } from "@solidjs/router";
import { createMemo, Show } from "solid-js";
import { Me } from "../../api/me.ts";
import { useQuery } from "../../api/hooks.ts";
import { valueOf } from "../../api/errors.ts";
import { BrandLink } from "../../components/brand-link.tsx";
import { PolicyLinks } from "../../components/policy-links.tsx";
import { AccountMenu } from "../../features/session/account-menu.tsx";
import { SessionStatus } from "../../features/session/session-status.tsx";
import { WorkspacePicker } from "../../features/workspaces/workspace-picker.tsx";
import { lastWorkspaceAtom } from "../../session/session.ts";
import { useSession } from "../../session/boundary.tsx";
import { href } from "../../routes.tsx";
export function PickerPage() {
  const session = useSession();
  return (
    <Show when={session.session} fallback={<Navigate href={href.signIn()} />}>
      <Picker />
    </Show>
  );
}
function Picker() {
  const [search] = useSearchParams<{ choose?: string }>();
  const [last, setLast] = useAtom(() => lastWorkspaceAtom);
  const navigate = useNavigate();
  const query = useQuery(Me.workspaces);
  const remembered = createMemo(
    () =>
      search.choose === undefined &&
      valueOf(query.result())?.memberships.find(
        (membership) => membership.workspace.id === last() && membership.member.status === "active",
      ),
  );
  return (
    <Show when={!remembered()} fallback={<Navigate href={href.home(last() ?? "")} />}>
      <Shell.Root>
        <DocumentTitle title="Choose a workspace" />
        <Shell.Body>
          <Shell.Header>
            <BrandLink />
            <AccountMenu />
          </Shell.Header>
          <Shell.Main>
            <ContentColumn width="wide">
              <PageHeading title="Where are you working?" />
              <WorkspacePicker
                onSelect={(id) => {
                  setLast(id);
                  navigate(href.home(id));
                }}
              />
            </ContentColumn>
          </Shell.Main>
          <Shell.Footer>
            <SessionStatus />
            <PolicyLinks />
          </Shell.Footer>
        </Shell.Body>
      </Shell.Root>
    </Show>
  );
}
