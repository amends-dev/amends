import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, render, waitFor } from "@solidjs/testing-library";
import { Layer, Schema } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { createSignal, Show } from "solid-js";
import {
  ClientProvider,
  Session,
  useSignIn,
  type SessionStore,
  type SignInController,
} from "../src/index.ts";

afterEach(cleanup);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const accepted = () => new Response(null, { status: 202 });
const session = (token: string) => Schema.decodeSync(Session)({ token, identity: token });

function network() {
  const calls: Array<{
    request: Request;
    resolve: (response: Response) => void;
    reject: (error: Error) => void;
  }> = [];
  // Deliberately ignores abort: late completions must still be harmless.
  const fetch = vi.fn<typeof globalThis.fetch>((input, init) => {
    const deferred = Promise.withResolvers<Response>();
    calls.push({
      request: new Request(input, init),
      resolve: deferred.resolve,
      reject: deferred.reject,
    });
    return deferred.promise;
  });
  return {
    fetch,
    calls,
    at: (index: number) => {
      const call = calls[index];
      if (!call) throw new Error(`Missing HTTP call ${index}`);
      return call;
    },
  };
}
function mount(
  fetch: typeof globalThis.fetch,
  options: { initial?: Session; instances?: number } = {},
) {
  let stored = options.initial;
  const listeners = new Set<() => void>();
  const writes = vi.fn((next?: Session) => {
    stored = next;
  });
  const store: SessionStore = {
    read: () => stored,
    write: writes,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  const controllers: SignInController[] = [];
  const [shown, setShown] = createSignal(true);
  const transport = FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetch)),
  );
  function Consumer() {
    controllers.push(useSignIn());
    return null;
  }
  const view = render(() => (
    <ClientProvider apiBaseUrl="https://host.test/api" sessionStore={store} transport={transport}>
      <Show when={shown()}>
        {Array.from({ length: options.instances ?? 1 }, () => (
          <Consumer />
        ))}
      </Show>
    </ClientProvider>
  ));
  return {
    view,
    store,
    writes,
    controllers,
    get controller() {
      const controller = controllers.at(-1);
      if (!controller) throw new Error("Missing sign-in controller");
      return controller;
    },
    show: () => setShown(true),
    hide: () => setShown(false),
    changeSession: (next?: Session) => {
      stored = next;
      listeners.forEach((listener) => listener());
    },
  };
}

