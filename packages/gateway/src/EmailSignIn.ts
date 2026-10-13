/**
 * Sign-in with codes sent by email, and the sessions it begins, over the host's storage, accounts,
 * and email provider. Codes and session tokens are never stored: codes as digests under the host's
 * code key, tokens as SHA-256 digests. Limits on codes per address hold across every host over the
 * storage; the limit on codes per client holds within one process.
 *
 * @since 0.1.0
 */
import { Identity } from "@amends-dev/core/identity";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Accounts from "./Accounts.ts";
import * as EmailSender from "./EmailSender.ts";
import * as SessionTokens from "./SessionTokens.ts";
import * as SignIn from "./SignIn.ts";
import * as SignInStorage from "./SignInStorage.ts";

/**
 * How long codes and sessions last, and how many codes may be sent.
 *
 * @category options
 * @since 0.1.0
 */
export interface Policy {
  /** How long a code works once sent. */
  readonly codeLifetime: Duration.Duration;
  /** Wrong codes after which a pending code stops working. */
  readonly maximumFailedAttempts: number;
  /** The shortest wait before another code to the same address. */
  readonly resendAfter: Duration.Duration;
  /** The window that codes are counted in, for an address and for a client. */
  readonly sendWindow: Duration.Duration;
  /** Codes one address may be sent in a window. */
  readonly sendsPerAddress: number;
  /** Codes one client may ask for in a window, whatever the addresses. */
  readonly sendsPerClient: number;
  /** How long a session lasts unused. */
  readonly sessionIdle: Duration.Duration;
  /** How long a session lasts at most, however much it is used. */
  readonly sessionMaximum: Duration.Duration;
  /** How often using a session moves its end. */
  readonly sessionRenewal: Duration.Duration;
}

/**
 * The policy where `Options.policy` sets nothing: a code works once, within ten minutes, and five
 * wrong tries void it; an address is sent a code at most every thirty seconds and five in an hour,
 * and a client may ask for twenty in an hour; a session ends after thirty days unused and ninety
 * at most, and using it moves its end at most once a day.
 *
 * @category options
 * @since 0.1.0
 */
export const defaultPolicy: Policy = {
  codeLifetime: Duration.minutes(10),
  maximumFailedAttempts: 5,
  resendAfter: Duration.seconds(30),
  sendWindow: Duration.hours(1),
  sendsPerAddress: 5,
  sendsPerClient: 20,
  sessionIdle: Duration.days(30),
  sessionMaximum: Duration.days(90),
  sessionRenewal: Duration.days(1),
};

/**
 * What `make` and `layer` take: the secret every host over the storage shares, and how the policy
 * differs from `defaultPolicy`.
 *
 * @category options
 * @since 0.1.0
 */
export interface Options {
  /** The secret code digests are made with, so that stored digests do not reveal codes. */
  readonly codeKey: Redacted.Redacted<Uint8Array>;
  /** The parts of `defaultPolicy` this host changes. */
  readonly policy?: Partial<Policy> | undefined;
}

/**
 * The ways email sign-in offers: email codes alone, since identity providers come with their own
 * sign-in.
 *
 * @category utils
 * @since 0.1.0
 */
export const methods: SignIn.Methods = { emailCode: true, providers: [] };

/**
 * Whether the address may be sent another code now, and its pending code once it is: not within
 * `resendAfter` of the last, nor past `sendsPerAddress` in the window. `start` applies it through
 * `SignInStorage.modifyCode`.
 *
 * @category utils
 * @since 0.1.0
 */
export const decideSend = (
  current: Option.Option<SignInStorage.PendingCode>,
  now: DateTime.Utc,
  digest: string,
  policy: Policy,
): readonly [boolean, Option.Option<SignInStorage.PendingCode>] => {
  const pending = Option.getOrUndefined(current);
  if (
    pending !== undefined &&
    DateTime.isLessThan(now, DateTime.addDuration(pending.sentAt, policy.resendAfter))
  )
    return [false, current];
  const windowOpen =
    pending !== undefined &&
    DateTime.isLessThan(now, DateTime.addDuration(pending.windowStartedAt, policy.sendWindow));
  if (windowOpen && pending.sendsInWindow >= policy.sendsPerAddress) return [false, current];
  return [
    true,
    Option.some({
      digest,
      expiresAt: DateTime.addDuration(now, policy.codeLifetime),
      failedAttempts: 0,
      sentAt: now,
      windowStartedAt: windowOpen ? pending.windowStartedAt : now,
      sendsInWindow: windowOpen ? pending.sendsInWindow + 1 : 1,
    }),
  ];
};

/**
 * The address's pending code once a send of the code with `digest` failed: as it was before that
 * send, unless another send has replaced it since.
 *
 * @category utils
 * @since 0.1.0
 */
