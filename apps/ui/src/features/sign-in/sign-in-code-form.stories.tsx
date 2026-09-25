import { For, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { SignInCodeForm, type SignInCodeFormProps } from "@amends/ui/features/sign-in";
import { Button } from "@amends/ui/primitives/button";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./sign-in.stories.css.ts";

function RequestFixture() {
  const [code, setCode] = createSignal("");
  const [pending, setPending] = createSignal<SignInCodeFormProps["pending"]>();
  const [codeError, setCodeError] = createSignal<string>();
  const [requestError, setRequestError] = createSignal<string>();
  const [notice, setNotice] = createSignal<string>();
  const [verifications, setVerifications] = createSignal(0);
  const [resends, setResends] = createSignal(0);
  const [result, setResult] = createSignal("No completed request.");
  const start = (action: "verifying" | "resending") => {
    setPending(action);
    setCodeError(undefined);
    setRequestError(undefined);
    setNotice(undefined);
  };
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <div class={s.sample}>
        <SignInCodeForm
          email="jo@mercier.co"
          code={code()}
          onCodeChange={(value) => {
            setCode(value);
            setCodeError(undefined);
            setRequestError(undefined);
          }}
          onSubmit={() => {
            setVerifications((count) => count + 1);
            start("verifying");
          }}
          onResend={() => {
            setResends((count) => count + 1);
            start("resending");
          }}
          onChangeEmail={() => {
            setPending(undefined);
            setResult("Email change requested.");
          }}
          pending={pending()}
          codeError={codeError()}
          requestError={requestError()}
          notice={notice()}
        />
      </div>
      <Column as="aside" aria-label="Workshop controls" class={s.controls}>
        <Text variant="mono">Workshop controls — no request is sent.</Text>
        <Row>
          <Button
            variant="secondary"
            disabled={!pending()}
            onClick={() => {
              setRequestError(
                pending() === "resending"
                  ? "We couldn't request a new code. Try again."
                  : "We couldn't verify your code. Try again.",
              );
              setPending(undefined);
            }}
          >
            Fail request
          </Button>
          <Button
            variant="secondary"
            disabled={pending() !== "verifying"}
            onClick={() => {
              setCodeError("That code doesn't match. Check it and try again.");
              setPending(undefined);
            }}
          >
            Reject code
          </Button>
          <Button
            variant="secondary"
            disabled={!pending()}
            onClick={() => {
              if (pending() === "resending") {
                setCode("");
                setNotice("A new code is available. Use the latest code.");
              } else setResult(`Verified code: ${code()}.`);
              setPending(undefined);
            }}
          >
            Complete request
          </Button>
        </Row>
        <output aria-label="Verification count">{verifications()}</output>
        <output aria-label="Resend count">{resends()}</output>
        <output aria-label="Workshop result">{result()}</output>
      </Column>
    </main>
  );
}
const cases = [
  { name: "Empty", code: "" },
  { name: "Partial", code: "001" },
  { name: "Complete", code: "001234" },
  {
    name: "Wrong code",
    code: "123456",
    codeError: "That code doesn't match. Check it and try again.",
  },
  { name: "Expired", code: "123456", codeError: "This code has expired. Request a new one." },
  {
    name: "Unavailable code",
    code: "123456",
    codeError: "This code is no longer available. Request a new one.",
  },
  { name: "Verifying", code: "001234", pending: "verifying" },
  { name: "Resending", code: "001234", pending: "resending" },
  {
    name: "Request error",
    code: "001234",
    requestError: "We couldn't request a new code. Try again.",
  },
  { name: "Resent", code: "", notice: "A new code is available. Use the latest code." },
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
                        <SignInCodeForm
                          {...formProps}
                          email="jo@mercier.co"
                          headingAs="h3"
                          aria-labelledby={`${themeId} ${labelId}`}
                          onCodeChange={() => {}}
                          onSubmit={() => {}}
                          onResend={() => {}}
                          onChangeEmail={() => {}}
                        />
                      </section>
                    );
                  }}
                </For>
                <section class={`${s.sample} ${s.panel}`} dir="rtl">
                  <Text as="h2" variant="mono" id={panelId}>
                    Panel / RTL / delivery guidance
                  </Text>
                  <SignInCodeForm
                    email="jo@mercier.co"
                    code="001234"
                    deliveryHint="In local development, find the code in the host's terminal."
                    headingAs="h3"
                    aria-labelledby={`${themeId} ${panelId}`}
                    onCodeChange={() => {}}
                    onSubmit={() => {}}
                    onResend={() => {}}
                    onChangeEmail={() => {}}
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
  const [code, setCode] = createSignal("001234");
  return (
    <main class={`${colorThemes.cotton} ${s.frame}`}>
      <div style={{ width: compact() ? "11rem" : "26.25rem", "max-width": "100%" }}>
        <SignInCodeForm
          email="a.long.email.address.for.layout.review@a-long-domain.example"
          code={code()}
          onCodeChange={setCode}
          onSubmit={() => {}}
          onResend={() => {}}
          onChangeEmail={() => {}}
          codeError="This code has expired. Request a new code or change your email address to start again."
        />
      </div>
      <Button variant="secondary" class={s.controls} onClick={() => setCompact(!compact())}>
        Toggle width
      </Button>
    </main>
  );
}
const meta = {
  title: "Features/Sign in/Code form",
  component: SignInCodeForm,
  args: {
    email: "jo@mercier.co",
    code: "",
    onCodeChange: fn(),
    onSubmit: fn(),
    onResend: fn(),
    onChangeEmail: fn(),
  },
  parameters: { layout: "fullscreen" as const, controls: { disable: true } },
} satisfies Meta<typeof SignInCodeForm>;
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
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Six-digit code" });
    const verify = canvas.getByRole("button", { name: "Verify code" });
    await userEvent.click(verify);
    await expect(input).toHaveFocus();
    await expect(input).toHaveAccessibleDescription(
      "Use your most recent code. Error: Enter your code.",
    );
    await userEvent.type(input, "001");
    await userEvent.click(verify);
    await expect(input).toHaveAccessibleDescription(
      "Use your most recent code. Error: Enter all six digits.",
    );
    await userEvent.clear(input);
    await userEvent.type(input, "12ab56");
    await userEvent.click(verify);
    await expect(canvas.getByLabelText("Verification count")).toHaveTextContent("0");
    await userEvent.clear(input);
    await userEvent.type(input, "001234");
    await expect(canvas.getByLabelText("Verification count")).toHaveTextContent("0");
    await userEvent.click(verify);
    await expect(canvas.getByLabelText("Verification count")).toHaveTextContent("1");
  },
} satisfies Story;
export const VerifyRecovery = {
  render: () => <RequestFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Six-digit code" });
    const verify = canvas.getByRole("button", { name: "Verify code" });
    await userEvent.type(input, "001234");
    await userEvent.click(verify);
    await expect(verify).toHaveFocus();
    await expect(input).toHaveAttribute("readonly");
    await expect(canvas.getByRole("button", { name: "Send again" })).toBeDisabled();
    await userEvent.click(verify);
    await expect(canvas.getByLabelText("Verification count")).toHaveTextContent("1");
    await userEvent.click(canvas.getByRole("button", { name: "Reject code" }));
    await expect(input).toHaveValue("001234");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await userEvent.clear(input);
    await userEvent.type(input, "005678");
    await userEvent.click(verify);
    await userEvent.click(canvas.getByRole("button", { name: "Complete request" }));
    await expect(canvas.getByLabelText("Workshop result")).toHaveTextContent(
      "Verified code: 005678.",
    );
    await expect(canvas.getByRole("textbox")).toBe(input);
  },
} satisfies Story;
export const ResendRecovery = {
  render: () => <RequestFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox", { name: "Six-digit code" });
    const resend = canvas.getByRole("button", { name: "Send again" });
    // Resending is independent of the code field's validity.
    await userEvent.type(input, "001");
    await userEvent.click(resend);
    await expect(resend).toHaveFocus();
    await expect(canvas.getByRole("button", { name: "Verify code" })).toBeDisabled();
    await expect(within(canvas.getByRole("form")).getByRole("status")).toHaveTextContent(
      "Requesting a new code…",
    );
    await userEvent.click(resend);
    await expect(canvas.getByLabelText("Resend count")).toHaveTextContent("1");
    await userEvent.click(canvas.getByRole("button", { name: "Fail request" }));
    await expect(canvas.getByRole("alert")).toHaveTextContent(
      "We couldn't request a new code. Try again.",
    );
    await expect(input).toHaveValue("001");
    await expect(input).not.toHaveAttribute("aria-invalid");
    await userEvent.click(resend);
    await userEvent.click(canvas.getByRole("button", { name: "Complete request" }));
    await expect(input).toHaveValue("");
    await expect(within(canvas.getByRole("form")).getByRole("status")).toHaveTextContent(
      "A new code is available. Use the latest code.",
    );
  },
} satisfies Story;
export const ChangeEmail = {
  render: () => <RequestFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Send again" }));
    await userEvent.click(canvas.getByRole("button", { name: "Change email" }));
    await expect(canvas.getByLabelText("Workshop result")).toHaveTextContent(
      "Email change requested.",
    );
    await expect(canvas.getByLabelText("Verification count")).toHaveTextContent("0");
  },
} satisfies Story;
export const Layout = {
  render: () => <LayoutFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      input = canvas.getByRole("textbox");
    await userEvent.click(canvas.getByRole("button", { name: "Toggle width" }));
    await expect(canvas.getByRole("textbox")).toBe(input);
    await expect(input).toHaveValue("001234");
  },
} satisfies Story;
