# Sandbox conformance

Test suites for the [sandbox contract](../sandbox/README.md), run by every provider adapter against
itself, so a new provider passes the same tests as the ones in this repository. The package
depends on Effect, `@effect/vitest`, and the contract; the adapter's harness supplies the provider.

## Running the suites

An adapter supplies a `Harness`, conventionally in `test/harness.ts`:

| Member      | Meaning                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `name`      | Names the provider in suite titles.                                         |
| `available` | `false` skips every suite, as Daytona does unless asked and given a key.    |
| `provider`  | The provider under test, built for one test's scope.                        |
| `options`   | Acquisition options for every sandbox, such as labels or a template.        |
| `port`      | A port no concurrent test listens on, for the port suite.                   |
| `timeout`   | How long one test may take, in milliseconds; hosted providers need minutes. |
| `http`      | The HTTP client for requests to exposed ports.                              |

Every sandbox the suites acquire is destroyed when its test ends, and every snapshot deleted. A
sandbox needs `sh`, `cat`, `sleep`, and `python3`. Each adapter test file registers one suite, such
as `Suites.processes(harness)`. The tests use live time, since they wait on real processes.

## Suites

| Suite       | Covers                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle` | Fresh acquisition and its working directory, acquiring a stopped sandbox again with its files, a fresh one when the one asked for is gone, and the sandbox's environment. |
| `commands`  | Exit codes and separate output streams, arguments passed without a shell reading them, relative directories and added environment, and files shared with file operations. |
| `processes` | Background output and exit, standard input where declared and `Unsupported` otherwise, killing, and directory and environment.                                            |
| `files`     | Any bytes written and read back, created directories, replacement, absolute paths, and a missing file.                                                                    |
| `ports`     | A process listening inside, reached through the exposed URL and its headers.                                                                                              |
| `snapshots` | A new sandbox from files as they were when captured, deleted snapshots, and snapshots another provider took; `Unsupported` without the capability.                        |
