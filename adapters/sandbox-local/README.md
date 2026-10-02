# Local sandbox

`@amends/sandbox-local` implements the [sandbox contract](../../packages/sandbox/README.md) with
directories on this machine. It is the reference provider for tests and development, as
`storage-memory` is for storage: it runs every conformance suite and needs no account.

**It isolates nothing.** Commands run as the host's user, and can reach its files, processes, and
network; `capabilities.isolated` is `false`. Do not run untrusted work in it.

`LocalSandbox.make({ root })` needs Effect's `FileSystem`, `Path`, `ChildProcessSpawner`, and
`Crypto` services, such as `BunServices.layer`, and a scope. Under `root` it keeps:

- `sandboxes/<id>/`, each sandbox's working directory, `sandboxes/<id>.tmp/`, its temporary
  directory, which its commands get as `TMPDIR`, and `sandboxes/<id>.json`, the environment it was
  acquired with;
- `snapshots/<id>/`, each snapshot as a copy of a working directory.

`LocalSandbox.declaration` is what a host registers: a provider without an account or template.

Acquiring an ID whose directory exists retains it. Background processes belong to the provider
that started them: stopping the sandbox or closing the provider's scope ends them, and a restarted
host cannot reach processes an earlier one left running. Exposed ports are
`http://127.0.0.1:<port>` with no headers, so two sandboxes cannot listen on the same port.

## Testing

```sh
bun run test adapters/sandbox-local/test
```

The harness gives each test a temporary root that is removed afterwards, and a random port.
