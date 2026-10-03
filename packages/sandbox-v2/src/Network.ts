/**
 * What a sandbox exposes to the network and what it may reach: its ports and how to reach them,
 * the outbound network policy, and request transformations, which set headers on outbound
 * requests after they leave the sandbox so that credentials never enter it.
 */
import { Schema } from "effect";

export const Port = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 })).pipe(
  Schema.brand("Port"),
);

export type Port = typeof Port.Type;

/** The kind of connection an endpoint is for; its URL uses the secure scheme when the provider serves one. */
export const EndpointProtocol = Schema.Literals(["http", "ws"]);

export type EndpointProtocol = typeof EndpointProtocol.Type;

/** How to reach a sandbox port from outside: the URL, and any headers the provider requires. */
export const Endpoint = Schema.Struct({
  url: Schema.String,
  headers: Schema.Record(Schema.String, Schema.Redacted(Schema.String)),
});

export interface Endpoint extends Schema.Schema.Type<typeof Endpoint> {}

/**
 * Which outbound destinations the sandbox may reach. `AllowList` allows the listed hosts and
 * CIDR ranges, and `deniedCidrs` overrides both, for example to block a cloud metadata address
 * inside an allowed range.
 */
export const NetworkPolicy = Schema.TaggedUnion({
  AllowAll: {},
  DenyAll: {},
  AllowList: {
    allowedHosts: Schema.Array(Schema.String),
    allowedCidrs: Schema.Array(Schema.String),
    deniedCidrs: Schema.Array(Schema.String),
  },
});

export type NetworkPolicy = typeof NetworkPolicy.Type;

/**
 * Sets `setHeaders` on outbound HTTPS requests to `host` whose path starts with `pathPrefix` and
 * that carry every header in `matchHeaders` with exactly that value. The sandbox holds only a
 * placeholder credential, matched here, and the real value is set outside it.
 */
export const RequestTransformation = Schema.Struct({
  host: Schema.String,
  pathPrefix: Schema.optionalKey(Schema.String),
  matchHeaders: Schema.Record(Schema.String, Schema.String),
  setHeaders: Schema.Record(Schema.String, Schema.Redacted(Schema.String)),
});

export interface RequestTransformation extends Schema.Schema.Type<typeof RequestTransformation> {}
