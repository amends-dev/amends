import { InvitationPermissions, MemberPermissions } from "@amends/core/workspace";
import { AssignmentPermissions, type Permission } from "@amends/core/authorization";
import { DescriptionList, Section, Text } from "@amends/ui/components";
export const permissions: ReadonlyArray<{
  definition: Permission.Definition;
  description: string;
}> = [
  { definition: MemberPermissions.Read, description: "Read memberships in the workspace." },
  {
    definition: MemberPermissions.Remove,
    description: "Remove members within your delegation authority, or leave.",
  },
  {
    definition: InvitationPermissions.Manage,
    description: "Issue and revoke invitations within your delegation authority.",
  },
  { definition: AssignmentPermissions.Read, description: "Read a member's access assignments." },
  {
    definition: AssignmentPermissions.Manage,
    description: "Assign, revoke, or change roles within your delegation authority.",
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
        Operations check permissions on their targets. The creator receives the Owner role;
        invitations assign a role when accepted. Delegation rules protect owners and administrators.
      </Text>
    </Section>
  );
}
