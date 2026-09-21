import { DocumentTitle } from "./document-title.tsx";
import { EmptyState, EmptyStateIllustration, PageHeader, Shell } from "@amends/ui/components";
import type { ComponentProps } from "solid-js";
export function DomainPlaceholder(props: {
  title: string;
  illustration: ComponentProps<typeof EmptyStateIllustration>["kind"];
}) {
  return (
    <>
      <DocumentTitle title={props.title} />
      <Shell.Header>
        <PageHeader title={props.title} navigation={<Shell.NavigationToggle />} />
      </Shell.Header>
      <Shell.Main>
        <EmptyState
          title="Nothing here yet"
          description={props.title + " will appear here once that part of the workspace exists."}
          illustration={<EmptyStateIllustration kind={props.illustration} />}
        />
      </Shell.Main>
    </>
  );
}
