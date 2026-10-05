# Daytona sandbox provider

A provider for the [v2 sandbox contract](../../packages/sandbox-v2) that creates each sandbox in
Daytona's cloud, a Linux machine of its own. It reaches Daytona through Daytona's SDK,
`@daytona/sdk` 0.220.0, with the API key of the organization the sandboxes belong to.

## Running it

`DaytonaSandboxProvider.layer(options)` provides the `SandboxProvider`, and `make(options)` makes
one in a scope; both need `Crypto`. The SDK's client keeps a connection open, so it closes with
the provider's scope. The options are:

- `apiKey`, the organization's API key, redacted.
- `apiUrl`, Daytona's API when it is not that of Daytona's own cloud.
- `target`, the region to create sandboxes in, rather than the organization's.
- `snapshot`, the snapshot sandboxes start from, rather than Daytona's default.
- `autoStopInterval`, the minutes without requests to Daytona's API after which Daytona stops a
  sandbox. It is 0 by default, which never stops one: requests to a sandbox's ports do not count,
  so a sandbox would otherwise stop under an agent that only serves a host through a port.

The code that runs in a sandbox needs `sh` and the GNU coreutils and findutils, as Daytona's own
image has.

## Sandboxes

Daytona names each sandbox by its id, which `create` picks as a UUID when it is given none; an id
in use fails with `AlreadyExistsError`. The sandbox's ports are kept in its `amends-ports` label,
for `resume` to read. A create that fails, or is interrupted, deletes the sandbox it made.

`resume` starts a stopped sandbox, and fails with `NotFoundError` for one Daytona has destroyed or
is destroying. `stop` and `destroy` succeed for a sandbox already stopped or destroyed, including
one another call is stopping or destroying. Daytona refuses a change to a sandbox while another
change to it is in progress, so the provider tries such a change again for up to 30 seconds.

The working directory is the one Daytona gives the sandbox, `/home/daytona` on Daytona's image,
where commands start and relative paths resolve.

## Processes

Each process runs in a Daytona session of its own, a shell Daytona keeps for the commands sent to
it, and deleting the session ends the process and its children. When the scope that spawned a
process closes, its session is deleted, unless its handle was unreferenced; the process then runs
until the sandbox stops. A session runs the user's shell, zsh on Daytona's image, so each command
runs as a line of `sh`, which honours the command's directory, environment, `shell` option, ignored
streams, and pipes. Daytona keeps every command line in its record of the session, so a command's
environment goes in a script of its own, written through Daytona's file API, which deletes itself
and runs the command with it; the line names only the script.

A process writes its output to files of its own under `/tmp`, which its handle reads as they grow,
up to a megabyte at a time, byte for byte. Daytona's own record of a session's output keeps whole
lines, and ends a last line that has no newline with one. Daytona takes a process's input a line at
a time and never ends it, so a command that reads its input to the end waits forever.

The handle polls Daytona, a request at a time. Reading an output asks for what is new, and again
at once when it found some. A read that found nothing also asks for the process's status, and the
next comes 50 milliseconds later, then twice as long after each such read, up to a second.
Awaiting the exit code asks for the status, quickly at first, then once a second. So a process
idle for a while, whose exit code is awaited and whose two outputs are read, makes about five
requests a second; one whose outputs are ignored and whose exit code nobody awaits makes none.

Daytona gives no process ids, so a handle's `pid` numbers the process among those its sandbox's
spawner started, from 1, and again from 1 in a sandbox resumed again; it is not the process's id in
the sandbox. `kill` deletes the process's session, which sends SIGTERM to the process and its
children and then SIGKILL, whatever signal it is asked for.

## Files

A file's contents are read and written whole through Daytona's file API, so a read holds the whole
file in the host's memory, whatever its size, and `open`, which `stream` and `sink` use, fails with
`BadArgument`. Everything else is done with the sandbox's own tools, one `sh` command each, which
Daytona answers at once: `stat`, `find`, `mkdir`, `rm`, `mv`, `cp`, `ln`, `mktemp`, and the like. They run with `LC_ALL=C`, and a
failure is the error the tool's message names, as Effect's own file systems name an `errno`.
Writing a file checks first that its directory exists, and that the file does not when the flag
asks so, since Daytona's file API would make the one and write over the other.

## Ports and the network

A port's endpoint is Daytona's preview URL for it, which takes the sandbox's preview token in the
`x-daytona-preview-token` header that the endpoint gives, and passes the request's other headers,
`Authorization` included, on to the server. WebSockets work through it too. A server reaches it
only when it listens on every interface.

`DenyAll` blocks everything the sandbox sends. An `AllowList` names hosts or CIDR ranges, but not
both, and denies none, as Daytona does; one Daytona cannot enforce fails with `UnsupportedError`,
and one that allows nothing blocks everything. Daytona filters hosts through its proxy and DNS.
Each policy replaces the one before, and Daytona applies it a moment after it answers.

A sandbox created with a policy starts under it, as Daytona applies the policy before it starts
the sandbox. One its template prepares on its own, before the template's snapshot is made, gets the
policy once prepared, a moment after.

## Templates and snapshots

Each version of a template, its name and identity, is made once into a Daytona snapshot that later
sandboxes made from it start from, named `amends-template-<name>-<digest>`; the digest is of the
template's identity and the snapshot sandboxes start from. Daytona takes from seconds to several
minutes to make a snapshot, and sometimes fails, so no create waits for one: until a version's
snapshot is active, each create prepares its own sandbox, and the first to find none has it made
in the background, in the provider's scope.

A version is made in a sandbox named as its snapshot, labelled `amends-template`, and the name
claims it: a create that finds the name taken, on this host or another, leaves the snapshot to the
create that took it. That sandbox lives 30 minutes at most, so the claim of a host that stopped
while making the snapshot lapses. A snapshot Daytona deactivated is activated again, and one it
failed to make is deleted, for a later create to make again. Once a create has made a version's
snapshot, it deletes those of the template's other versions that no sandbox has started from for a
day, so a version that hosts still start sandboxes from, as while they are upgraded one by one,
stays.

## Testing

`test/snapshots.test.ts` runs everywhere: what to do about a snapshot in each state, which other
versions to delete, and how versions are named. The rest create real sandboxes and cost money, so
they run only with `AMENDS_TEST_DAYTONA=1` and `DAYTONA_API_KEY`. `test/conformance.test.ts` runs
the suites `@amends/sandbox-v2/conformance` exports, and deletes the snapshots of their templates
when it ends. `test/daytona.test.ts` checks what the provider asks of Daytona: that sandboxes do
not stop on their own, that one snapshot is made of a version that several hosts create sandboxes
from at once, that a failing template leaves neither its sandbox nor a snapshot, the network
policies Daytona enforces and those it cannot, when a sandbox created with one is under it, that a
command's environment stays out of Daytona's record of its session, and destroying a sandbox from
several callers at once. It deletes, when it ends, what its templates
left being made in the background. [Testing](../../docs/testing.md) says how to run them.
