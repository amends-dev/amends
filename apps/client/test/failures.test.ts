import { describe, expect, it } from "@effect/vitest";
import { Cause } from "effect";
import { InvalidCommand, isStale, workspaceFailure } from "../src/api/failures.ts";

describe("workspaceFailure", () => {
  it("classifies reported failures by their contract tag", () => {
    const failure = (_tag: string) => workspaceFailure(Cause.fail({ _tag }));
    expect(failure("WorkspaceSettingsService.Changed")).toBe("changed");
    expect(failure("GatewayErrors.Conflict")).toBe("changed");
    expect(failure("Authorization.Denied")).toBe("denied");
    expect(failure("MemberService.AlreadyRemoved")).toBe("gone");
    expect(failure("GatewayErrors.InvalidInput")).toBe("invalid");
    expect(workspaceFailure(Cause.fail(new InvalidCommand({ message: "Expected a string" })))).toBe(
      "invalid",
    );
    expect(failure("GatewayErrors.Uncertain")).toBe("failed");
  });
  it("fails closed for unknown tags, transport failures, and defects", () => {
    expect(workspaceFailure(Cause.fail({ _tag: "Something.New" }))).toBe("failed");
    expect(workspaceFailure(Cause.fail("text"))).toBe("failed");
    expect(workspaceFailure(Cause.die(new Error("boom")))).toBe("failed");
  });
  it.each([
    { name: "null", error: null },
    { name: "undefined", error: undefined },
    { name: "missing tag", error: {} },
    { name: "numeric tag", error: { _tag: 123 } },
    { name: "symbol tag", error: { _tag: Symbol("GatewayErrors.Conflict") } },
    { name: "array tag", error: { _tag: ["GatewayErrors.Conflict"] } },
    { name: "uncoercible tag", error: { _tag: Object.create(null) } },
    { name: "prototype key", error: { _tag: "constructor" } },
  ])("falls back for $name", ({ error }) => {
    expect(workspaceFailure(Cause.fail(error))).toBe("failed");
  });
  it("does not coerce an object tag into a recognized failure", () => {
    let coerced = false;
    const error = {
      _tag: {
        toString: () => {
          coerced = true;
          return "GatewayErrors.Conflict";
        },
      },
    };
    expect(workspaceFailure(Cause.fail(error))).toBe("failed");
    expect(coerced).toBe(false);
  });
  it("recognizes inherited error tags", () => {
    const error: unknown = Object.create({ _tag: "GatewayErrors.Conflict" });
    expect(workspaceFailure(Cause.fail(error))).toBe("changed");
  });
  it("uses the first recognized failure in a combined cause", () => {
    const denied = Cause.fail({ _tag: "Authorization.Denied" });
    const changed = Cause.fail({ _tag: "GatewayErrors.Conflict" });
    const transport = Cause.fail({ _tag: "HttpClientError" });
    expect(workspaceFailure(Cause.combine(denied, changed))).toBe("denied");
    expect(workspaceFailure(Cause.combine(changed, denied))).toBe("changed");
    expect(workspaceFailure(Cause.combine(transport, denied))).toBe("failed");
  });
  it("skips unrecognized failures, defects, and interruptions before a recognized failure", () => {
    const ignored = Cause.combine(
      Cause.fail({ _tag: "Something.New" }),
      Cause.combine(Cause.die({ _tag: "Authorization.Denied" }), Cause.interrupt()),
    );
    expect(workspaceFailure(ignored)).toBe("failed");
    expect(
      workspaceFailure(Cause.combine(ignored, Cause.fail({ _tag: "GatewayErrors.Conflict" }))),
    ).toBe("changed");
    expect(workspaceFailure(Cause.empty)).toBe("failed");
  });
  it("locks edits only when what the reader sees is out of date", () => {
    expect(
      ["changed", "denied", "gone", "invalid", "failed"].map((f) => isStale(f as never)),
    ).toEqual([true, true, true, false, false]);
  });
});
