import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { RichText, type RichTextMention } from "../src/components/rich-text/index.ts";

afterEach(cleanup);

const mount = (text: string, options: { mentions?: RichTextMention[]; inline?: boolean } = {}) =>
  render(() => <RichText text={text} mentions={options.mentions} inline={options.inline} />);

it("links only web and email addresses, and never loads images", () => {
  const view = mount(
    "[web](https://example.com) [mail](mailto:a@example.com) [script](javascript:alert(1)) " +
      "[page](/relative) ![chart](https://example.com/chart.png) ![local](data:image/png;base64,x)",
  );
  const links = view.container.querySelectorAll("a");
  expect([...links].map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
    ["web", "https://example.com"],
    ["mail", "mailto:a@example.com"],
    ["chart", "https://example.com/chart.png"],
  ]);
  for (const link of links) {
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container).toHaveTextContent("script page chart local");
});

it("shows raw HTML as written", () => {
  const view = mount('<img src=x onerror="alert(1)"> and <script>alert(2)</script>');
  expect(view.container.querySelector("img, script")).toBeNull();
  expect(view.container).toHaveTextContent('<img src=x onerror="alert(1)"> and');
});

it("names mentioned members as they are now, and others as the text recorded them", () => {
  const view = mount("[@Ada](member:m1) and [@Old name](member:gone) and [@x](member:m2)", {
    mentions: [
      { id: "m1", name: "Ada Lovelace" },
      { id: "m2", name: "Grace" },
    ],
  });
  const mentions = view.container.querySelectorAll("[data-member]");
  expect([...mentions].map((mention) => mention.textContent)).toEqual([
    "@Ada Lovelace",
    "@Old name",
    "@Grace",
  ]);
  expect(view.container.querySelector("a")).toBeNull();
});

it("breaks lines where the text does, and keeps code as written", () => {
  const view = mount("one\ntwo\n\n```\n  a  <b>\n```");
  expect(view.container.querySelector("p")?.innerHTML).toBe("one<br>two");
  expect(view.container.querySelector("pre code")?.textContent).toBe("  a  <b>");
});

it("flattens to one run of words and mentions", () => {
  const view = mount("# Plan\n\n[@Ada](member:m1) please:\n\n- **ship**\n- `test`\n\n> soon", {
    mentions: [{ id: "m1", name: "Ada" }],
    inline: true,
  });
  expect(view.container.firstElementChild?.tagName).toBe("SPAN");
  expect(view.container).toHaveTextContent(/^Plan @Ada please: ship test soon$/u);
  expect(view.container.querySelector("strong, code, li")).toBeNull();
});

it("keeps finished blocks while streamed text grows, closing what is left open", () => {
  const [text, setText] = createSignal("First paragraph.\n\nSecond **bo");
  const view = render(() => <RichText text={text()} streaming />);
  const first = view.getByText("First paragraph.");
  expect(view.getByText("bo").tagName).toBe("STRONG");
  setText("First paragraph.\n\nSecond **bold** and more");
  expect(view.getByText("First paragraph.")).toBe(first);
  expect(view.getByText("bold").tagName).toBe("STRONG");
});
