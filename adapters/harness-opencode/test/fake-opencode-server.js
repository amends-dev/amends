// A stand-in for `opencode serve`, which `server.test.ts` installs as the command that runs
// opencode. It starts as opencode does, with `serve --hostname=… --port=…` and the server's password
// and configuration in its environment, answers opencode's health check behind the password, and
// adds a line to `starts.jsonl` in its working directory for each start. Given
// `FAKE_OPENCODE_EXIT`, it exits with that code before it listens, as a server that fails does.
import { appendFileSync } from "node:fs";

const argument = (name) =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

if (process.env.FAKE_OPENCODE_EXIT !== undefined) {
  process.exit(Number(process.env.FAKE_OPENCODE_EXIT));
}

appendFileSync(
  "starts.jsonl",
  `${JSON.stringify({
    args: process.argv.slice(2),
    config: JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? "null"),
    greeting: process.env.GREETING,
  })}\n`,
);

const authorization = `Basic ${btoa(`opencode:${process.env.OPENCODE_SERVER_PASSWORD}`)}`;

Bun.serve({
  hostname: argument("hostname"),
  port: Number(argument("port")),
  fetch: (request) => {
    if (request.headers.get("authorization") !== authorization) {
      return new Response(null, { status: 401 });
    }
    return new URL(request.url).pathname === "/api/health"
      ? Response.json({ healthy: true })
      : Response.json({ message: "Not found" }, { status: 404 });
  },
});
