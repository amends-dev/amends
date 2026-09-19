import { InvitationPermissions, MemberPermissions } from "@amends/core/workspace";
import type { Permission } from "@amends/core/authorization";
import { DescriptionList, Section, Text } from "@amends/ui/components";
export const permissions: ReadonlyArray<{
  definition: Permission.Definition;
  description: string;
}> = [
  { definition: MemberPermissions.Read, description: "Read memberships in the workspace." },
  { definition: MemberPermissions.Remove, description: "Remove members other than the owner." },
  {
    definition: InvitationPermissions.Manage,
    description: "Issue and revoke invitations, as the owner.",
  },
];

export function PermissionGuide() {
  return (
    <Section title="Permissions">
      <DescriptionList
        items={permissions.map((permission) => ({
          label: permission.definition.name,
          value: permission.description,
        }))}
      />
      <Text variant="caption">
        Every operation names the permission it needs and the member it targets. The owner receives
        these three at creation; invitations grant them explicitly.
      </Text>
    </Section>
  );
}
