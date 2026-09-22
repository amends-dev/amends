import { createMemoryHistory, MemoryRouter } from "@solidjs/router";
import { Effect, Layer, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import "@amends/frontend/foundations/typography/fonts";
import { Application } from "./application.tsx";
import { SignIn } from "./api/contracts.ts";
import type { SessionStore } from "./session/store.ts";

function ApplicationPreview(props: {
  state: "signed-out" | "checking" | "unavailable" | "signed-in";
  path?: string;
}) {
  let credential =
    props.state === "signed-out"
      ? undefined
      : Schema.decodeSync(SignIn.Session)({ token: "storybook-only", identity: "preview" });
  const store: SessionStore = {
    read: () => credential,
    write: (next) => {
      credential = next;
    },
    subscribe: () => () => {},
  };
  const history = createMemoryHistory();
  history.set({ value: props.path ?? "/workspaces", scroll: false, replace: true });
  const transport = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => {
      if (props.state === "checking") return Effect.never;
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          new Response(JSON.stringify({ memberships: [], invitations: [] }), {
            status: props.state === "unavailable" ? 503 : 200,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
    }),
  );
  return (
    <Application
      router={(routerProps) => <MemoryRouter {...routerProps} history={history} />}
      apiBaseUrl="https://storybook.invalid"
      sessionStore={store}
      transport={transport}
    />
  );
}
const meta = {
  title: "Setup/Application",
  component: ApplicationPreview,
  parameters: { layout: "fullscreen" as const },
  args: { state: "signed-out" },
} satisfies Meta<typeof ApplicationPreview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignedOut = {} satisfies Story;
export const CheckingSession = { args: { state: "checking" } } satisfies Story;
export const HostUnavailable = { args: { state: "unavailable" } } satisfies Story;
export const SignedIn = { args: { state: "signed-in" } } satisfies Story;
export const MissingPage = { args: { path: "/missing" } } satisfies Story;
export const SignOut = {
  args: { state: "signed-in" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("heading", { name: "Workspaces" });
    await userEvent.click(canvas.getByRole("button", { name: "Sign out" }));
    await expect(await canvas.findByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  },
} satisfies Story;
