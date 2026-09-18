import { expect, test } from "bun:test";
import { Api, Authentication } from "@amends/api-http";
import { Identity } from "@amends/core/identity";
import { Member, MemberPermissions } from "@amends/core/workspace";
import { BunCrypto, BunHttpServer } from "@effect/platform-bun";
import { DateTime, Effect, Layer } from "effect";
import { HttpClientRequest, HttpRouter } from "effect/unstable/http";
import { HttpApiClient, HttpApiMiddleware } from "effect/unstable/httpapi";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost } from "../src/host.ts";
import { LocalServer } from "../src/serve.ts";
import { LocalSignIn } from "../src/sign-in.ts";

const alice = Identity.HumanId.make("alice");
const bob = Identity.HumanId.make("bob");
const asToken = (token: string) =>
  HttpApiMiddleware.layerClient(Authentication, ({ next, request }) =>
    next(HttpClientRequest.bearerToken(request, token)),
  );
/** The real routes, gateway, and SQLite storage behind a Bun test server; codes are captured. */
const delivered = new Map<string, string>();
const server = (filename: string) =>
  HttpRouter.serve(LocalServer.routes, { disableLogger: true, disableListenLog: true }).pipe(
    Layer.provide(
      Layer.mergeAll(
        LocalHost.layer(filename),
        LocalSignIn.layer((email, code) => Effect.sync(() => delivered.set(email, code))).pipe(
          Layer.provide(BunCrypto.layer),
        ),
      ),
    ),
    Layer.provideMerge(BunHttpServer.layerTest),
  );
const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-http-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("the HTTP server carries the membership workflow over SQLite with bearer identities", async () =>
  temporary(async (filename) => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const client = (token: string) =>
          HttpApiClient.make(Api).pipe(Effect.provide(asToken(token)));
        const asAlice = yield* client(alice);
        const asBob = yield* client(bob);
        const workspace = yield* asAlice.workspaces.create();
        const params = { workspaceId: workspace.id, memberId: workspace.ownerMemberId };
        const owner = yield* asAlice.members.get({ params });
        const outsider = yield* Effect.flip(asBob.members.get({ params }));
        const invitation = yield* asAlice.invitations.issue({
          params: { workspaceId: workspace.id },
          payload: {
            recipientId: bob,
            expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
            grants: [
              {
                permission: MemberPermissions.Read.name,
                scope: { _tag: "Workspace", workspaceId: workspace.id },
              },
            ],
          },
        });
        const invitationParams = {
          workspaceId: workspace.id,
          invitationId: invitation.details.id,
        };
        const wrongRecipient = yield* Effect.flip(
          asAlice.invitations.accept({ params: invitationParams }),
        );
        const joined = yield* asBob.invitations.accept({ params: invitationParams });
        const readByBob = yield* asBob.members.get({ params });
        const cannotInvite = yield* Effect.flip(
          asBob.invitations.issue({
            params: { workspaceId: workspace.id },
            payload: {
              recipientId: Identity.HumanId.make("charlie"),
              expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
              grants: [],
            },
          }),
        );
        const members = yield* asAlice.members.list({ params: { workspaceId: workspace.id } });
        const invitations = yield* asAlice.invitations.list({
          params: { workspaceId: workspace.id },
        });
        const cannotList = yield* Effect.flip(
          asBob.invitations.list({ params: { workspaceId: workspace.id } }),
        );
        const removed = yield* asAlice.members.remove({
          params: { workspaceId: workspace.id, memberId: joined.id },
        });
        const afterRemovalList = yield* asAlice.members.list({
          params: { workspaceId: workspace.id },
        });
        const afterRemoval = yield* Effect.flip(asBob.members.get({ params }));
        const missing = yield* asAlice.members.get({
          params: { workspaceId: workspace.id, memberId: Member.Id.make("nobody") },
          responseMode: "response-only",
        });
        return {
          owner,
          outsider,
          invitation,
          wrongRecipient,
          joined,
          readByBob,
          cannotInvite,
          members,
          invitations,
          cannotList,
          removed,
          afterRemoval,
          afterRemovalList,
          missingStatus: missing.status,
        };
      }).pipe(Effect.scoped, Effect.provide(server(filename))),
    );
    expect(outcome.owner.identity).toEqual({ _tag: "Human", id: alice });
    expect(outcome.outsider).toMatchObject({ _tag: "Gateway.NotMember" });
    expect(outcome.invitation.state).toEqual({ _tag: "Pending" });
    expect(outcome.wrongRecipient).toMatchObject({ _tag: "InvitationApplication.NotRecipient" });
    expect(outcome.joined).toMatchObject({
      identity: { _tag: "Human", id: bob },
      status: "active",
    });
    expect(outcome.readByBob.id).toBe(outcome.owner.id);
    expect(outcome.cannotInvite).toMatchObject({ _tag: "Authorization.Denied" });
    expect(outcome.members.map((member) => member.id).sort((a, b) => a.localeCompare(b))).toEqual(
      [outcome.owner.id, outcome.joined.id].sort((a, b) => a.localeCompare(b)),
    );
    expect(outcome.invitations).toMatchObject([
      { details: { id: outcome.invitation.details.id }, state: { _tag: "Accepted" } },
    ]);
    expect(outcome.cannotList).toMatchObject({ _tag: "Authorization.Denied" });
    expect(outcome.removed).toMatchObject({ id: outcome.joined.id, status: "removed" });
    expect(
      outcome.afterRemovalList.map((member) => member.status).sort((a, b) => a.localeCompare(b)),
    ).toEqual(["active", "removed"]);
    expect(outcome.afterRemoval).toMatchObject({ _tag: "Gateway.NotMember" });
    expect(outcome.missingStatus).toBe(404);
  }));

