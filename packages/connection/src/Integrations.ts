/**
 * The integrations a host installs, among which a connection finds its own by the id it names: the
 * built-in ones it chooses, such as those of `ModelIntegrations` and `ToolIntegrations`, and those
 * it declares itself, such as of the sandbox providers it runs.
 */
import { Context, Effect } from "effect";
import { ConnectionError, NotFoundError } from "./Connection.ts";
import type { Integration } from "./Integration.ts";

export class Integrations extends Context.Service<
  Integrations,
  {
    readonly all: ReadonlyArray<Integration>;

    /** The integration of the id `id`, failing with `NotFoundError` for one the host has not. */
    readonly find: (id: string) => Effect.Effect<Integration, ConnectionError>;
  }
>()("@amends/connection/Integrations") {}

/** The installed integrations `integrations`, whose ids must be distinct. */
export const make = (integrations: ReadonlyArray<Integration>) => {
  const byId = new Map(integrations.map((integration) => [integration.id, integration]));
  if (byId.size !== integrations.length) {
    return Effect.die(new Error("More than one integration has the same id"));
  }
  return Effect.succeed(
    Integrations.of({
      all: integrations,
      find: (id) => {
        const integration = byId.get(id);
        if (integration !== undefined) return Effect.succeed(integration);
        const description = `No integration is installed as ${id}`;
        return Effect.fail(
          new ConnectionError({ integration: id, reason: new NotFoundError({ description }) }),
        );
      },
    }),
  );
};
