# Security policy

## Reporting a vulnerability

Report a vulnerability privately, through GitHub: on the repository's **Security** tab, choose
**Report a vulnerability**. Do not open a public issue or pull request for it.

Say what is affected, such as a package and its version or a commit of the app, how to reproduce
it, and what an attacker could do with it. We will confirm we received it, keep you told as we
investigate and fix it, and publish a security advisory once a fix is released, crediting you if
you would like.

## Supported versions

amends is in early development. Fixes go into `main` and the next release of each published
`@amends-dev` package; earlier releases do not receive them.

## Scope

Reports are welcome for the published `@amends-dev` packages and for the app: the host, the HTTP
API, workspace authorization, and the web and desktop apps.

Some behavior is by design, and is not a vulnerability:

- **The local host's logged emails and development sign-in.** The local host has no email provider
  yet, so it logs the sign-in codes it sends; whoever reads its log can sign in as anyone. With
  `AMENDS_SIGN_IN=development`, it trusts any bearer token as the person it names. It serves one
  machine, as the [local host guide](hosts/local/README.md) says.
- **Local sandboxes isolate nothing.** A sandbox from `@amends-dev/sandbox-local` is a directory on
  your machine, and its processes run as you, on your network.
- **Agents use their own tools without asking.** amends's agent reads, writes, edits, and runs
  commands in its sandbox unasked, and opencode runs with its default permissions; see
  [known limitations](docs/current-status.md).

A vulnerability in Effect or another dependency belongs with that project. Tell us too when it
affects amends in a way of its own.

## Running amends

- Keep `AMENDS_CREDENTIAL_KEY` secret. It seals the credentials of every connection a host stores.
- Give agents sandboxes that isolate them, such as Daytona's, when they run code you would not run
  on your own machine.
