/**
 * Report the background work of the database at AMENDS_DATABASE_URL: per process, the wakes due,
 * scheduled, and retrying, and those dropped; then the latest retries and drops. Run it with
 * `bun run --filter @amends/host-local status`, or `bun hosts/local/src/status.ts --json` for
 * machine-readable output without the workspace runner's line prefixes.
 */
import { PostgresClusterStorage, PostgresDatabase } from "@amends/storage-postgresql";
import { BunRuntime } from "@effect/platform-bun";
import { ConfigProvider, Console, DateTime, Effect, Option } from "effect";
import { LocalConfig } from "./config.ts";

const iso = (at: DateTime.Utc) => DateTime.formatIso(at);

/** The status as plain JSON values. */
export const toJson = (status: PostgresClusterStorage.Status) => ({
  processes: status.processes.map((process) =>
    Object.assign({}, process, { oldestDue: Option.getOrNull(Option.map(process.oldestDue, iso)) }),
  ),
  retries: status.retries.map((retry) => Object.assign({}, retry, { at: iso(retry.at) })),
  drops: status.drops.map((drop) => Object.assign({}, drop, { at: iso(drop.at) })),
});

/** The status as a terminal table with the latest retries and drops beneath it. */
export const render = (status: PostgresClusterStorage.Status): string => {
  if (status.processes.length === 0) return "No background work is waiting, retrying, or dropped.";
  const header = ["PROCESS", "DUE", "SCHEDULED", "RETRYING", "DROPPED", "OLDEST DUE"];
  const rows = status.processes.map((process) => [
    process.process,
    String(process.due),
    String(process.scheduled),
    String(process.retrying),
    String(process.dropped),
    Option.match(process.oldestDue, { onNone: () => "-", onSome: iso }),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  // Names read left to right; counts line up on the right.
  const line = (cells: ReadonlyArray<string>) =>
    cells
      .map((cell, column) =>
        column === 0 || column === 5
          ? cell.padEnd(widths[column] ?? 0)
          : cell.padStart(widths[column] ?? 0),
      )
      .join("  ")
      .trimEnd();
  const sections = [[line(header), ...rows.map(line)].join("\n")];
  if (status.retries.length > 0)
    sections.push(
      [
        "Retrying",
        ...status.retries.map(
          (retry) =>
            `  ${retry.process} in ${retry.workspaceId}: attempt ${retry.attempt}, next at ${iso(retry.at)}`,
        ),
      ].join("\n"),
    );
  if (status.drops.length > 0)
    sections.push(
      [
        "Dropped",
        ...status.drops.map(
          (drop) =>
            `  ${drop.process} in ${drop.workspaceId}: ${drop.reason} after ${drop.attempt} retries, due ${iso(drop.at)}`,
        ),
      ].join("\n"),
    );
  return sections.join("\n\n");
};

const program = Effect.gen(function* () {
  const { databaseUrl } = yield* LocalConfig.load();
  const status = yield* PostgresClusterStorage.backgroundStatus().pipe(
    Effect.provide(PostgresDatabase.layer({ url: databaseUrl, maxConnections: 2 })),
  );
  yield* Console.log(
    process.argv.includes("--json") ? JSON.stringify(toJson(status), null, 2) : render(status),
  );
});

if (import.meta.main)
  BunRuntime.runMain(
    program.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnv({ preserveEmptyStrings: true }),
      ),
    ),
  );

export * as LocalStatus from "./status.ts";
