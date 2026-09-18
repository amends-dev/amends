import { join } from "node:path";

/** One lifetime of the real server entry point over a database, on an ephemeral port. */
export const withServer = async <A>(
  filename: string,
  run: (call: Call) => Promise<A>,
): Promise<A> => {
  const child = Bun.spawn([process.execPath, "hosts/local/src/index.ts"], {
    cwd: join(import.meta.dir, "../../.."),
    env: { ...process.env, AMENDS_DATABASE: filename, AMENDS_PORT: "0" },
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    // The server announces its ephemeral port once it listens.
    const reader = child.stdout.getReader();
    let output = "";
    let base: string | undefined;
    while (base === undefined) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(`The server exited before listening: ${output}`);
      output += new TextDecoder().decode(chunk.value);
      base = /Listening on (http:\/\/[^\s]+)/.exec(output)?.[1];
    }
    // Keep draining so the child never blocks on a full pipe.
    void (async () => {
      while (!(await reader.read()).done) {
        /* discard */
      }
    })();
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
    return await run(call);
  } finally {
    child.kill();
    await child.exited;
  }
};

export type Call = (
  token: string,
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: unknown }>;