it("starts at the email step without requests, and ignores code actions there", () => {
  const http = network(),
    fixture = mount(http.fetch);
  expect(fixture.controller.state()).toEqual({
    _tag: "Email",
    email: "",
    pending: false,
    error: undefined,
  });
  fixture.controller.verifyCode("001234");
  fixture.controller.resendCode();
  expect(http.fetch).not.toHaveBeenCalled();
});
it.each(["", "alice", "alice@local", " alice@example.com", "alice@example.com "])(
  "validates email %s against the shared schema before HTTP",
  (email) => {
    const http = network(),
      { controller } = mount(http.fetch);
    controller.requestCode(email);
    expect(controller.state()).toMatchObject({
      _tag: "Email",
      email,
      pending: false,
      error: "invalid-email",
    });
    expect(http.fetch).not.toHaveBeenCalled();
    controller.setEmail("Alice@example.com");
    expect(controller.state()).toMatchObject({ email: "Alice@example.com", error: undefined });
  },
);
it("uses the typed API, preserves leading zeros, and installs a decoded session through the existing scope", async () => {
  const http = network(),
    fixture = mount(http.fetch),
    guest = fixture.controller;
  guest.setEmail("Alice@example.com");
  guest.requestCode();
  expect(guest.state()).toMatchObject({ _tag: "Email", pending: true });
  await waitFor(() => expect(http.calls).toHaveLength(1));
  expect(http.at(0).request.method).toBe("POST");
  expect(http.at(0).request.url).toBe("https://host.test/api/session/email");
  expect(http.at(0).request.headers.has("authorization")).toBe(false);
  expect(await http.at(0).request.json()).toEqual({ email: "Alice@example.com" });
  http.at(0).resolve(accepted());
  await waitFor(() =>
    expect(guest.state()).toMatchObject({
      _tag: "Code",
      email: "Alice@example.com",
      code: "",
      pending: undefined,
    }),
  );
  guest.setCode("001234");
  guest.verifyCode();
  await waitFor(() => expect(http.calls).toHaveLength(2));
  expect(http.at(1).request.url).toBe("https://host.test/api/session/code");
  expect(await http.at(1).request.json()).toEqual({ email: "Alice@example.com", code: "001234" });
  http.at(1).resolve(json({ token: "credential", identity: "human" }));
  await waitFor(() =>
    expect(fixture.store.read()).toEqual({ token: "credential", humanId: "human" }),
  );
  expect(fixture.writes).toHaveBeenCalledOnce();
  // The credential remounted the app: a new flow starts, and the old one is disposed.
  expect(fixture.controller).not.toBe(guest);
  guest.requestCode("old@example.com");
  guest.verifyCode("998877");
  guest.resendCode();
  guest.changeEmail();
  expect(http.calls).toHaveLength(2);
});
it("guards duplicate and conflicting actions and keeps the submitted drafts fixed while pending", async () => {
  const http = network(),
    { controller } = mount(http.fetch);
  controller.requestCode("alice@example.com");
  controller.requestCode("other@example.com");
  controller.setEmail("ignored@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  expect(controller.state()).toMatchObject({ email: "alice@example.com" });
  http.at(0).resolve(accepted());
  await waitFor(() => expect(controller.state()._tag).toBe("Code"));
  controller.verifyCode("001234");
  controller.verifyCode("998877");
  controller.resendCode();
  controller.setCode("ignored");
  controller.setEmail("ignored@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(2));
  expect(controller.state()).toMatchObject({
    email: "alice@example.com",
    code: "001234",
    pending: "verifying",
  });
  http.at(1).resolve(json({}, 503));
  await waitFor(() =>
    expect(controller.state()).toMatchObject({ pending: undefined, error: "verify-failed" }),
  );
  expect(http.calls).toHaveLength(2);
});
it.each(["http", "transport"] as const)(
  "retains the email after a %s failure and retries only on demand",
  async (kind) => {
    const http = network(),
      { controller } = mount(http.fetch);
    controller.requestCode("alice@example.com");
    await waitFor(() => expect(http.calls).toHaveLength(1));
    if (kind === "http") http.at(0).resolve(json({}, 503));
    else http.at(0).reject(new Error("offline"));
    await waitFor(() =>
      expect(controller.state()).toMatchObject({
        _tag: "Email",
        pending: false,
        error: "request-failed",
        email: "alice@example.com",
      }),
    );
    expect(http.calls).toHaveLength(1);
    controller.requestCode();
    await waitFor(() => expect(http.calls).toHaveLength(2));
    http.at(1).resolve(accepted());
    await waitFor(() =>
      expect(controller.state()).toMatchObject({ _tag: "Code", error: undefined }),
    );
  },
);
it("validates code drafts without requests and retains them for correction", async () => {
  const http = network(),
    { controller } = mount(http.fetch);
  controller.requestCode("alice@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  http.at(0).resolve(accepted());
  await waitFor(() => expect(controller.state()._tag).toBe("Code"));
  for (const code of ["", "001", "1234567", "12ab56", " 12345"]) {
    controller.verifyCode(code);
    expect(controller.state()).toMatchObject({ code, error: "invalid-code", pending: undefined });
  }
  expect(http.calls).toHaveLength(1);
  controller.setCode("001234");
  expect(controller.state()).toMatchObject({ code: "001234", error: undefined });
});
it.each(["mismatch", "expired", "unknown"] as const)(
  "preserves the typed %s rejection and allows correction",
  async (reason) => {
    const http = network(),
      fixture = mount(http.fetch),
      controller = fixture.controller;
    controller.requestCode("alice@example.com");
    await waitFor(() => expect(http.calls).toHaveLength(1));
    http.at(0).resolve(accepted());
    await waitFor(() => expect(controller.state()._tag).toBe("Code"));
    controller.verifyCode("001234");
    await waitFor(() => expect(http.calls).toHaveLength(2));
    http.at(1).resolve(json({ _tag: "SignIn.Rejected", reason }, 403));
    await waitFor(() =>
      expect(controller.state()).toMatchObject({
        _tag: "Code",
        code: "001234",
        pending: undefined,
        error: reason,
      }),
    );
    expect(fixture.store.read()).toBeUndefined();
    controller.setCode("005678");
    expect(controller.state()).toMatchObject({ error: undefined });
    controller.verifyCode();
    await waitFor(() => expect(http.calls).toHaveLength(3));
    http.at(2).resolve(json({ token: "valid", identity: "alice" }));
    await waitFor(() => expect(fixture.store.read()?.token).toBe("valid"));
  },
);
it("resends for the accepted email without code validation, preserves failed drafts, and clears them only on success", async () => {
  const http = network(),
    { controller } = mount(http.fetch);
  controller.requestCode("alice@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  http.at(0).resolve(accepted());
  await waitFor(() => expect(controller.state()._tag).toBe("Code"));
  controller.setCode("12");
  controller.resendCode();
  controller.resendCode();
  controller.verifyCode("001234");
  controller.setCode("ignored");
  expect(controller.state()).toMatchObject({ code: "12", pending: "resending" });
  await waitFor(() => expect(http.calls).toHaveLength(2));
  expect(await http.at(1).request.json()).toEqual({ email: "alice@example.com" });
  http.at(1).resolve(json({}, 500));
  await waitFor(() =>
    expect(controller.state()).toMatchObject({
      code: "12",
      error: "resend-failed",
      pending: undefined,
      resent: false,
    }),
  );
  controller.resendCode();
  await waitFor(() => expect(http.calls).toHaveLength(3));
  http.at(2).resolve(accepted());
  await waitFor(() =>
    expect(controller.state()).toMatchObject({
      code: "",
      error: undefined,
      pending: undefined,
      resent: true,
    }),
  );
  controller.setCode("000001");
  expect(controller.state()).toMatchObject({ code: "000001", resent: false });
});
it.each(["wrong-fields", "empty-token", "invalid-json", "unknown-rejection"] as const)(
  "never installs a malformed %s response",
  async (kind) => {
    const http = network(),
      fixture = mount(http.fetch),
      controller = fixture.controller;
    controller.requestCode("alice@example.com");
    await waitFor(() => expect(http.calls).toHaveLength(1));
    http.at(0).resolve(accepted());
    await waitFor(() => expect(controller.state()._tag).toBe("Code"));
    controller.verifyCode("001234");
    await waitFor(() => expect(http.calls).toHaveLength(2));
    const response =
      kind === "wrong-fields"
        ? json({ token: "bad", humanId: "alice" })
        : kind === "empty-token"
          ? json({ token: "", identity: "alice" })
          : kind === "unknown-rejection"
            ? json({ _tag: "SignIn.Rejected", reason: "not-in-contract" }, 403)
            : new Response("{", { headers: { "content-type": "application/json" } });
    http.at(1).resolve(response);
    await waitFor(() =>
      expect(controller.state()).toMatchObject({
        error: "verify-failed",
        pending: undefined,
        code: "001234",
      }),
    );
    expect(fixture.writes).not.toHaveBeenCalled();
  },
);
it("cancels email requests before switching drafts and ignores their late success", async () => {
  const http = network(),
    { controller } = mount(http.fetch);
  controller.requestCode("old@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  controller.changeEmail();
  expect(controller.state()).toMatchObject({
    _tag: "Email",
    email: "old@example.com",
    pending: false,
  });
  await waitFor(() => expect(http.at(0).request.signal.aborted).toBe(true));
  controller.requestCode("new@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(2));
  http.at(0).resolve(accepted());
  http.at(1).resolve(accepted());
  await waitFor(() =>
    expect(controller.state()).toMatchObject({ _tag: "Code", email: "new@example.com" }),
  );
});
it.each(["verifying", "resending"] as const)(
  "can change email during %s without accepting a late outcome",
  async (action) => {
    const http = network(),
      fixture = mount(http.fetch),
      controller = fixture.controller;
    controller.requestCode("old@example.com");
    await waitFor(() => expect(http.calls).toHaveLength(1));
    http.at(0).resolve(accepted());
    await waitFor(() => expect(controller.state()._tag).toBe("Code"));
    if (action === "verifying") controller.verifyCode("001234");
    else controller.resendCode();
    await waitFor(() => expect(http.calls).toHaveLength(2));
    controller.changeEmail();
    await waitFor(() => expect(http.at(1).request.signal.aborted).toBe(true));
    expect(controller.state()).toEqual({
      _tag: "Email",
      email: "old@example.com",
      pending: false,
      error: undefined,
    });
    controller.requestCode("new@example.com");
    await waitFor(() => expect(http.calls).toHaveLength(3));
    http
      .at(1)
      .resolve(action === "verifying" ? json({ token: "stale", identity: "old" }) : accepted());
    http.at(2).resolve(accepted());
    await waitFor(() =>
      expect(controller.state()).toMatchObject({
        _tag: "Code",
        email: "new@example.com",
        resent: false,
      }),
    );
    expect(fixture.writes).not.toHaveBeenCalled();
  },
);
it("cancels a disposed form inside a live credential scope and ignores its retained callbacks", async () => {
  const http = network(),
    fixture = mount(http.fetch),
    old = fixture.controller;
  old.requestCode("old@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  http.at(0).resolve(accepted());
  await waitFor(() => expect(old.state()._tag).toBe("Code"));
  old.verifyCode("001234");
  await waitFor(() => expect(http.calls).toHaveLength(2));
  fixture.hide();
  await waitFor(() => expect(http.at(1).request.signal.aborted).toBe(true));
  old.changeEmail();
  old.requestCode("ignored@example.com");
  old.verifyCode("123456");
  old.resendCode();
  fixture.show();
  fixture.controller.requestCode("new@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(3));
  http.at(1).resolve(json({ token: "stale", identity: "old" }));
  http.at(2).resolve(accepted());
  await waitFor(() =>
    expect(fixture.controller.state()).toMatchObject({ _tag: "Code", email: "new@example.com" }),
  );
  expect(fixture.writes).not.toHaveBeenCalled();
});
it("cancels requests on credential replacement and cannot overwrite a newer session", async () => {
  const http = network(),
    fixture = mount(http.fetch),
    old = fixture.controller;
  old.requestCode("old@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(1));
  http.at(0).resolve(accepted());
  await waitFor(() => expect(old.state()._tag).toBe("Code"));
  old.verifyCode("001234");
  await waitFor(() => expect(http.calls).toHaveLength(2));
  fixture.changeSession(session("new-session"));
  await waitFor(() => expect(http.at(1).request.signal.aborted).toBe(true));
  expect(fixture.controller).not.toBe(old);
  http.at(1).resolve(json({ token: "stale", identity: "old" }));
  old.changeEmail();
  old.requestCode("ignored@example.com");
  fixture.view.unmount();
  expect(() => fixture.controller.changeEmail()).not.toThrow();
  expect(fixture.store.read()?.token).toBe("new-session");
  expect(fixture.writes).not.toHaveBeenCalled();
});
it("isolates concurrent controllers within one registry and releases a whole provider safely", async () => {
  const http = network(),
    fixture = mount(http.fetch, { instances: 2 });
  const first = fixture.controllers[0],
    second = fixture.controllers[1];
  if (!first || !second) throw new Error("Missing controller instances");
  first.requestCode("one@example.com");
  second.requestCode("two@example.com");
  await waitFor(() => expect(http.calls).toHaveLength(2));
  first.changeEmail();
  await waitFor(() => expect(http.at(0).request.signal.aborted).toBe(true));
  expect(http.at(1).request.signal.aborted).toBe(false);
  http.at(0).resolve(accepted());
  http.at(1).resolve(accepted());
  await waitFor(() =>
    expect(second.state()).toMatchObject({ _tag: "Code", email: "two@example.com" }),
  );
  expect(first.state()._tag).toBe("Email");
  second.resendCode();
  await waitFor(() => expect(http.calls).toHaveLength(3));
  fixture.view.unmount();
  await waitFor(() => expect(http.at(2).request.signal.aborted).toBe(true));
  expect(() => {
    first.requestCode();
    second.changeEmail();
    second.resendCode();
  }).not.toThrow();
  expect(http.calls).toHaveLength(3);
});
