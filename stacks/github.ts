/**
 * What the repository's workflows need to deploy: a Cloudflare API token that may deploy Workers
 * and attach them to amends.dev, and the account it belongs to, as Actions secrets. Cloudflare's
 * OAuth cannot create tokens, so deploy this from the repository root with a separate profile
 * whose Cloudflare login is the Global API Key, and whose GitHub login is the gh CLI; deploy it
 * again to rotate the token or change what it may do:
 *
 *   bun alchemy profile create admin
 *   bun alchemy profile edit --profile admin
 *   bun alchemy deploy --config stacks/github.ts --profile admin
 *
 * An API token works in the key's place only with everything this run does: read the amends.dev
 * zone, reach Alchemy's state store (Workers Scripts and Secrets Store), and create API tokens.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import { Effect, Layer, Redacted } from "effect";

const repository = { owner: "amends-dev", repository: "amends" };

export default Alchemy.Stack(
  "amends-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
    const zone = yield* Cloudflare.Zone.findZoneByName({ accountId, name: "amends.dev" }).pipe(
      Effect.orDie,
    );
    if (zone === undefined) {
      return yield* Effect.die(
        new Error(
          "amends.dev is not visible to this profile: its Cloudflare login cannot read the zone.",
        ),
      );
    }

    const token = yield* Cloudflare.ApiToken.AccountApiToken("DeployToken", {
      name: "amends-deploy",
      accountId,
      policies: [
        {
          effect: "allow",
          // Secrets Store holds what CI needs to reach Alchemy's state store.
          permissionGroups: ["Workers Scripts Write", "Secrets Store Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
        },
        {
          effect: "allow",
          permissionGroups: ["Workers Routes Write", "Zone Read"],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: {
              [`com.cloudflare.api.account.zone.${zone.id}`]: "*",
            },
          },
        },
      ],
    });

    yield* GitHub.Secret("CloudflareApiToken", {
      ...repository,
      name: "CLOUDFLARE_API_TOKEN",
      value: token.value,
    });
    yield* GitHub.Secret("CloudflareAccountId", {
      ...repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    return { token: token.name };
  }),
);
