/** One server-sent event stream a test writes to and ends, as the change feed answers. */
export function eventStream(request: Request) {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start: (value) => {
      controller = value;
    },
  });
  request.signal.addEventListener("abort", () => {
    try {
      controller.error(request.signal.reason);
    } catch {
      /* Already ended. */
    }
  });
  const write = (event: string, data: unknown) =>
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
  return {
    request,
    response: new Response(body, { headers: { "content-type": "text/event-stream" } }),
    send: (message: unknown) => write("message", message),
    unavailable: () => {
      write("effect/httpapi/stream/failure", [
        { _tag: "Fail", error: { _tag: "ChangeFeed.Unavailable" } },
      ]);
      controller.close();
    },
    close: () => controller.close(),
  };
}
