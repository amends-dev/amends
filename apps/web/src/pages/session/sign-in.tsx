import { DocumentTitle } from "../../components/document-title.tsx";
import { ContentColumn, Shell } from "@amends/ui/components";
import { Navigate, useNavigate } from "@solidjs/router";
import { batch, Show } from "solid-js";
import { BrandLink } from "../../components/brand-link.tsx";
import { PolicyLinks } from "../../components/policy-links.tsx";
import { SignInForm } from "../../features/session/sign-in-form.tsx";
import { SessionStatus } from "../../features/session/session-status.tsx";
import { useSession } from "../../session/boundary.tsx";
import { href } from "../../routes.tsx";
export function SignInPage() {
  const session = useSession();
  const navigate = useNavigate();
  return (
    <Show when={!session.session} fallback={<Navigate href={href.picker()} />}>
      <Shell.Root>
        <DocumentTitle title="Sign in" />
        <Shell.Body>
          <Shell.Header>
            <BrandLink />
          </Shell.Header>
          <Shell.Main>
            <ContentColumn align="center">
              <SignInForm
                onSignedIn={(value) =>
                  batch(() => {
                    navigate(href.picker(), { replace: true });
                    session.replace(value);
                  })
                }
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
