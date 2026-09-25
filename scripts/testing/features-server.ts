import { fileURLToPath } from "node:url";

/** A development-only host, with its own temporary cluster/databases and no .env loading. */
export async function startWorkshop() {
  const env = { ...process.env };
  delete env.AMENDS_DATABASE_URL;
  delete env.AMENDS_PORT;
  const child = Bun.spawn([process.execPath, "--no-env-file", "hosts/local/workshop/index.ts"], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const ready = Promise.withResolvers<string>();
  let output = "";
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        output = (output + decoder.decode(chunk.value, { stream: true })).slice(-16_384);
        const base = /Workshop listening on (http:\/\/[^\s]+)(?=\s)/.exec(output)?.[1];
        if (base) ready.resolve(base);
      }
    } finally {
      reader.releaseLock();
    }
  };
  const drains = [drain(child.stdout), drain(child.stderr)];
  for (const promise of drains) void promise.catch(ready.reject);
  const timeout = setTimeout(
    () => ready.reject(new Error(`Workshop startup timed out: ${output}`)),
    20000,
  );
  let stopped: Promise<void> | undefined;
  const stop = () =>
    (stopped ??= (async () => {
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 10000);
      try {
        await child.exited;
        await Promise.allSettled(drains);
      } finally {
        clearTimeout(force);
      }
    })());
  try {
    const base = await Promise.race([
      ready.promise,
      child.exited.then(async (code) => {
        await Promise.allSettled(drains);
        throw new Error(`Workshop exited (${code}): ${output}`);
      }),
    ]);
    return { base, stop, exited: child.exited };
  } catch (error) {
    await stop();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
