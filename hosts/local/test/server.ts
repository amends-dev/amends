import { fileURLToPath } from "node:url";

interface Options {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly command?: ReadonlyArray<string>;
  readonly startupTimeoutMs?: number;
}

/** One lifetime of the real server entry point over a PostgreSQL database, on an ephemeral port. */
export const withServer = async <A>(
  databaseUrl: string,
  run: (call: Call, base: string) => Promise<A>,
  options: Options = {},
): Promise<A> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...options.env,
    AMENDS_DATABASE_URL: databaseUrl,
    AMENDS_PORT: "0",
  };
  const child = Bun.spawn(
    [...(options.command ?? [process.execPath, "--no-env-file", "hosts/local/src/index.ts"])],
    {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const ready = Promise.withResolvers<string>();
  let output = "";
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let tail = "";
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        const text = decoder.decode(chunk.value, { stream: true });
        output = (output + text).slice(-16_384);
        tail = (tail + text).slice(-16_384);
        const base = /Listening on (http:\/\/[^\s]+)(?=\s)/.exec(tail)?.[1];
        if (base !== undefined) ready.resolve(base);
      }
    } finally {
      reader.releaseLock();
    }
  };
  const drains = [drain(child.stdout), drain(child.stderr)];
  for (const draining of drains) void draining.catch(ready.reject);
  const timeout = setTimeout(() => {
    ready.reject(new Error(`Timed out waiting for the server to listen: ${output}`));
  }, options.startupTimeoutMs ?? 10_000);
  try {
    const base = await Promise.race([
      ready.promise,
      child.exited.then(async (code) => {
        await Promise.allSettled(drains);
        throw new Error(`The server exited before listening (exit ${code}): ${output}`);
      }),
    ]);
    clearTimeout(timeout);
    const call: Call = async (token, method, path, body) => {
      const headers = new Headers({ authorization: `Bearer ${token}` });
      const request: RequestInit = { method, headers };
      if (body !== undefined) {
        headers.set("content-type", "application/json");
        request.body = JSON.stringify(body);
      }
      const response = await fetch(`${base}${path}`, request);
      const text = await response.text();
      return { status: response.status, body: text === "" ? undefined : JSON.parse(text) };
    };
    return await run(call, base);
  } finally {
    clearTimeout(timeout);
    child.kill();
    const forceStop = setTimeout(() => child.kill("SIGKILL"), 1_000);
    try {
      await child.exited;
      await Promise.allSettled(drains);
    } finally {
      clearTimeout(forceStop);
    }
  }
};

export type Call = (
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>;
