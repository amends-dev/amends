import { Api, ApiErrors, Unauthorized } from "@amends-dev/api-http";
import { GatewayErrors, SignIn } from "@amends-dev/gateway";
import { expect, it } from "@effect/vitest";
import type { SchemaAST } from "effect";
import { HttpApi } from "effect/http-api";

/** The constructor an error schema declares, which every schema of that error shares. */
const constructorOf = (ast: SchemaAST.AST): unknown => ast.annotations?.["~constructor"];
/** Errors the HTTP layer raises itself, beside the gateway: authentication, sign-in, and limits. */
const transport = new Set(
  [Unauthorized, ApiErrors.HumanRequired, ApiErrors.TooManyStreams, SignIn.Rejected].map((error) =>
    constructorOf(error.ast),
  ),
);

it("every error a route declares reaches its client as declared, never as a defect", () => {
  // The gateway turns any error outside its public set into a defect, which a route answers with
  // 500, so an error a route declares must be public, or raised by the HTTP layer itself.
  const exposed = new Set(
    GatewayErrors.PublicError.members.map((member) => constructorOf(member.ast)),
  );
  const unreachable: Array<string> = [];
  HttpApi.reflect(Api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, errors }) => {
      for (const [, declared] of errors)
        for (const { ast } of declared) {
          const error = constructorOf(ast);
          if (!exposed.has(error) && !transport.has(error))
            unreachable.push(
              `${group.identifier}.${endpoint.identifier}: ${String(ast.annotations?.identifier)}`,
            );
        }
    },
  });
  expect(exposed.size).toBeGreaterThan(50);
  expect(unreachable).toEqual([]);
});
