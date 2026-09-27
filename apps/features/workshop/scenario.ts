export interface Snapshot {
  readonly delivered: ReadonlyArray<{ email: string; code: string }>;
  readonly requests: number;
  readonly completed: number;
  readonly cancelled: number;
  readonly held: boolean;
}
export type Command =
  | "expire"
  | "hold"
  | "fail"
  | "release"
  | "fail-directory"
  | "lose-creation-response"
  | "lose-invitation-response"
  | "drop-changes"
  | "break-directory"
  | "restore-directory";

const live = new Set<() => Promise<void>>();
const closing = new Set<Promise<void>>();
const json = async <A>(url: string, init?: RequestInit): Promise<A> => {
  const response = await fetch(url, init);
  if (!response.ok)
    throw new Error(
      `Workshop request failed (${response.status}). Start bun run --filter @amends/features dev.`,
    );
  return response.json();
};

/** Browser-only fixture client. The host owns all scenario behavior and storage. */
export async function openScenario(base = window.location.origin) {
  const { path } = await json<{ path: string }>(`${base}/__workshop/scenarios`, { method: "POST" });
  const url = `${base}${path}`;
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    if (disposal) return disposal;
    live.delete(dispose);
    disposal = fetch(url, { method: "DELETE", keepalive: true }).then((response) => {
      if (!response.ok && response.status !== 404) throw new Error("Workshop cleanup failed.");
    });
    closing.add(disposal);
    void disposal.finally(() => closing.delete(disposal!)).catch(() => {});
    return disposal;
  };
  live.add(dispose);
  return {
    url,
    apiBaseUrl: `${url}/api`,
    snapshot: () => json<Snapshot>(url),
    command: (command: Command) =>
      json<Snapshot>(`${url}/control`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(command),
      }),
    dispose,
  };
}
export type Scenario = Awaited<ReturnType<typeof openScenario>>;

/** Test teardown also awaits disposals already started by Solid owner cleanup. */
export async function closeScenarios() {
  await Promise.all([...live].map((dispose) => dispose()));
  await Promise.all(closing);
}

/** Call the scenario's host directly, as a fixture's setup does. */
export async function api(scenario: Scenario, path: string, token?: string, body?: unknown) {
  const response = await fetch(`${scenario.apiBaseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status})`);
  return response.status === 202 || response.status === 204 ? undefined : response.json();
}