export const withdrawUnsent = (
  current: Option.Option<SignInStorage.PendingCode>,
  digest: string,
  previous: Option.Option<SignInStorage.PendingCode>,
): Option.Option<SignInStorage.PendingCode> =>
  Option.exists(current, (pending) => pending.digest === digest) ? previous : current;

/**
 * What a code entered for the address comes to: accepted, which removes the pending code, or the
 * reason it is not. A wrong code counts against the pending code, which stops working at
 * `maximumFailedAttempts` but stays, so the address's sends are still counted. `complete` applies
 * it through `SignInStorage.modifyCode`.
 *
 * @category utils
 * @since 0.1.0
 */
export const decideRedeem = (
  current: Option.Option<SignInStorage.PendingCode>,
  now: DateTime.Utc,
  digest: string,
  policy: Policy,
): readonly [SignIn.Rejected["reason"] | "accepted", Option.Option<SignInStorage.PendingCode>] => {
  const pending = Option.getOrUndefined(current);
  if (pending === undefined) return ["unknown", current];
  if (!DateTime.isLessThan(now, pending.expiresAt)) return ["expired", current];
  if (equalInConstantTime(pending.digest, digest)) return ["accepted", Option.none()];
  const failedAttempts = pending.failedAttempts + 1;
  return [
    "mismatch",
    Option.some({
      ...pending,
      failedAttempts,
      expiresAt: failedAttempts >= policy.maximumFailedAttempts ? now : pending.expiresAt,
    }),
  ];
};

/**
 * When using a session now moves its end to, if it does: `sessionIdle` from now, never past
 * `sessionMaximum` from its start, and at most once each `sessionRenewal`. Resolving a token
 * applies it.
 *
 * @category utils
 * @since 0.1.0
 */
export const renewalOf = (
  session: SignInStorage.Session,
  now: DateTime.Utc,
  policy: Policy,
): Option.Option<DateTime.Utc> => {
  const next = DateTime.min(
    DateTime.addDuration(now, policy.sessionIdle),
    DateTime.addDuration(session.createdAt, policy.sessionMaximum),
  );
  const renewedLately = DateTime.isLessThan(
    next,
    DateTime.addDuration(session.expiresAt, policy.sessionRenewal),
  );
  return renewedLately ? Option.none() : Option.some(next);
};

/** Compare two digests without the time taken saying where they first differ. */
const equalInConstantTime = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++)
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

// Every runtime a host runs on has the WHATWG `TextEncoder`, which no type this package includes
// declares.
declare const TextEncoder: new () => { readonly encode: (text: string) => Uint8Array };
const encoder = new TextEncoder();

/** HMAC-SHA256 (RFC 2104) over the platform's SHA-256. */
const hmacSha256 = Effect.fnUntraced(function* (
  crypto: Crypto.Crypto,
  key: Uint8Array,
  message: Uint8Array,
) {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? yield* crypto.digest("SHA-256", key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let index = 0; index < 64; index++) {
    inner[index] = block[index]! ^ 0x36;
    outer[index] = block[index]! ^ 0x5c;
  }
  inner.set(message, 64);
  outer.set(yield* crypto.digest("SHA-256", inner), 64);
  return yield* crypto.digest("SHA-256", outer);
});

