/**
 * What the repository's workflows need, as GitHub settings and Actions secrets:
 *
 * - For the site: a Cloudflare API token that may deploy Workers and attach them to amends.dev,
 *   and the account it belongs to.
 * - For releases: the `npm` environment, which only main may use and which npm trusts to publish
 *   the packages, and in it the token that opens the release pull request. The workflow's own
 *   token cannot be used, since a pull request it opens starts no CI.
 * - A ruleset that lets main change only through pull requests whose checks pass, since what
 *   reaches main is what the site deploys and the packages publish.
 *
 * The release token is a fine-grained personal access token for this repository, with read and
 * write access to contents and pull requests, which this run reads as `RELEASE_GITHUB_TOKEN` from
 * the environment or the repository's `.env`. Cloudflare's OAuth cannot create tokens, so deploy
 * this from the repository root with a separate profile whose Cloudflare login is the Global API
 * Key, and whose GitHub login is the gh CLI; deploy it again to rotate either token or change what
 * they may do:
 *
 *   bun alchemy profile create admin
 *   bun alchemy profile edit --profile admin
 *   bun alchemy deploy --config stacks/github.ts --profile admin
 *
 * An API token works in the key's place only with everything this run does: read the amends.dev
 * zone, reach Alchemy's state store (Workers Scripts and Secrets Store), and create API tokens.
 */

import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as GitHub from "alchemy/GitHub"
import { Config, Effect, Layer, Redacted } from "effect"

const repository = { owner: "amends-dev", repository: "amends" }

export default Alchemy.Stack(
  "amends-github",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state()
  },
  Effect.gen(function* () {
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment
    const zone = yield* Cloudflare.Zone.findZoneByName({ accountId, name: "amends.dev" }).pipe(Effect.orDie)
    if (zone === undefined) {
      return yield* Effect.die(
        new Error("amends.dev is not visible to this profile: its Cloudflare login cannot read the zone.")
      )
    }

    const token = yield* Cloudflare.ApiToken.AccountApiToken("DeployToken", {
      name: "amends-deploy",
      accountId,
      policies: [
        {
          effect: "allow",
          // Secrets Store holds what CI needs to reach Alchemy's state store.
          permissionGroups: ["Workers Scripts Write", "Secrets Store Write"],
          resources: { [`com.cloudflare.api.account.${accountId}`]: "*" }
        },
        {
          effect: "allow",
          permissionGroups: ["Workers Routes Write", "Zone Read"],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: {
              [`com.cloudflare.api.account.zone.${zone.id}`]: "*"
            }
          }
        }
      ]
    })

    yield* GitHub.Secret("CloudflareApiToken", {
      ...repository,
      name: "CLOUDFLARE_API_TOKEN",
      value: token.value
    })
    yield* GitHub.Secret("CloudflareAccountId", {
      ...repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId)
    })

    const npmEnvironment = yield* GitHub.Environment("NpmEnvironment", {
      ...repository,
      name: "npm",
      deploymentBranchPolicy: { customBranchPolicies: ["main"] }
    })
    yield* GitHub.Secret("ReleaseGitHubToken", {
      ...repository,
      name: "RELEASE_GITHUB_TOKEN",
      environment: npmEnvironment,
      value: yield* Config.Redacted("RELEASE_GITHUB_TOKEN")
    })

    yield* GitHub.Ruleset("MainRuleset", {
      ...repository,
      name: "main",
      target: "branch",
      enforcement: "active",
      conditions: { include: ["~DEFAULT_BRANCH"] },
      // Administrators may merge a pull request whose checks fail, as when CI itself is broken.
      bypassActors: [{ actorType: "RepositoryRole", actorId: 5, bypassMode: "pull_request" }],
      rules: {
        requiredStatusChecks: { checks: [{ context: "Check" }] },
        nonFastForward: true,
        deletion: true
      }
    })

    return { token: token.name }
  })
)
