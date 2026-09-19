import { DescriptionList, FormColumns, Section, Text } from "@amends/ui/components";
import { useWorkspace } from "../../workspace/context.tsx";
import { TransferOwnership } from "./transfer-ownership.tsx";
export function WorkspaceDetails() {
  const opened = useWorkspace();
  return (
    <FormColumns>
      <Section title="Workspace">
        <DescriptionList
          items={[
            { label: "name", value: opened().workspace.name },
            { label: "id", value: opened().workspace.id },
            { label: "owner", value: opened().workspace.ownerMemberId },
            { label: "created by", value: opened().workspace.createdBy },
            { label: "people", value: String(opened().activeMemberCount) },
          ]}
        />
        <Text variant="caption">
          Creation attribution is recorded once and stays unchanged when ownership transfers.
        </Text>
      </Section>
      <TransferOwnership />
    </FormColumns>
  );
}
