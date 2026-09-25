import { createSignal, onCleanup, onMount } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, waitFor, within } from "storybook/test";
import { Shell } from "@amends/ui/compositions/shell";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { SignInCodeForm, SignInEmailForm } from "@amends/ui/features/sign-in";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import type { ColorTheme } from "@amends/ui/foundations/color";
import "@amends/ui/foundations/typography/fonts";

interface Args {
  scroll: "page" | "regions";
  theme: ColorTheme;
  code: boolean;
  enlarged: boolean;
  rtl: boolean;
}
function ContentFixture(props: Args) {
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("001234");
  onMount(() => {
    if (!props.enlarged) return;
    const root = document.documentElement.style;
    const previous = root.getPropertyValue("font-size"),
      priority = root.getPropertyPriority("font-size");
    root.setProperty("font-size", "200%");
    onCleanup(() => {
      if (previous) root.setProperty("font-size", previous, priority);
      else root.removeProperty("font-size");
    });
  });
  return (
    <ThemeProvider theme={props.theme} dir={props.rtl ? "rtl" : undefined}>
      <Shell.Root>
        <Shell.Body scroll={props.scroll} data-testid="body">
          <Shell.Header>
            <Text as="span" variant="heading">
              amends
            </Text>
          </Shell.Header>
          <Shell.Main>
            <Shell.Content width="narrow" centered data-testid="content">
              {props.code ? (
                <SignInCodeForm
                  email="a.long.email.address.for.layout.review@a-long-domain.example"
                  code={code()}
                  onCodeChange={setCode}
                  onSubmit={() => {}}
                  onResend={() => {}}
                  onChangeEmail={() => {}}
                  codeError="This code has expired. Request a new one."
                />
              ) : (
                <SignInEmailForm email={email()} onEmailChange={setEmail} onSubmit={() => {}} />
              )}
            </Shell.Content>
          </Shell.Main>
          <Shell.Footer>
            <Text variant="mono" tone="secondary">
              amends keeps one identity per address
            </Text>
          </Shell.Footer>
        </Shell.Body>
      </Shell.Root>
    </ThemeProvider>
  );
}
const meta = {
  title: "Compositions/Shell/Content",
  component: ContentFixture,
  args: { theme: "cotton", code: false, enlarged: false, rtl: false, scroll: "page" },
  parameters: {
    layout: "fullscreen" as const,
    viewport: {
      options: {
        desktop: {
          name: "Desktop",
          styles: { width: "1180px", height: "800px" },
          type: "desktop" as const,
        },
        phone: {
          name: "Phone",
          styles: { width: "320px", height: "640px" },
          type: "mobile" as const,
        },
        short: {
          name: "Short window",
          styles: { width: "1180px", height: "320px" },
          type: "desktop" as const,
        },
      },
    },
  },
} satisfies Meta<typeof ContentFixture>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Browser-only layout checks: center short content and keep both overflow edges reachable. */
const geometry =
  (viewport?: { width: number; height: number }): NonNullable<Story["play"]> =>
  async ({ canvasElement }) => {
    if (viewport)
      await waitFor(async () => {
        await expect(document.documentElement.clientWidth).toBe(viewport.width);
        // Storybook may shorten the preview to fit its open addon panel.
        await expect(document.documentElement.clientHeight).toBeLessThanOrEqual(viewport.height);
      });
    await document.fonts.ready;
    const canvas = within(canvasElement),
      main = canvas.getByRole("main");
    const inner = canvas.getByTestId("content").firstElementChild;
    if (!inner) throw new Error("Missing content boundary");
    const mainBounds = main.getBoundingClientRect(),
      bounds = inner.getBoundingClientRect();
    const mainStyle = getComputedStyle(main);
    const start = mainBounds.top + parseFloat(mainStyle.paddingTop);
    const available =
      main.clientHeight - parseFloat(mainStyle.paddingTop) - parseFloat(mainStyle.paddingBottom);
    await expect(bounds.top).toBeGreaterThanOrEqual(start - 1);
    await expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    await expect(canvas.getByRole("banner").getBoundingClientRect().bottom).toBeLessThanOrEqual(
      mainBounds.top + 1,
    );
    await expect(mainBounds.bottom).toBeLessThanOrEqual(
      canvas.getByRole("contentinfo").getBoundingClientRect().top + 1,
    );
    if (bounds.height <= available + 1) {
      await expect(
        Math.abs(bounds.top + bounds.height / 2 - (start + available / 2)),
      ).toBeLessThanOrEqual(1);
    } else {
      await expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
      main.scrollTop = main.scrollHeight;
      await expect(inner.getBoundingClientRect().bottom).toBeLessThanOrEqual(mainBounds.bottom + 1);
      main.scrollTop = 0;
    }
    const body = canvas.getByTestId("body"),
      footer = canvas.getByRole("contentinfo");
    if (body.dataset.scroll === "page") {
      body.scrollTop = body.scrollHeight;
      await expect(footer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        body.getBoundingClientRect().bottom + 1,
      );
      body.scrollTop = 0;
      await expect(canvas.getByRole("banner").getBoundingClientRect().top).toBeGreaterThanOrEqual(
        body.getBoundingClientRect().top - 1,
      );
    }
  };
export const Centered = { play: geometry() } satisfies Story;
export const Code = { args: { code: true }, play: geometry() } satisfies Story;
export const Regions = { args: { scroll: "regions" }, play: geometry() } satisfies Story;
export const Soot = { args: { theme: "soot", code: true }, play: geometry() } satisfies Story;
export const Narrow = {
  args: { code: true },
  globals: { viewport: { value: "phone", isRotated: false } },
  play: geometry({ width: 320, height: 640 }),
} satisfies Story;
export const ShortWindow = {
  args: { code: true },
  globals: { viewport: { value: "short", isRotated: false } },
  play: geometry({ width: 1180, height: 320 }),
} satisfies Story;
export const EnlargedText = {
  ...Narrow,
  args: { code: true, enlarged: true },
  tags: ["!autodocs"],
} satisfies Story;
export const RightToLeft = { ...Narrow, args: { code: true, rtl: true } } satisfies Story;
export const EmptyState = {
  render: () => (
    <ThemeProvider theme="cotton">
      <Shell.Root>
        <Shell.Body>
          <Shell.Main>
            <Shell.Content width="narrow" centered>
              <Column gap={3}>
                <Text as="h1" variant="heading">
                  Nothing here yet
                </Text>
                <Text tone="secondary">
                  This content boundary also supports short empty and status states.
                </Text>
              </Column>
            </Shell.Content>
          </Shell.Main>
        </Shell.Body>
      </Shell.Root>
    </ThemeProvider>
  ),
} satisfies Story;
export const Medium = {
  render: () => (
    <ThemeProvider theme="cotton">
      <Shell.Root>
        <Shell.Body scroll="page">
          <Shell.Main>
            <Shell.Content width="medium">
              <Column gap={3}>
                <Text as="h1" variant="heading">
                  Choose a workspace
                </Text>
                <Text>
                  Medium content leaves room for a readable list while keeping it centered
                  horizontally.
                </Text>
              </Column>
            </Shell.Content>
          </Shell.Main>
        </Shell.Body>
      </Shell.Root>
    </ThemeProvider>
  ),
} satisfies Story;
