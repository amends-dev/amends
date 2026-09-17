import { expect, expectTypeOf, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { PermissionCatalog } from "../src/authorization/permission-catalog.ts";
import { Permission } from "../src/authorization/permission.ts";
import { MemberPermissions } from "../src/workspace/member-permissions.ts";

test("the catalog layer resolves domain declarations and overrides through a stable service", async () => {
  const group = Permission.group("test.member", { targetKind: "Member" });
  const Create = group.make("create", { targetKind: "Workspace" });
  const configured = PermissionCatalog.layer([
    MemberPermissions.Read,
    MemberPermissions.Remove,
    Create,
  ]);
  expectTypeOf<Layer.Success<typeof configured>>().toEqualTypeOf<PermissionCatalog.Service>();
  expectTypeOf<Layer.Services<typeof configured>>().toEqualTypeOf<never>();
  expectTypeOf<Layer.Error<typeof configured>>().toEqualTypeOf<
    PermissionCatalog.Duplicate | Schema.SchemaError
  >();
  expectTypeOf<
    Effect.Success<ReturnType<typeof PermissionCatalog.make>>
  >().toEqualTypeOf<PermissionCatalog.Interface>();

  const consume = Effect.gen(function* () {
    const catalog = yield* PermissionCatalog.Service;
    expect(yield* catalog.get(MemberPermissions.Read.name)).toEqual(MemberPermissions.Read);
    expect(yield* catalog.get(MemberPermissions.Remove.name)).toEqual(MemberPermissions.Remove);
    expect(yield* catalog.get(Create.name)).toEqual(Create);
  });
  expectTypeOf<Effect.Services<typeof consume>>().toEqualTypeOf<PermissionCatalog.Service>();
  expectTypeOf<Effect.Error<typeof consume>>().toEqualTypeOf<PermissionCatalog.Unknown>();
  await Effect.runPromise(consume.pipe(Effect.provide(configured)));
});

test("duplicate names reject construction even when their definitions agree", async () => {
  for (const duplicate of [
    MemberPermissions.Read,
    Permission.make(MemberPermissions.Read.name, { targetKind: "Member" }),
    Permission.make(MemberPermissions.Read.name, { targetKind: "Workspace" }),
  ]) {
    const error = await Effect.runPromise(
      PermissionCatalog.make([MemberPermissions.Read, duplicate]).pipe(Effect.flip),
    );
    expect(error).toMatchObject({
      _tag: "PermissionCatalog.Duplicate",
      name: MemberPermissions.Read.name,
    });
  }

  const configured = PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Read]);
  const error = await Effect.runPromise(Effect.void.pipe(Effect.provide(configured), Effect.flip));
  expect(error).toMatchObject({
    _tag: "PermissionCatalog.Duplicate",
    name: MemberPermissions.Read.name,
  });
});

test("unknown permissions fail explicitly, including in an empty catalog", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const catalog = yield* PermissionCatalog.make([MemberPermissions.Read]);
      const unregistered = Permission.Name.make("member.unregistered");
      expect(yield* Effect.flip(catalog.get(unregistered))).toMatchObject({
        _tag: "PermissionCatalog.Unknown",
        name: unregistered,
      });
      expect(yield* Effect.flip(catalog.get(MemberPermissions.Remove.name))).toMatchObject({
        _tag: "PermissionCatalog.Unknown",
        name: MemberPermissions.Remove.name,
      });
      const empty = yield* PermissionCatalog.make([]);
      expect(yield* Effect.flip(empty.get(MemberPermissions.Read.name))).toMatchObject({
        _tag: "PermissionCatalog.Unknown",
        name: MemberPermissions.Read.name,
      });
    }),
  );
});

test("catalog definitions are isolated from changes to declarations, input lists, and lookup results", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const declaration = Permission.make("test.read", { targetKind: "Member" });
      const originalName = declaration.name;
      const definitions = [declaration];
      const catalog = yield* PermissionCatalog.make(definitions);
      Reflect.set(declaration, "name", MemberPermissions.Remove.name);
      Reflect.set(declaration, "targetKind", "Workspace");
      definitions.push(MemberPermissions.Remove);

      const resolved = yield* catalog.get(originalName);
      expect(resolved).toEqual({ name: originalName, targetKind: "Member" });
      expect(Reflect.set(resolved, "name", MemberPermissions.Remove.name)).toBe(false);
      expect(Reflect.set(resolved, "targetKind", "Workspace")).toBe(false);
      expect(yield* catalog.get(originalName)).toEqual({
        name: originalName,
        targetKind: "Member",
      });
      expect(yield* Effect.flip(catalog.get(MemberPermissions.Remove.name))).toMatchObject({
        _tag: "PermissionCatalog.Unknown",
        name: MemberPermissions.Remove.name,
      });
    }),
  );
});

test("invalid declarations fail construction through the schema error channel", async () => {
  for (const [field, value] of [
    ["name", ""],
    ["targetKind", "Unknown"],
  ] as const) {
    const declaration = Permission.make("test.invalid", { targetKind: "Member" });
    Reflect.set(declaration, field, value);
    const error = await Effect.runPromise(PermissionCatalog.make([declaration]).pipe(Effect.flip));
    expect(error._tag).toBe("SchemaError");
  }
});
