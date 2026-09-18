import { EmptyState, EmptyStateIllustration } from "@amends/ui/components";
import { usePageHeader } from "../shell/page-header.tsx";

/** A workspace page whose domain has not arrived yet: the shell and title are real, the content is not. */
export const placeholder = (title: string) => () => {
  usePageHeader(() => ({ title }));
  return (
    <EmptyState
      title="Nothing here yet"
      description={`${title} will appear here once that part of the workspace exists.`}
      illustration={<EmptyStateIllustration kind="unstitched-cloth" />}
    />
  );
};
