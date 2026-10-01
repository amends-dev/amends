import { Context, Effect, Layer, Option } from "effect";
import { ConnectionCatalog } from "../connection/catalog.ts";
import { ConnectionStore } from "../connection/store.ts";
import { EnvironmentCatalog } from "./catalog.ts";
import { EnvironmentCompatibility } from "./compatibility.ts";
import type { Environment } from "./environment.ts";

export interface Interface {
  /**
   * Whether an environment can run now, from the host's catalogs and its account connection as
   * stored: the same answer environment and agent operations give.
   */
  readonly assessReadiness: (
    record: Environment.Record,
  ) => Effect.Effect<Environment.Readiness, ConnectionStore.Failure>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/environment/query/Service",
) {}

/** @category constructors */
export const make = Effect.fn("EnvironmentQuery.make")(function* () {
  const connectionStore = yield* ConnectionStore.Service;
  const environmentCatalog = yield* EnvironmentCatalog.Service;
  const connectionCatalog = yield* ConnectionCatalog.Service;

  const assessReadiness = Effect.fn("EnvironmentQuery.assessReadiness")(function* (
    record: Environment.Record,
  ) {
    const connectionId = record.sandbox?.connectionId ?? null;
    const found = connectionId === null ? Option.none() : yield* connectionStore.get(connectionId);
    return EnvironmentCompatibility.readiness(
      record,
      {
        harness: environmentCatalog.harness(record.harnessId),
        sandbox:
          record.sandbox === null
            ? Option.none()
            : environmentCatalog.sandbox(record.sandbox.providerId),
      },
      {
        record: found,
        declaration: Option.flatMap(found, (connection) =>
          connectionCatalog.get(connection.implementationId),
        ),
      },
    );
  });

  return Service.of({ assessReadiness });
});
/** Internal reads shared by environment and agent operations. @category layers */
export const layer = Layer.effect(Service, make());
export * as EnvironmentQuery from "./query.ts";
