import { ConnectionImplementation } from "@amends/connection";
import { Context, Layer, Option, Schema } from "effect";

/**
 * The connection implementations a host installed, as they declare themselves. Core checks
 * connections against it; hosts register the adapters they compose, and never core itself.
 */
export interface Interface {
  readonly list: ReadonlyArray<ConnectionImplementation.Declaration>;
  readonly get: (
    id: ConnectionImplementation.Id,
  ) => Option.Option<ConnectionImplementation.Declaration>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/connection/catalog/Service",
) {}

/**
 * A catalog of declarations, which must be valid and name distinct implementations.
 *
 * @category constructors
 */
export const make = (
  declarations: ReadonlyArray<ConnectionImplementation.Declaration>,
): Interface => {
  const valid = Schema.decodeSync(Schema.Array(ConnectionImplementation.Declaration))(declarations);
  const byId = new Map(valid.map((declaration) => [declaration.id, declaration]));
  if (byId.size !== valid.length)
    throw new Error("Connection implementations must have distinct IDs");
  return {
    list: valid,
    get: (id) => Option.fromNullishOr(byId.get(id)),
  };
};

/** @category layers */
export const layer = (declarations: ReadonlyArray<ConnectionImplementation.Declaration>) =>
  Layer.sync(Service, () => make(declarations));

export * as ConnectionCatalog from "./catalog.ts";
