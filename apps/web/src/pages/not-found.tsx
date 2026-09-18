import { EmptyState, EmptyStateIllustration } from "@amends/ui/components";
import { usePageHeader } from "../shell/page-header.tsx";

export function NotFound() {
  usePageHeader(() => ({ title: "Page not found" }));
  return (
    <EmptyState
      title="Nothing lives at this address"
      description="Use the navigation to find what you were looking for."
      illustration={<EmptyStateIllustration kind="no-results" />}
    />
  );
}
