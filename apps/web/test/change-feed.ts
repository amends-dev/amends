/** Controllable server-sent event streams for the workspace change feed in route tests. */
export interface FeedStream {
  readonly request: Request;
  readonly send: (message: unknown) => void;
  readonly unavailable: () => void;
}
const at = "2026-09-25T12:00:00.000Z";
export const ready = (workspaceId: string, cursor = "1", reset = false) => ({
  _tag: "Ready",
  workspaceId,
  cursor,
  reset,
});
export const committed = (
  workspaceId: string,
  cursor: string,
  events: ReadonlyArray<{ readonly name: string; readonly payload: unknown }>,
) => ({
  _tag: "Committed",
  workspaceId,
  cursor,
  commitId: `commit-${cursor}`,
  events: events.map((event, index) => ({
    id: `entry-${cursor}-${index}`,
    version: 1,
    recordedAt: at,
    provenance: {
      workspaceId,
      performedBy: { _tag: "System", id: "test" },
      causedBy: null,
      correlationId: "correlation",
      occurredAt: at,
    },
    ...event,
  })),
  notifications: [],
});

/** The workspace sidebar's reads of the reader's groups and the members naming them. */
const sidebar = /^\/workspaces\/[^/]+\/(groups|members)$/;
/**
 * Route change-feed requests to streams the test controls, answer the workspace sidebar's reads
 * with empty lists, and send everything else to `fetch`. Each stream opens with Ready, without a
 * reset, unless `open` answers the request itself.
 */
export function withChangeFeed(
  fetch: typeof globalThis.fetch,
  open: (request: Request) => Response | undefined = () => undefined,
) {
  const streams: Array<FeedStream> = [];
  const encoder = new TextEncoder();
  const route: typeof globalThis.fetch = (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && sidebar.test(path))
      return Promise.resolve(
        new Response("[]", { headers: { "content-type": "application/json" } }),
      );
    if (!path.endsWith("/changes")) return fetch(input, init);
    const answered = open(request);
    if (answered) return Promise.resolve(answered);
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start: (value) => {
        controller = value;
      },
    });
    const write = (event: string, data: unknown) => {
      try {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      } catch {
        /* The client already closed this stream. */
      }
    };
    request.signal.addEventListener("abort", () => {
      try {
        controller.error(request.signal.reason);
      } catch {
        /* Already ended. */
      }
    });
    const workspaceId = decodeURIComponent(path.split("/")[2] ?? "");
    write("message", ready(workspaceId));
    streams.push({
      request,
      send: (message) => write("message", message),
      unavailable: () => {
        write("effect/httpapi/stream/failure", [
          { _tag: "Fail", error: { _tag: "ChangeFeed.Unavailable" } },
        ]);
        try {
          controller.close();
        } catch {
          /* Already ended. */
        }
      },
    });
    return Promise.resolve(
      new Response(body, { headers: { "content-type": "text/event-stream" } }),
    );
  };
  return { fetch: route, streams };
}
