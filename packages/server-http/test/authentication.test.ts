import { expect, it } from "@effect/vitest";
import { Api, Authentication } from "@amends/api-http";
import { Identity } from "@amends/core/identity";
import { Credentials, WorkspaceDirectory } from "@amends/gateway";
import { Effect, Layer, Redacted, Ref } from "effect";
import { HttpClientRequest, HttpServer } from "effect/unstable/http";
import { HttpApiMiddleware, HttpApiTest } from "effect/unstable/httpapi";
import { BearerAuthentication, MeHandlers } from "../src/index.ts";

it.effect.each(["make", "layer"] as const)(
  "bearer %s resolves each request and observes credential revocation",
  (construction) =>
    Effect.gen(function* () {
      const resolutions: Array<string> = [];
      const principals: Array<Identity.MemberReference> = [];
      yield* Effect.gen(function* () {
        const token = yield* Ref.make("alice");
        const revoked = yield* Ref.make(false);
        const credentials = Credentials.Service.of({
          resolve: Effect.fnUntraced(function* (credential) {
            const id = Redacted.value(credential);
            resolutions.push(id);
            if (yield* Ref.get(revoked))
              return yield* new Credentials.Rejected({ reason: "expired" });
            return Identity.Reference.cases.Human.make({ id: Identity.HumanId.make(id) });
          }),
        });
        const authentication =
          construction === "make"
            ? Layer.succeed(
                Authentication,
                yield* BearerAuthentication.make().pipe(
                  Effect.provideService(Credentials.Service, credentials),
                ),
              )
            : BearerAuthentication.layer.pipe(
                Layer.provide(Layer.succeed(Credentials.Service, credentials)),
              );
        const directory = Layer.succeed(
          WorkspaceDirectory.Service,
          WorkspaceDirectory.Service.of({
            list: (identity) =>
              Effect.sync(() => {
                principals.push(identity);
                return { memberships: [], invitations: [] };
              }),
          }),
        );
        const clientAuthentication = HttpApiMiddleware.layerClient(
          Authentication,
          Effect.fnUntraced(function* ({ next, request }) {
            return yield* next(HttpClientRequest.bearerToken(request, yield* Ref.get(token)));
          }),
        );
        const services = Layer.mergeAll(
          MeHandlers.layer,
          clientAuthentication,
          HttpServer.layerServices,
        ).pipe(Layer.provideMerge(authentication), Layer.provide(directory));
        yield* Effect.gen(function* () {
          const client = yield* HttpApiTest.groups(Api, ["me"]);
          expect(resolutions).toEqual([]);
          yield* client.me.workspaces();
          yield* Ref.set(token, "bob");
          yield* client.me.workspaces();
          yield* Ref.set(revoked, true);
          const rejected = yield* Effect.flip(client.me.workspaces());
          expect(rejected).toMatchObject({
            _tag: "Api.Unauthorized",
            message: "The bearer token has expired",
          });
          expect(resolutions).toEqual(["alice", "bob", "bob"]);
          expect(principals).toEqual([
            Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") }),
            Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") }),
          ]);
        }).pipe(Effect.provide(services));
      }).pipe(Effect.scoped);
    }),
);