/**
 * Construct email sign-in and its session tokens: `SignIn.SignIn` and `SessionTokens.SessionTokens`
 * over the host's sign-in storage, accounts, email sender, and cryptography. Each call counts the
 * codes clients ask for afresh, within this process.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("EmailSignIn.make")(function* (options: Options) {
  const policy: Policy = { ...defaultPolicy, ...options.policy };
  const signInStorage = yield* SignInStorage.SignInStorage;
  const accounts = yield* Accounts.Accounts;
  const emailSender = yield* EmailSender.EmailSender;
  const crypto = yield* Crypto.Crypto;
  const codeKey = Redacted.value(options.codeKey);
  const codeMinutes = Math.ceil(Duration.toMinutes(policy.codeLifetime));

  const digestCode = (email: Accounts.Email, code: SignIn.Code) =>
    hmacSha256(crypto, codeKey, encoder.encode(`${email}\n${code}`)).pipe(
      Effect.map(Base64Url.encode),
      Effect.orDie,
    );
  const digestToken = (token: string) =>
    crypto
      .digest("SHA-256", encoder.encode(token))
      .pipe(Effect.map(Base64Url.encode), Effect.orDie);

  // Each client's sends in its current window, oldest first, for this process alone.
  const clients = new Map<string, { readonly windowStartedAt: DateTime.Utc; sends: number }>();
  const admitClient = (remoteAddress: string | undefined, now: DateTime.Utc) => {
    if (remoteAddress === undefined) return true;
    const entry = clients.get(remoteAddress);
    if (
      entry !== undefined &&
      DateTime.isLessThan(now, DateTime.addDuration(entry.windowStartedAt, policy.sendWindow))
    ) {
      if (entry.sends >= policy.sendsPerClient) return false;
      entry.sends++;
      return true;
    }
    clients.delete(remoteAddress);
    clients.set(remoteAddress, { windowStartedAt: now, sends: 1 });
    // Forget the longest-tracked client once ten thousand are tracked.
    if (clients.size > 10_000) clients.delete(clients.keys().next().value!);
    return true;
  };

  const start: SignIn.SignIn["Service"]["start"] = Effect.fn("EmailSignIn.start")(
    function* (email, remoteAddress) {
      const now = yield* DateTime.now;
      if (!admitClient(remoteAddress, now)) return yield* new SignIn.Limited();
      const code = String(
        yield* crypto.randomIntBetween(0, 1_000_000, { halfOpen: true }),
      ).padStart(6, "0");
      const digest = yield* digestCode(email, SignIn.Code.make(code));
      const { sending, previous } = yield* signInStorage.modifyCode(email, (current) => {
        const [sending, next] = decideSend(current, now, digest, policy);
        return [{ sending, previous: current }, next] as const;
      });
      if (!sending) return yield* new SignIn.Limited();
      // A code that was not sent neither counts against the address nor replaces the one it had.
      const withdraw = signInStorage.modifyCode(email, (current) => [
        undefined,
        withdrawUnsent(current, digest, previous),
      ]);
      yield* emailSender
        .send({
          to: email,
          subject: "Your sign-in code",
          text: Redacted.make(
            `Your sign-in code is ${code}. It works once, within ${codeMinutes} minutes.\n\n` +
              "If you didn't ask to sign in, you can ignore this email.",
          ),
        })
        .pipe(Effect.catch(() => Effect.andThen(withdraw, Effect.fail(new SignIn.Unavailable()))));
    },
  );

  const complete: SignIn.SignIn["Service"]["complete"] = Effect.fn("EmailSignIn.complete")(
    function* (email, code) {
      const now = yield* DateTime.now;
      const digest = yield* digestCode(email, code);
      const outcome = yield* signInStorage.modifyCode(email, (current) =>
        decideRedeem(current, now, digest, policy),
      );
      if (outcome !== "accepted") return yield* new SignIn.Rejected({ reason: outcome });
      const account = yield* accounts.findOrCreate(email);
      const token = Base64Url.encode(yield* Effect.orDie(crypto.randomBytes(32)));
      yield* signInStorage.insertSession(yield* digestToken(token), {
        humanId: account.id,
        createdAt: now,
        expiresAt: DateTime.min(
          DateTime.addDuration(now, policy.sessionIdle),
          DateTime.addDuration(now, policy.sessionMaximum),
        ),
      });
      return { token, account };
    },
  );

  const resolve: SessionTokens.SessionTokens["Service"]["resolve"] = Effect.fn(
    "EmailSignIn.resolve",
  )(function* (token) {
    const digest = yield* digestToken(Redacted.value(token));
    const found = yield* signInStorage.findSession(digest);
    if (Option.isNone(found)) return yield* new SessionTokens.Rejected({ reason: "unknown" });
    const session = found.value;
    const now = yield* DateTime.now;
    if (!DateTime.isLessThan(now, session.expiresAt)) {
      yield* signInStorage.deleteSession(digest);
      return yield* new SessionTokens.Rejected({ reason: "expired" });
    }
    const renewal = renewalOf(session, now, policy);
    if (Option.isSome(renewal)) yield* signInStorage.extendSession(digest, renewal.value);
    return Identity.Reference.cases.Human.make({ id: session.humanId });
  });

  const revoke: SessionTokens.SessionTokens["Service"]["revoke"] = Effect.fn("EmailSignIn.revoke")(
    function* (token) {
      yield* signInStorage.deleteSession(yield* digestToken(Redacted.value(token)));
    },
  );

  return {
    signIn: SignIn.SignIn.of({ methods, start, complete }),
    sessionTokens: SessionTokens.SessionTokens.of({ resolve, revoke }),
  };
});

/**
 * Provide `SignIn.SignIn` and `SessionTokens.SessionTokens` over the host's sign-in storage,
 * accounts, email sender, and cryptography.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = (options: Options) =>
  Layer.effectContext(
    Effect.map(make(options), ({ signIn, sessionTokens }) =>
      Context.make(SignIn.SignIn, signIn).pipe(
        Context.add(SessionTokens.SessionTokens, sessionTokens),
      ),
    ),
  );
