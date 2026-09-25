import { For, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SignInEmailForm } from "@amends/ui/features/sign-in";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./sign-in.stories.css.ts";

function RequestFixture() {
  const [email, setEmail] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [requests, setRequests] = createSignal(0);
  const [result, setResult] = createSignal("No completed request.");
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <div class={s.sample}>
        <SignInEmailForm
          email={email()}
          onEmailChange={(value) => {
            setEmail(value);
            setError(undefined);
          }}
          pending={pending()}
          requestError={error()}
          onSubmit={() => {
            setRequests((count) => count + 1);
            setError(undefined);
            setPending(true);
          }}
        />
      </div>
      <Column as="aside" aria-label="Workshop controls" class={s.controls}>
        <Text variant="mono">Workshop controls — no request is sent.</Text>
        <Row>
          <Button
            disabled={!pending()}
            variant="secondary"
            onClick={() => {
              setPending(false);
              setError("We couldn't request a code. Try again.");
            }}
          >
            Fail request
          </Button>
          <Button
            disabled={!pending()}
            variant="secondary"
            onClick={() => {
              setPending(false);
              setResult(`Code requested for ${email()}.`);
            }}
          >
            Complete request
          </Button>
        </Row>
        <output aria-label="Request count">{requests()}</output>
        <output aria-label="Workshop result">{result()}</output>
      </Column>
    </main>
  );
}
const cases = [
  { name: "Empty", email: "" },
  { name: "Filled", email: "jo@mercier.co" },
  { name: "Field error", email: "jo", emailError: "Enter a valid email address." },
  { name: "Pending", email: "jo@mercier.co", pending: true },
  {
    name: "Request error",
    email: "jo@mercier.co",
    requestError: "We couldn't request a code. Try again.",
  },
] as const;
function ComparisonFixture(props: { enlarged?: boolean }) {
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style;
    const before = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (before) root.setProperty("font-size", before, priority);
      else root.removeProperty("font-size");
    });
  });
  return (
    <main class={s.comparison}>
      <For each={["cotton", "soot"] as const}>
        {(theme) => {
          const themeId = createUniqueId(),
            panelId = createUniqueId();
          return (
            <section class={`${colorThemes[theme]} ${s.frame}`}>
              <Text as="h1" variant="heading" id={themeId}>
                {theme === "cotton" ? "Cotton" : "Soot"}
              </Text>
              <Column gap={6}>
                <For each={cases}>
                  {(sample) => {
                    const labelId = createUniqueId();
                    const { name, ...formProps } = sample;
                    return (
                      <section class={s.sample}>
                        <Text as="h2" variant="mono" id={labelId}>
                          {name}
                        </Text>
                        <SignInEmailForm
                          {...formProps}
                          aria-labelledby={`${themeId} ${labelId}`}
                          headingAs="h3"
                          onEmailChange={() => {}}
                          onSubmit={() => {}}
                        />
                      </section>
                    );
                  }}
                </For>
                <section class={`${s.sample} ${s.panel}`} dir="rtl">
                  <Text as="h2" variant="mono" id={panelId}>
                    Panel / RTL
                  </Text>
                  <SignInEmailForm
                    headingAs="h3"
                    aria-labelledby={`${themeId} ${panelId}`}
                    email="jo@mercier.co"
                    onEmailChange={() => {}}
                    onSubmit={() => {}}
                  />
                </section>
              </Column>
            </section>
          );
        }}
      </For>
    </main>
  );
}
function LayoutFixture() {
  const [compact, setCompact] = createSignal(false);
  const [email, setEmail] = createSignal(
    "a.long.email.address.for.layout.review@a-long-domain.example",
  );
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <div style={{ width: compact() ? "16rem" : "26.25rem", "max-width": "100%" }}>
        <SignInEmailForm
          email={email()}
          onEmailChange={setEmail}
          onSubmit={() => {}}
          requestError="We couldn't request a code for this address. Check your connection and try again; your email address has been kept."
        />
      </div>
      <Button class={s.controls} variant="secondary" onClick={() => setCompact(!compact())}>
        Toggle width
      </Button>
    </main>
  );
}
const meta = {
  title: "Features/Sign in/Email form",
  component: SignInEmailForm,
  args: { email: "", onEmailChange: fn(), onSubmit: fn() },
  parameters: { layout: "fullscreen" as const, controls: { disable: true } },
} satisfies Meta<typeof SignInEmailForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = { render: () => <RequestFixture /> } satisfies Story;
export const Comparison = { render: () => <ComparisonFixture /> } satisfies Story;
export const EnlargedText = {
  render: () => <ComparisonFixture enlarged />,
  tags: ["!autodocs"],
} satisfies Story;
export const Validation = {
  render: () => <RequestFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Email" });
    const submit = canvas.getByRole("button", { name: "Continue" });
    await userEvent.click(submit);
    await expect(input).toHaveAccessibleDescription("Error: Enter your email address.");
    await expect(input).toHaveFocus();
    await userEvent.type(input, "invalid");
    await userEvent.click(submit);
    await expect(input).toHaveAccessibleDescription("Error: Enter a valid email address.");
    await expect(canvas.getByLabelText("Request count")).toHaveTextContent("0");
    await userEvent.clear(input);
    await userEvent.type(input, "jo@mercier.co");
    await expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.click(submit);
    await expect(canvas.getByLabelText("Request count")).toHaveTextContent("1");
  },
} satisfies Story;
export const RequestRecovery = {
  render: () => <RequestFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Email" });
    const submit = canvas.getByRole("button", { name: "Continue" });
    await userEvent.type(input, "jo@mercier.co");
    await userEvent.click(submit);
    await expect(submit).toHaveFocus();
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(input).toHaveAttribute("readonly");
    await expect(within(canvas.getByRole("form")).getByRole("status")).toHaveTextContent(
      "Requesting a sign-in code…",
    );
    await userEvent.click(submit);
    await expect(canvas.getByLabelText("Request count")).toHaveTextContent("1");
    await userEvent.click(canvas.getByRole("button", { name: "Fail request" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "We couldn't request a code. Try again.",
    );
    await expect(input).toHaveValue("jo@mercier.co");
    await expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.click(submit);
    await expect(canvas.getByRole("alert").textContent).toBe("");
    await userEvent.click(canvas.getByRole("button", { name: "Complete request" }));
    await expect(canvas.getByLabelText("Workshop result")).toHaveTextContent(
      "Code requested for jo@mercier.co.",
    );
    await expect(canvas.getByLabelText("Request count")).toHaveTextContent("2");
    await expect(canvas.getByRole("textbox", { name: "Email" })).toBe(input);
  },
} satisfies Story;
export const Layout = {
  render: () => <LayoutFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Email" });
    const value = (input as HTMLInputElement).value;
    await userEvent.click(canvas.getByRole("button", { name: "Toggle width" }));
    await expect(canvas.getByRole("textbox", { name: "Email" })).toBe(input);
    await expect(input).toHaveValue(value);
  },
} satisfies Story;
