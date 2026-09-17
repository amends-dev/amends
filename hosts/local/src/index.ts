import { Identity, Invitation, Member, Workspace } from "@amends/core";
import { BunRuntime } from "@effect/platform-bun";
import { Config, Effect, Schema } from "effect";
import { LocalDemo } from "./demo.ts";
import { LocalHost } from "./host.ts";

class Usage extends Schema.TaggedError<Usage>()("LocalHost.Usage", { message: Schema.String }) {}

const program = Effect.gen(function* () {
  const filename = yield* Config.String("AMENDS_DATABASE").pipe(
    Config.withDefault("amends.sqlite"),
  );
  const [command = "demo", ...args] = Bun.argv.slice(2);
  if (command === "demo" && args.length === 0) return yield* LocalDemo.run(filename);
  if (command === "create" && args.length === 1) {
    const humanId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[0]);
    const result = yield* Effect.flatMap(LocalHost.Service, (host) =>
      host.createWorkspace(humanId),
    ).pipe(Effect.provide(LocalHost.layer(filename)));
    yield* Effect.sync(() => console.log(JSON.stringify(result)));
    return;
  }
  if ((command === "get" || command === "remove") && args.length === 3) {
    const workspaceId = yield* Schema.decodeUnknownEffect(Workspace.Id)(args[0]);
    const humanId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[1]);
    const memberId = yield* Schema.decodeUnknownEffect(Member.Id)(args[2]);
    const identity = Identity.Reference.cases.Human.make({ id: humanId });
    const result = yield* Effect.flatMap(LocalHost.Service, (host) =>
      command === "get"
        ? host.getMember(workspaceId, identity, memberId)
        : host.removeMember(workspaceId, identity, memberId),
    ).pipe(Effect.provide(LocalHost.layer(filename)));
    yield* Effect.sync(() => console.log(JSON.stringify(result)));
    return;
  }
  if (command === "invite" && (args.length === 4 || args.length === 5)) {
    const workspaceId = yield* Schema.decodeUnknownEffect(Workspace.Id)(args[0]);
    const issuerId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[1]);
    const names = args[4] === "-" ? [] : (args[4] ?? "member.read").split(",");
    const request = yield* Schema.decodeUnknownEffect(Invitation.Request)({
      recipientId: args[2],
      expiresAt: args[3],
      grants: names.map((permission) => ({
        permission,
        scope: { _tag: "Workspace", workspaceId },
      })),
    });
    const result = yield* Effect.flatMap(LocalHost.Service, (host) =>
      host.invite(workspaceId, Identity.Reference.cases.Human.make({ id: issuerId }), request),
    ).pipe(Effect.provide(LocalHost.layer(filename)));
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(Invitation.Record))(result);
    yield* Effect.sync(() => console.log(json));
    return;
  }
  if ((command === "accept" || command === "revoke") && args.length === 3) {
    const workspaceId = yield* Schema.decodeUnknownEffect(Workspace.Id)(args[0]);
    const humanId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[1]);
    const invitationId = yield* Schema.decodeUnknownEffect(Invitation.Id)(args[2]);
    const json = yield* Effect.gen(function* () {
      const host = yield* LocalHost.Service;
      if (command === "accept")
        return yield* Schema.encodeEffect(Schema.fromJsonString(Member.Record))(
          yield* host.acceptInvitation(workspaceId, humanId, invitationId),
        );
      return yield* Schema.encodeEffect(Schema.fromJsonString(Invitation.Record))(
        yield* host.revokeInvitation(
          workspaceId,
          Identity.Reference.cases.Human.make({ id: humanId }),
          invitationId,
        ),
      );
    }).pipe(Effect.provide(LocalHost.layer(filename)));
    yield* Effect.sync(() => console.log(json));
    return;
  }
  if (command === "enable-invites" && args.length === 2) {
    const workspaceId = yield* Schema.decodeUnknownEffect(Workspace.Id)(args[0]);
    const humanId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[1]);
    yield* Effect.flatMap(LocalHost.Service, (host) =>
      host.enableInvitations(workspaceId, Identity.Reference.cases.Human.make({ id: humanId })),
    ).pipe(Effect.provide(LocalHost.layer(filename)));
    yield* Effect.sync(() =>
      console.log(
        "Invitation capability upgrade checked; existing assignments, including revocations, were preserved.",
      ),
    );
    return;
  }
  return yield* new Usage({
    message:
      "Commands: demo | create <human> | get <workspace> <human> <member> | remove <workspace> <human> <member> | invite <workspace> <issuer> <recipient> <expiry-ISO> [permissions,default=member.read; -=none] | accept <workspace> <recipient> <invitation> | revoke <workspace> <issuer> <invitation> | enable-invites <workspace> <owner>. Identities are trusted local assertions. AMENDS_DATABASE selects SQLite storage.",
  });
});

BunRuntime.runMain(program);
