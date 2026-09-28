# Daytona sandbox

`@amends/sandbox-daytona` implements the [sandbox contract](../../packages/sandbox/README.md) over
[Daytona](https://www.daytona.io/docs) with `@daytona/sdk`. Each sandbox is a Daytona container:
isolated, able to take input on a background process's session, and able to capture its
filesystem as a Daytona snapshot that new sandboxes start from.

It passes every conformance suite against a real Daytona account.

`DaytonaSandbox.make(options)` needs Effect's `Crypto` service and a scope, which closes the
client. Its options:

| Option               | Meaning                                                                        |
| -------------------- | ------------------------------------------------------------------------------ |
| `client`             | Daytona client configuration; the API key defaults to `DAYTONA_API_KEY`.       |
| `autoStopInterval`   | Minutes without activity before Daytona stops a sandbox; 0 never does.         |
| `autoDeleteInterval` | Minutes after stopping before Daytona deletes a sandbox; -1 never does.        |
| `timeout`            | Seconds to wait for creating, starting, stopping, or deleting; 120 by default. |
| `snapshotTimeout`    | Seconds to wait for a snapshot to finish; 600 by default.                      |

`DaytonaSandbox.declaration` is what a host registers: an isolated provider that runs under an
account and takes a snapshot name as its template. The account is a workspace connection:
`DaytonaConnection.declaration` declares it, with the sandbox capability for `daytona`, an API key,
and optional API URL and target settings, and `DaytonaConnection.client(access)` turns a
connection's settings and key into the client configuration above.

How the contract maps onto Daytona:

- `template` names the Daytona snapshot a new sandbox starts from; without one, Daytona's default.
- Every command runs in a Daytona session of its own, inside `sh -c`, so no shell state carries
  between commands. `exec` deletes its session when done; a background process's session remains
  until the sandbox stops.
- Daytona returns output by lines and ends an unterminated last line with a newline. `exec` ends
  each stream with a newline of its own and removes it, so its output is exactly what the command
  wrote. A background process's output arrives a line at a time: a line reaches the stream when it
  ends, and an unterminated last line arrives with a newline added.
- A background process's shell records its process ID in `/tmp` before replacing itself with the
  command, and `kill` sends that process `SIGTERM`. Input goes through the session with its echo
  suppressed.
- `expose` returns Daytona's preview URL with its `x-daytona-preview-token` header. That token
  reaches every port of the sandbox, including Daytona's own control ports, so keep it on the host.
- `snapshot` creates a Daytona snapshot named `amends-<uuid>`; `deleteSnapshot` deletes it. A
  snapshot took from ten seconds to over six minutes in testing, and the sandbox cannot be
  destroyed while one is being taken. A snapshot that fails or times out is deleted.

## Testing

Put `DAYTONA_API_KEY` in the repository's `.env`, which Git ignores and Bun loads. The suites
create real sandboxes, so they run only when asked:

```sh
AMENDS_TEST_DAYTONA=1 bun run test adapters/sandbox-daytona/test
```

Each test creates sandboxes labelled `amends: conformance` and deletes them and any snapshot it
took when it ends. Daytona stops any a failed run leaves after 15 minutes and deletes them an hour
later; a snapshot left while it was still being taken needs deleting by hand. A run takes from under
a minute to several, most of it waiting for snapshots; a test may take up to fifteen.
