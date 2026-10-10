---
title: Self-host amends
description: Run the amends host and web app on your own machine.
---

amends runs as a host, which serves its HTTP API on [Bun](https://bun.com) and keeps workspaces in
PostgreSQL, and the web app, which talks to it. amends is in early development, and this is how it
runs today: on your machine.

:::caution
The host's sign-in is for development only: it trusts whoever asks. Do not expose it beyond your
machine.
:::

## Run it

You need Bun 1.3 and PostgreSQL. Clone the repository, and from its root:

```sh
bun install
createdb amends
AMENDS_DATABASE_URL=postgresql://localhost/amends bun run start
```

The host listens on `http://127.0.0.1:8787` and creates its tables when it starts. In another
terminal, start the web app and open `http://127.0.0.1:4321/`:

```sh
bun run --filter @amends-dev/web dev
```

Sign in with an email address: the host prints the one-time code in its terminal.

## Connect models and sandboxes

To connect model providers, sandboxes, and the other integrations, also set
`AMENDS_CREDENTIAL_KEY`, which seals their credentials. The
[local host guide](https://github.com/amends-dev/amends/blob/main/hosts/local/README.md#run)
lists every setting. The [desktop app](https://github.com/amends-dev/amends/blob/main/apps/desktop/README.md#run-and-verify)
needs Rust and Tauri's prerequisites too.

## amends Cloud

A hosted amends, run by the team that builds it, is coming. Until then, self-hosting is how to run
amends.
