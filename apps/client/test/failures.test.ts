import { describe, expect, it } from "@effect/vitest";
import { Cause } from "effect";
import { InvalidCommand, isStale, workspaceFailure } from "../src/api/failures.ts";

describe("workspaceFailure", () => {
  it("classifies reported failures by their contract tag", () => {
    const failure = (_tag: string) => workspaceFailure(Cause.fail({ _tag }));
    expect(failure("WorkspaceSettings.Changed")).toBe("changed");
    expect(failure("Gateway.Conflict")).toBe("changed");
    expect(failure("Authorization.Denied")).toBe("denied");
    expect(failure("MemberApplication.AlreadyRemoved")).toBe("gone");
    expect(failure("Gateway.InvalidInput")).toBe("invalid");
    expect(workspaceFailure(Cause.fail(new InvalidCommand({ message: "Expected a string" })))).toBe(
      "invalid",
    );
    expect(failure("Gateway.Uncertain")).toBe("failed");
  });
  it("fails closed for unknown tags, transport failures, and defects", () => {
    expect(workspaceFailure(Cause.fail({ _tag: "Something.New" }))).toBe("failed");
    expect(workspaceFailure(Cause.fail("text"))).toBe("failed");
    expect(workspaceFailure(Cause.die(new Error("boom")))).toBe("failed");
  });
  it("locks edits only when what the reader sees is out of date", () => {
    expect(
      ["changed", "denied", "gone", "invalid", "failed"].map((f) => isStale(f as never)),
    ).toEqual([true, true, true, false, false]);
  });
});
