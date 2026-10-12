import { expect, expectTypeOf, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import * as PermissionCatalog from "../../src/authorization/PermissionCatalog.ts";
import * as Permission from "../../src/authorization/Permission.ts";
import * as MemberPermissions from "../../src/workspace/MemberPermissions.ts";

it.effect(
  "the catalog layer resolves domain declarations and overrides through a stable service",
  () =>
    Effect.gen(function* () {
      const group = Permission.makeGroup("test.member", { targetKind: "Member" });
      const Create = group.make("create", {
        targetKind: "Workspace",
        builtinTier: "administrator",
      });
      const configured = PermissionCatalog.layer([
        MemberPermissions.Read,
        MemberPermissions.Remove,
        Create,
      ]);
      expectTypeOf<
        Layer.Success<typeof configured>
      >().toEqualTypeOf<PermissionCatalog.PermissionCatalog>();
      expectTypeOf<Layer.Services<typeof configured>>().toEqualTypeOf<never>();
      expectTypeOf<Layer.Error<typeof configured>>().toEqualTypeOf<
        PermissionCatalog.Duplicate | Schema.SchemaError
      >();
      expectTypeOf<Effect.Success<ReturnType<typeof PermissionCatalog.make>>>().toEqualTypeOf<
        PermissionCatalog.PermissionCatalog["Service"]
      >();
      const consume = Effect.gen(function* () {
        const permissionCatalog = yield* PermissionCatalog.PermissionCatalog;
        expect(yield* permissionCatalog.get(MemberPermissions.Read.name)).toEqual(
          MemberPermissions.Read,
        );
        expect(yield* permissionCatalog.get(MemberPermissions.Remove.name)).toEqual(
          MemberPermissions.Remove,
        );
        expect(yield* permissionCatalog.get(Create.name)).toEqual(Create);
        expect(permissionCatalog.definitions).toEqual([
          MemberPermissions.Read,
          MemberPermissions.Remove,
          Create,
        ]);
      });
      expectTypeOf<
        Effect.Services<typeof consume>
      >().toEqualTypeOf<PermissionCatalog.PermissionCatalog>();
      expectTypeOf<Effect.Error<typeof consume>>().toEqualTypeOf<PermissionCatalog.Unknown>();
      yield* consume.pipe(Effect.provide(configured));
    }),
);

it.effect("duplicate names reject construction even when their definitions agree", () =>
  Effect.gen(function* () {
    for (const duplicate of [
      MemberPermissions.Read,
      Permission.make(MemberPermissions.Read.name, {
        targetKind: "Member",
        builtinTier: "member",
      }),
      Permission.make(MemberPermissions.Read.name, {
        targetKind: "Workspace",
        builtinTier: "member",
      }),
      Permission.make(MemberPermissions.Read.name, { targetKind: "Member", builtinTier: "owner" }),
    ]) {
      const error = yield* PermissionCatalog.make([MemberPermissions.Read, duplicate]).pipe(
        Effect.flip,
      );
      expect(error).toMatchObject({
        _tag: "PermissionCatalog.Duplicate",
        name: MemberPermissions.Read.name,
      });
    }
    const configured = PermissionCatalog.layer([MemberPermissions.Read, MemberPermissions.Read]);
    const error = yield* Effect.void.pipe(Effect.provide(configured), Effect.flip);
    expect(error).toMatchObject({
      _tag: "PermissionCatalog.Duplicate",
      name: MemberPermissions.Read.name,
    });
  }),
);

it.effect("unknown permissions fail explicitly, including in an empty catalog", () =>
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

it.effect(
  "catalog definitions are isolated from changes to declarations, input lists, and lookup results",
  () =>
    Effect.gen(function* () {
      const declaration = Permission.make("test.read", {
        targetKind: "Member",
        builtinTier: "member",
      });
      const originalName = declaration.name;
      const definitions = [declaration];
      const catalog = yield* PermissionCatalog.make(definitions);
      Reflect.set(declaration, "name", MemberPermissions.Remove.name);
      Reflect.set(declaration, "targetKind", "Workspace");
      Reflect.set(declaration, "builtinTier", "owner");
      definitions.push(MemberPermissions.Remove);
      const resolved = yield* catalog.get(originalName);
      expect(resolved).toEqual({
        name: originalName,
        targetKind: "Member",
        builtinTier: "member",
      });
      expect(Reflect.set(resolved, "name", MemberPermissions.Remove.name)).toBe(false);
      expect(Reflect.set(resolved, "targetKind", "Workspace")).toBe(false);
      expect(Reflect.set(resolved, "builtinTier", "owner")).toBe(false);
      expect(Reflect.set(catalog.definitions, "0", MemberPermissions.Remove)).toBe(false);
      expect(catalog.definitions).toEqual([resolved]);
      expect(yield* catalog.get(originalName)).toEqual({
        name: originalName,
        targetKind: "Member",
        builtinTier: "member",
      });
      expect(yield* Effect.flip(catalog.get(MemberPermissions.Remove.name))).toMatchObject({
        _tag: "PermissionCatalog.Unknown",
        name: MemberPermissions.Remove.name,
      });
    }),
);

it.effect("invalid declarations fail construction through the schema error channel", () =>
  Effect.gen(function* () {
    for (const [field, value] of [
      ["name", ""],
      ["targetKind", "Unknown"],
      ["builtinTier", "unknown"],
      ["builtinTier", undefined],
    ] as const) {
      const declaration = Permission.make("test.invalid", {
        targetKind: "Member",
        builtinTier: "member",
      });
      Reflect.set(declaration, field, value);
      const error = yield* PermissionCatalog.make([declaration]).pipe(Effect.flip);
      expect(error._tag).toBe("SchemaError");
    }
  }),
);
