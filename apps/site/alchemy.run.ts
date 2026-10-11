/**
 * The site on Cloudflare: the static build served as a Worker's assets, with no Worker code.
 * Deploying runs the build when anything it reads has changed. The `prod` stage serves amends.dev;
 * any other stage, such as a pull request's preview, gets its own workers.dev address, and a pull
 * request's preview links itself in a comment there.
 *
 * Run it from this directory: `bun alchemy deploy` deploys your own stage, and CI deploys `prod`
 * from main and `pr-<number>` for each pull request.
 */
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Output from "alchemy/Output";
import { Effect, Layer } from "effect";

export default Alchemy.Stack(
  "amends-site",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const stage = yield* Alchemy.Stage;
    const website = yield* Cloudflare.Website.StaticSite("Website", {
      command: "bun run build",
      outdir: "dist",
      // The build reads the published packages' READMEs and sources for their docs, and draws
      // with UI's components and icons. Gitignore rules only apply under this directory, so the
      // patterns outside it name sources alone, never a node_modules.
      memo: {
        include: [
          "**/*",
          "../{ui,icons}/{package.json,src/**}",
          "../../{packages,adapters}/*/{package.json,tsconfig.json,README.md,src/**}",
          "../../{package.json,tsconfig.base.json}",
        ],
        lockfile: true,
      },
      assets: { notFoundHandling: "404-page", htmlHandling: "auto-trailing-slash" },
      domain: stage === "prod" ? "amends.dev" : undefined,
    });

    const github = yield* GitHub.GitHubEnv;
    if (github?.pr !== undefined) {
      yield* GitHub.Comment("PreviewComment", {
        owner: github.owner,
        repository: github.repository,
        issueNumber: github.pr,
        body: Output.interpolate`The site for this pull request is at ${website.url}, built from ${github.sha.slice(0, 7)}. It updates with each push and is removed when the pull request closes.`,
      });
    }

    return { url: website.url };
  }),
);
