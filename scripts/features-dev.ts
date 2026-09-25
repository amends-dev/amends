import { fileURLToPath } from "node:url";
import { startWorkshop } from "./testing/features-server.ts";

const workshop = await startWorkshop();
const storybook = Bun.spawn(
  [
    process.execPath,
    "run",
    "--bun",
    "storybook",
    "dev",
    "--host",
    "127.0.0.1",
    "--port",
    "6008",
    "--no-open",
    "--disable-telemetry",
  ],
  {
    cwd: fileURLToPath(new URL("../apps/features", import.meta.url)),
    env: { ...process.env, AMENDS_WORKSHOP_URL: workshop.base },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  },
);
const stopped = Promise.withResolvers<void>();
const stop = () => stopped.resolve();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
try {
  await Promise.race([stopped.promise, storybook.exited, workshop.exited]);
} finally {
  storybook.kill("SIGTERM");
  const force = setTimeout(() => storybook.kill("SIGKILL"), 1000);
  try {
    await storybook.exited;
  } finally {
    clearTimeout(force);
  }
  await workshop.stop();
}
