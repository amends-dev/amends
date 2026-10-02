/**
 * Report the agent jobs of the database at AMENDS_DATABASE_URL: per kind of request, those due,
 * scheduled, and retrying; then the latest retries. Run it with
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
  requests: status.requests.map((request) =>
    Object.assign({}, request, { oldestDue: Option.getOrNull(Option.map(request.oldestDue, iso)) }),
  ),
  retries: status.retries.map((retry) => Object.assign({}, retry, { at: iso(retry.at) })),
});

/** The status as a terminal table with the latest retries beneath it. */
export const render = (status: PostgresClusterStorage.Status): string => {
  if (status.requests.length === 0) return "No agent job is waiting or retrying.";
  const header = ["REQUEST", "DUE", "SCHEDULED", "RETRYING", "OLDEST DUE"];
  const rows = status.requests.map((request) => [
    request.request,
    String(request.due),
    String(request.scheduled),
    String(request.retrying),
    Option.match(request.oldestDue, { onNone: () => "-", onSome: iso }),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  // Names read left to right; counts line up on the right.
  const line = (cells: ReadonlyArray<string>) =>
    cells
      .map((cell, column) =>
        column === 0 || column === 4
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
            `  ${retry.request} for ${retry.memberId} in ${retry.workspaceId}: attempt ${retry.attempt}, next at ${iso(retry.at)}`,
        ),
      ].join("\n"),
    );
  return sections.join("\n\n");
};

const program = Effect.gen(function* () {
  const { databaseUrl } = yield* LocalConfig.load();
  const status = yield* PostgresClusterStorage.agentJobStatus().pipe(
    // Reading the status leaves the schema as it is, whichever version applied it.
    Effect.provide(PostgresDatabase.layerClient({ url: databaseUrl, maxConnections: 2 })),
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
