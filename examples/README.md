# Examples

One program per thing the published packages do, each in one file that runs as it is: a sandbox,
an agent, your own tools, and tools from an MCP server or an HTTP API. Each file says at its top
what it shows, what it needs, and how to run it. They run from the repository root with Bun, with
the keys they need in the environment:

```sh
ANTHROPIC_API_KEY=... bun examples/harness-amends.ts
```

| Example                                      | What it shows                                                                                      | Needs               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| [`sandbox-local.ts`](sandbox-local.ts)       | A sandbox on this machine: files and processes inside it, stop, resume by id, destroy.             | Nothing             |
| [`sandbox-daytona.ts`](sandbox-daytona.ts)   | The same program on Daytona, a Linux machine of its own.                                           | `DAYTONA_API_KEY`   |
| [`harness-amends.ts`](harness-amends.ts)     | An agent in this process over an Effect AI language model: a streamed turn and a whole one.        | `ANTHROPIC_API_KEY` |
| [`host-tools.ts`](host-tools.ts)             | Your own tools given to an agent, one of which the session asks about before it runs.              | `ANTHROPIC_API_KEY` |
| [`generate-object.ts`](generate-object.ts)   | A turn that answers with an object, decoded with a schema.                                         | `ANTHROPIC_API_KEY` |
| [`harness-opencode.ts`](harness-opencode.ts) | opencode in a local sandbox: a streamed turn that writes a file, the session saved and resumed.    | `ANTHROPIC_API_KEY` |
| [`harness-claude.ts`](harness-claude.ts)     | Claude Agent SDK in a local sandbox behind the bridge: a turn, and its file read back.             | `ANTHROPIC_API_KEY` |
| [`harness-codex.ts`](harness-codex.ts)       | Codex in a local sandbox behind the bridge: a turn, and its file read back.                        | `OPENAI_API_KEY`    |
| [`toolkit-mcp.ts`](toolkit-mcp.ts)           | An MCP server on this machine as a tool source, assembled into a turn's toolkit.                   | `ANTHROPIC_API_KEY` |
| [`toolkit-openapi.ts`](toolkit-openapi.ts)   | An API's OpenAPI document read into a tool source, presented to the model as a search.             | `ANTHROPIC_API_KEY` |
| [`code-mode.ts`](code-mode.ts)               | An MCP server's tools presented as one tool, `execute`, whose code runs on opencode's interpreter. | `ANTHROPIC_API_KEY` |

The examples name Anthropic's API; any endpoint the agent's protocol reaches works in its place,
as each package's guide describes. The agents that work in a sandbox install themselves there on
the first run, under the sandbox's home, which takes a minute.

The examples are a workspace, so `bun run typecheck` checks them with the packages' sources, as
CI does; they are run by hand, since they need keys and a model. Local sandboxes are created
under the system's temporary directory and destroyed when an example ends.
