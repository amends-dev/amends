import { describe, expect, it } from "@effect/vitest"
import { connectionOf } from "../../test/fixtures.ts"
import { connectionNameIn } from "./connections.ts"

describe("connectionNameIn", () => {
  const connections = [connectionOf("connection-1", "Anthropic"), connectionOf("connection-2", "Daytona")]

  it("is what the connection is called among the workspace's", () => {
    expect(connectionNameIn(connections, "connection-1")).toBe("Anthropic")
    expect(connectionNameIn(connections, "connection-2")).toBe("Daytona")
  })

  it("is Removed connection once the connection is gone, or before the workspace's are read", () => {
    expect(connectionNameIn(connections, "connection-9")).toBe("Removed connection")
    expect(connectionNameIn([], "connection-1")).toBe("Removed connection")
  })
})