test("email sign-in issues a session the server accepts, and the directory lists what it can reach", async () =>
  temporary(async (filename) => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const anonymous = yield* HttpApiClient.make(Api).pipe(Effect.provide(asToken("")));
        const email = "jo@mercier.co";
        yield* anonymous.session.start({ payload: { email } });
        const wrong = yield* Effect.flip(
          anonymous.session.complete({ payload: { email, code: "000000" } }),
        );
        const code = delivered.get(email);
        if (code === undefined) return yield* Effect.die("No code was delivered");
        const session = yield* anonymous.session.complete({ payload: { email, code } });
        const reused = yield* Effect.flip(anonymous.session.complete({ payload: { email, code } }));
        const client = yield* HttpApiClient.make(Api).pipe(Effect.provide(asToken(session.token)));
        const before = yield* client.me.workspaces();
        const workspace = yield* client.workspaces.create();
        const inviter = yield* HttpApiClient.make(Api).pipe(Effect.provide(asToken(alice)));
        const other = yield* inviter.workspaces.create();
        const invitation = yield* inviter.invitations.issue({
          params: { workspaceId: other.id },
          payload: {
            recipientId: session.identity,
            expiresAt: DateTime.add(yield* DateTime.now, { hours: 1 }),
            grants: [],
          },
        });
        const after = yield* client.me.workspaces();
        yield* client.invitations.accept({
          params: { workspaceId: other.id, invitationId: invitation.details.id },
        });
        const joined = yield* client.me.workspaces();
        return { wrong, session, reused, before, workspace, other, after, joined };
      }).pipe(Effect.scoped, Effect.provide(server(filename))),
    );
    expect(outcome.wrong).toMatchObject({ _tag: "SignIn.Rejected", reason: "mismatch" });
    expect(outcome.session.identity).toBe(Identity.HumanId.make("jo@mercier.co"));
    expect(outcome.reused).toMatchObject({ _tag: "SignIn.Rejected", reason: "unknown" });
    expect(outcome.before).toEqual({ memberships: [], invitations: [] });
    expect(outcome.after.memberships).toMatchObject([
      { workspace: { id: outcome.workspace.id }, member: { status: "active" }, people: 1 },
    ]);
    expect(outcome.after.invitations).toMatchObject([
      { details: { workspaceId: outcome.other.id }, state: { _tag: "Pending" } },
    ]);
    expect(outcome.joined.invitations).toEqual([]);
    const people = new Map(outcome.joined.memberships.map((m) => [m.workspace.id, m.people]));
    expect(people).toEqual(
      new Map([
        [outcome.workspace.id, 1],
        [outcome.other.id, 2],
      ]),
    );
  }));
