import { Harness, HarnessImplementation } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Context, Layer, Option, Schema } from "effect";

/**
 * The harnesses and sandbox providers a host installed, as they declare themselves. Core checks
 * environments against it; hosts register the implementations they compose, never core itself.
 */
export interface Interface {
  readonly harnesses: ReadonlyArray<HarnessImplementation.Declaration>;
  readonly sandboxes: ReadonlyArray<SandboxImplementation.Declaration>;
  readonly harness: (id: Harness.Name) => Option.Option<HarnessImplementation.Declaration>;
  readonly sandbox: (
    id: SandboxImplementation.Id,
  ) => Option.Option<SandboxImplementation.Declaration>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/environment/catalog/Service",
) {}

export interface Declarations {
  readonly harnesses?: ReadonlyArray<HarnessImplementation.Declaration> | undefined;
  readonly sandboxes?: ReadonlyArray<SandboxImplementation.Declaration> | undefined;
}

const indexed = <A extends { readonly id: string }>(values: ReadonlyArray<A>, kind: string) => {
  const byId = new Map(values.map((value) => [value.id, value]));
  if (byId.size !== values.length) throw new Error(`${kind} must have distinct IDs`);
  return byId;
};

/**
 * A catalog of declarations, which must be valid and name distinct implementations.
 *
 * @category constructors
 */
export const make = (declarations: Declarations = {}): Interface => {
  const harnesses = Schema.decodeSync(Schema.Array(HarnessImplementation.Declaration))(
    declarations.harnesses ?? [],
  );
  const sandboxes = Schema.decodeSync(Schema.Array(SandboxImplementation.Declaration))(
    declarations.sandboxes ?? [],
  );
  const harnessById = indexed(harnesses, "Harnesses");
  const sandboxById = indexed(sandboxes, "Sandbox providers");
  return {
    harnesses,
    sandboxes,
    harness: (id) => Option.fromNullishOr(harnessById.get(id)),
    sandbox: (id) => Option.fromNullishOr(sandboxById.get(id)),
  };
};

/** @category layers */
export const layer = (declarations: Declarations = {}) =>
  Layer.sync(Service, () => make(declarations));

export * as EnvironmentCatalog from "./catalog.ts";
