import { CoreError } from "@amends-dev/core/error"
import { SignIn } from "@amends-dev/gateway"
import { expect, it } from "@effect/vitest"
import type { SchemaAST } from "effect"
import { HttpApi } from "effect/http-api"
import { Api, ApiErrors, Authentication } from "../src/index.ts"

/** The constructor an error schema declares, which every schema of that error shares. */
const constructorOf = (ast: SchemaAST.AST): unknown => ast.annotations?.["~constructor"]
/** Errors the HTTP layer raises itself, beside core: authentication, sign-in, and limits. */
const transport = new Set(
  [
    Authentication.Unauthorized,
    ApiErrors.Denied,
    ApiErrors.TooManyStreams,
    SignIn.Rejected,
    SignIn.Limited,
    SignIn.Unavailable
  ].map((error) => constructorOf(error.ast))
)

it("every error a route declares reaches its client as declared, never as a defect", () => {
  // Core reports only its kinds and turns anything else into a defect, which a route answers with
  // 500, so an error a route declares must be a kind, or raised by the HTTP layer itself.
  const exposed = new Set(CoreError.CoreError.members.map((member) => constructorOf(member.ast)))
  const unreachable: Array<string> = []
  HttpApi.reflect(Api.Api, {
    onGroup: () => {},
    onEndpoint: ({ group, endpoint, errors }) => {
      for (const [, declared] of errors)
        for (const { ast } of declared) {
          const error = constructorOf(ast)
          if (!exposed.has(error) && !transport.has(error))
            unreachable.push(`${group.identifier}.${endpoint.identifier}: ${String(ast.annotations?.identifier)}`)
        }
    }
  })
  // Each kind has its own constructor, so the comparison above is never vacuous.
  expect(exposed.size).toBe(CoreError.CoreError.members.length)
  expect(unreachable).toEqual([])
})
