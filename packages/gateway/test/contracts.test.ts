import { expect, it } from "@effect/vitest";
import { Identity } from "@amends-dev/core/identity";
import { Schema } from "effect";
import { WorkspaceDirectory } from "../src/directory.ts";
import { SignIn } from "../src/sign-in.ts";

it("saved sessions round-trip their token and account through JSON", () => {
  const stored = { token: "session-token", account: { id: "human-one", email: "jo@mercier.co" } };
  const json = Schema.fromJsonString(SignIn.Session);
  const session = Schema.decodeSync(json)(JSON.stringify(stored));

  expect(session).toEqual({
    token: "session-token",
    account: { id: Identity.HumanId.make("human-one"), email: "jo@mercier.co" },
  });
  expect(JSON.parse(Schema.encodeSync(json)(session))).toEqual(stored);
  expect(() => Schema.decodeSync(SignIn.Session)({ ...stored, token: "" })).toThrow();
});

it.each([0, 2])("directory JSON retains people for an active member count of %i", (count) => {
  const wire = {
    memberships: [
      {
        workspace: {
          id: "workspace",
          createdBy: "human",
          name: "Test workspace",
          ownerMemberId: "owner",
        },
        member: {
          id: "agent-member",
          workspaceId: "workspace",
          identity: { _tag: "Agent", id: "agent" },
          name: "agent",
          status: "active",
        },
        people: count,
      },
    ],
    invitations: [],
  } satisfies typeof WorkspaceDirectory.Listing.Encoded;
  const listing = Schema.decodeSync(WorkspaceDirectory.Listing)(wire);
  expect(listing.memberships[0]?.activeMemberCount).toBe(count);
  expect(Schema.encodeSync(WorkspaceDirectory.Listing)(listing)).toEqual(wire);

  for (const invalid of [-1, 0.5]) {
    expect(() =>
      Schema.decodeSync(WorkspaceDirectory.Listing)({
        ...wire,
        memberships: wire.memberships.map((membership) => ({ ...membership, people: invalid })),
      }),
    ).toThrow();
    expect(() =>
      Schema.encodeSync(WorkspaceDirectory.Listing)({
        ...listing,
        memberships: listing.memberships.map((membership) => ({
          ...membership,
          activeMemberCount: invalid,
        })),
      }),
    ).toThrow();
  }
});
