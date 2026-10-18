# amends

amends is a workspace where people and AI agents work together. Conversations happen in threads,
in team groups and direct messages, and an inbox gathers what needs each person. Work becomes a
task on a thread, with a status, a priority, and an assignee. Agents are members too: each runs on
a harness, such as amends's own agent or opencode, with a model and a sandbox to work in, all from
the workspace's connections. When a thread needs an agent, it takes a turn there and posts its
answer.

amends is in early development, and much is not built yet.

## What is in this repository

- **The workspace.** One HTTP API, which the [local host](hosts/local) serves on Bun, keeping
  workspaces in PostgreSQL. The app people work in is being rebuilt.
- **Developer packages.** The parts that run agents, and the sandboxes they work in, publish to npm
  under `@amends-dev`. They are built on [Effect](https://effect.website) and work in any Effect
  program, not only in amends.

| Package                                                       | What it does                                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [`@amends-dev/harness`](packages/harness)                     | Runs an agent and streams its turns in one format, whichever agent it is.                       |
| [`@amends-dev/harness-amends`](adapters/harness-amends)       | An agent in your own process, over an Effect AI language model, with sandbox tools.             |
| [`@amends-dev/harness-opencode`](adapters/harness-opencode)   | opencode as an agent, working in a sandbox behind its bridge.                                   |
| [`@amends-dev/harness-codex`](adapters/harness-codex)         | Codex app-server as an agent behind the harness bridge.                                         |
| [`@amends-dev/harness-claude`](adapters/harness-claude)       | Claude Agent SDK as an agent behind the harness bridge.                                         |
| [`@amends-dev/sandbox`](packages/sandbox)                     | The contract every sandbox provider implements, and the suites each provider runs.              |
| [`@amends-dev/sandbox-local`](adapters/sandbox-local)         | Sandboxes as directories on this machine, for development and tests.                            |
| [`@amends-dev/sandbox-daytona`](adapters/sandbox-daytona)     | Sandboxes on Daytona, each a Linux machine of its own.                                          |
| [`@amends-dev/sandbox-e2b`](adapters/sandbox-e2b)             | E2B sandboxes with files preserved across stops.                                                |
| [`@amends-dev/sandbox-vercel`](adapters/sandbox-vercel)       | Sandboxes on Vercel.                                                                            |
| [`@amends-dev/toolkit`](packages/toolkit)                     | Tools from MCP servers and HTTP APIs, assembled under a policy into the toolkit an agent calls. |
| [`@amends-dev/codemode-opencode`](adapters/codemode-opencode) | Runs the code a model writes in code mode on opencode's interpreter.                            |
| [`@amends-dev/channel`](packages/channel)                     | The contract every channel transport implements, bringing an external system's talk in.         |

[Examples](examples) are one-file programs that run each of them, such as a sandbox on this machine,
an agent in a local sandbox, or an MCP server's tools given to an agent: `bun examples/harness-amends.ts`.

## Run it locally

You need [Bun](https://bun.com) 1.3 and PostgreSQL. From the repository root:

```sh
bun install
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

The host listens on `http://127.0.0.1:8787` and creates its tables when it starts; `bun run dev`
restarts it as its source changes. Sign in with an email address, through `POST /session/email` and
`POST /session/code`: the local host prints the one-time code in its terminal. To connect
model providers, sandboxes, and the other integrations, also set `AMENDS_CREDENTIAL_KEY`, which seals
their credentials; the [local host guide](hosts/local/README.md#run) lists every setting. The API describes itself at
`/openapi.json` and `/docs`.

The local host has no email provider yet, so whoever reads its terminal can sign in as anyone. Do not
expose it beyond your machine.

## Repository layout

```text
packages/        shared packages on Effect alone: core, the contracts, and the HTTP API
adapters/        implementations over one external system each, such as PostgreSQL or Daytona
hosts/           runtime composition: the local Bun host
apps/            the design system, its icons, and the site
docs/            the core model, the design intent
design-system/   the visual references the design system is built from
scripts/         repository tooling
stacks/          Alchemy stacks for the repository itself, such as its CI secrets
repos/effect/    Effect's source, vendored as read-only reference
```

[Packages](packages/README.md), [adapters](adapters/README.md), [hosts](hosts/README.md), and
[apps](apps/README.md) each describe their part, and the [core model](docs/core-model.md) describes
the design intent behind them.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers setting up, the checks every change passes, and how
changes are made. Report a vulnerability as [SECURITY.md](SECURITY.md) describes, not in a public
issue.

## License

amends is released under the [MIT license](LICENSE).
