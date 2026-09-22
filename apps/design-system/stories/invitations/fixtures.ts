import type {
  InvitationDraft,
  InvitationRoles,
  IssueInvitationResult,
} from "../../src/invitations/index.ts";

/** Presentation fixtures share the production component's contract; no host or session is needed. */
export const roles = {
  _tag: "Ready",
  choices: [
    { id: "viewer", label: "Viewer", assignable: true },
    { id: "administrator", label: "Administrator", assignable: true },
  ],
} satisfies InvitationRoles;
export const draft: InvitationDraft = {
  recipientId: "avery@example.com",
  roleId: "viewer",
  expiresInDays: 7,
};
export const issued = async (input: InvitationDraft): Promise<IssueInvitationResult> => ({
  _tag: "Issued",
  recipientId: input.recipientId,
  expiresOn: "2026-09-28",
});
