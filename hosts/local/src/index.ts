import { Identity, Member, Workspace } from "@amends/core";
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
  if (command === "get" && args.length === 3) {
    const workspaceId = yield* Schema.decodeUnknownEffect(Workspace.Id)(args[0]);
    const humanId = yield* Schema.decodeUnknownEffect(Identity.HumanId)(args[1]);
    const memberId = yield* Schema.decodeUnknownEffect(Member.Id)(args[2]);
    const result = yield* Effect.flatMap(LocalHost.Service, (host) =>
      host.getMember(workspaceId, Identity.Reference.cases.Human.make({ id: humanId }), memberId),
    ).pipe(Effect.provide(LocalHost.layer(filename)));
    yield* Effect.sync(() => console.log(JSON.stringify(result)));
    return;
  }
  return yield* new Usage({
    message:
      "Commands: demo | create <trusted-human-id> | get <workspace-id> <trusted-human-id> <member-id>. AMENDS_DATABASE selects the SQLite file. This CLI is trusted local ingress, not a network authentication endpoint.",
  });
});

BunRuntime.runMain(program);
