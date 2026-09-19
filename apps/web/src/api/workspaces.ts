import { Effect } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";
export const makeCreate = () =>
  ApiClient.runtime.fn(
    Effect.fn("Workspaces.create")(function* () {
      const client = yield* ApiClient;
      return yield* client.workspaces.create().pipe(Reactivity.mutation([keys.me.workspaces]));
    }),
  );
export * as Workspaces from "./workspaces.ts";
