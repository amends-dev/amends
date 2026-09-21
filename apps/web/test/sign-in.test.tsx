import { afterEach, beforeEach, describe, expect, it, vi } from "@effect/vitest";
import { cleanup, render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SessionBoundary } from "../src/session/boundary.tsx";
import { MemoryRouter, Route, createMemoryHistory } from "@solidjs/router";
import { SignInPage } from "../src/pages/session/sign-in.tsx";

/** The local host's contract, answered in memory: one delivered code per address. */
const codes = new Map<string, string>();
const requests: Array<{ readonly url: string; readonly body: unknown }> = [];
const respond = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { "content-type": "application/json" },
  });
const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  ).pathname;
  const text =
    init?.body === undefined || init.body === null ? "" : await new Response(init.body).text();
  const body = text === "" ? {} : (JSON.parse(text) as Record<string, string>);
  requests.push({ url, body });
  if (url.endsWith("/api/session/email")) {
    codes.set(body.email ?? "", "419270");
    return respond(202);
  }
  if (url.endsWith("/api/session/code")) {
    return codes.get(body.email ?? "") === body.code
      ? respond(200, { token: body.email, identity: body.email })
      : respond(403, { _tag: "SignIn.Rejected", reason: "mismatch" });
  }
  return respond(404);
});

beforeEach(() => {
  codes.clear();
  requests.length = 0;
  localStorage.clear();
  vi.stubGlobal("fetch", fetchStub);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const mount = () => {
  const history = createMemoryHistory();
  history.set({ value: "/sign-in" });
  // A registry per test keeps the session atom from leaking between tests.
  render(() => (
    <SessionBoundary>
      <MemoryRouter history={history}>
        <Route path="/sign-in" component={SignInPage} />
        <Route path="/" component={() => <p>picker</p>} />
      </MemoryRouter>
    </SessionBoundary>
  ));
  return history;
};

describe("sign in", () => {
  it("asks for a real address before sending a code", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Email"), "not an address");
    await user.click(screen.getByRole("button", { name: "continue" }));
    expect(await screen.findByText("Enter the address you use for work.")).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it("sends a code, rejects a wrong one, and signs in with the delivered one", async () => {
    const user = userEvent.setup();
    const history = mount();
    await user.type(screen.getByLabelText("Email"), "jo@mercier.co");
    await user.click(screen.getByRole("button", { name: "continue" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(requests[0]).toEqual({
      url: "/api/session/email",
      body: { email: "jo@mercier.co" },
    });

    const code = screen.getByLabelText("Six-digit code");
    await user.type(code, "000000");
    expect(
      await screen.findByText("That code did not match. Check the message and try again."),
    ).toBeTruthy();
    expect((code as HTMLInputElement).value).toBe("");

    await user.type(code, "419270");
    await waitFor(() => expect(history.get()).toBe("/"));
    expect(await screen.findByText("picker")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("amends.session") ?? "null")).toEqual({
      token: "jo@mercier.co",
      identity: "jo@mercier.co",
    });
  });

  it("returns to the address step without sending anything", async () => {
    const user = userEvent.setup();
    mount();
    await user.type(screen.getByLabelText("Email"), "jo@mercier.co");
    await user.click(screen.getByRole("button", { name: "continue" }));
    await screen.findByRole("heading", { name: "Check your email" });
    await user.click(screen.getByRole("button", { name: "change email" }));
    expect(await screen.findByRole("heading", { name: "Sign in to amends" })).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("jo@mercier.co");
    expect(requests).toHaveLength(1);
  });
});
