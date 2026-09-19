import { DescriptionList, FormColumns, Section, Text } from "@amends/ui/components";
import { useWorkspace } from "../../workspace/context.tsx";
export function WorkspaceDetails() {
  const opened = useWorkspace();
  return (
    <FormColumns>
      <Section title="Workspace">
        <DescriptionList
          items={[
            { label: "id", value: opened().workspace.id },
            { label: "owner", value: opened().workspace.ownerMemberId },
            { label: "created by", value: opened().workspace.createdBy },
            { label: "people", value: String(opened().activeMemberCount) },
          ]}
        />
        <Text variant="caption">
          Workspaces have no name yet, so the ID stands in everywhere. Creation attribution is
          recorded once; ownership transfer is a separate workflow.
        </Text>
      </Section>
    </FormColumns>
  );
}
