import { DocumentTitle } from "../components/document-title.tsx";
import { EmptyState, EmptyStateIllustration, PageHeader, Shell } from "@amends/ui/components";
export function NotFound() {
  return (
    <>
      <DocumentTitle title="Page not found" />
      <Shell.Header>
        <PageHeader title="Page not found" navigation={<Shell.NavigationToggle />} />
      </Shell.Header>
      <Shell.Main>
        <EmptyState
          title="Nothing lives at this address"
          description="Use the navigation to find what you were looking for."
          illustration={<EmptyStateIllustration kind="no-results" />}
        />
      </Shell.Main>
    </>
  );
}

export function NotFoundPage() {
  return (
    <Shell.Root>
      <Shell.Body>
        <NotFound />
      </Shell.Body>
    </Shell.Root>
  );
}
