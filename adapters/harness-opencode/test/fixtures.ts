import { LocalSandboxProvider } from "@amends/sandbox-local-v2";
import { Network } from "@amends/sandbox-v2";
import { BunHttpServer } from "@effect/platform-bun";
import { Effect, FileSystem, Schema } from "effect";
import { SessionEvent } from "../src/SessionEvent.ts";

/**
 * A new sandbox on this machine exposing `port`, destroyed with the processes it runs, such as
 * opencode's server, when the scope closes.
 */
export const makeSandbox = (port: Network.Port) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const provider = yield* LocalSandboxProvider.make({
      directory: yield* fs.makeTempDirectoryScoped(),
    });
    const sandbox = yield* provider.create({ ports: [port] });
    yield* Effect.addFinalizer(() => Effect.ignore(sandbox.destroy));
    return sandbox;
  });

/** A port on this machine that nothing listens on, for a server the test starts on it. */
export const freePort = Effect.scoped(
  Effect.flatMap(BunHttpServer.make({ hostname: "127.0.0.1", port: 0 }), ({ address }) =>
    address._tag === "UnixPathAddress"
      ? Effect.die("The server listens on no port")
      : Effect.succeed(Network.Port.make(address.port)),
  ),
);

/**
 * Numbers events as opencode records them in the session `sessionID`, from `firstSeq`: the
 * returned function makes the session's next event of `type`, with `data` beside the fields every
 * event in a session has. Each event is decoded, so it has the shape opencode records.
 */
export const makeEvents = (sessionID: string, firstSeq = 1) => {
  let seq = firstSeq - 1;
  return (type: SessionEvent["type"], data: Record<string, unknown>): SessionEvent => {
    seq += 1;
    return Schema.decodeUnknownSync(SessionEvent)({
      id: `evt_${seq}`,
      durable: { aggregateID: sessionID, seq, version: type === "session.next.step.ended" ? 2 : 1 },
      type,
      data: { timestamp: 1_791_073_617_000 + seq, sessionID, ...data },
    });
  };
};

/** The tokens of a step that used `input` and `output` tokens, none of them cached or reasoning. */
export const tokens = (input: number, output: number) => ({
  input,
  output,
  reasoning: 0,
  cache: { read: 0, write: 0 },
});

/** A proxy on this machine, whose connections a test can drop. */
export interface Proxy {
  /** The port the proxy listens on. */
  readonly port: Network.Port;

  /** Closes every connection through the proxy, which takes new ones as before. */
  readonly drop: Effect.Effect<void>;
}

/** A proxy to `port` on this machine, stopped when the scope closes. */
export const makeProxy = (port: Network.Port) =>
  Effect.map(
    Effect.acquireRelease(
      Effect.sync(() => {
        /** A connection to the proxy, and the one it opened to `port` for it. */
        interface Pair {
          upstream: Bun.Socket<undefined> | undefined;
          /** What arrived before the upstream connection opened. */
          pending: Array<Uint8Array>;
        }
        const pairs = new Set<Bun.Socket<Pair>>();
        const listener = Bun.listen<Pair>({
          hostname: "127.0.0.1",
          port: 0,
          socket: {
            open: (client) => {
              const pair: Pair = { upstream: undefined, pending: [] };
              client.data = pair;
              pairs.add(client);
              // A port nothing listens on yet refuses the connection, which then closes.
              Bun.connect({
                hostname: "127.0.0.1",
                port,
                socket: {
                  open: (upstream) => {
                    pair.upstream = upstream;
                    for (const chunk of pair.pending) upstream.write(chunk);
                    pair.pending = [];
                  },
                  data: (_upstream, chunk) => void client.write(chunk),
                  close: () => void client.end(),
                  error: () => void client.end(),
                },
              }).catch(() => client.end());
            },
            data: (client, chunk) => {
              const { upstream, pending } = client.data;
              if (upstream === undefined) pending.push(chunk);
              else upstream.write(chunk);
            },
            close: (client) => {
              client.data.upstream?.end();
              pairs.delete(client);
            },
          },
        });
        const drop = Effect.sync(() => {
          for (const client of pairs) client.end();
        });
        return { listener, drop };
      }),
      ({ listener }) => Effect.sync(() => listener.stop(true)),
    ),
    ({ listener, drop }): Proxy => ({ port: Network.Port.make(listener.port), drop }),
  );
