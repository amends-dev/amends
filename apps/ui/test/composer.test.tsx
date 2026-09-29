import { afterEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { userEvent } from "storybook/test";
import { Composer } from "../src/components/composer/index.ts";
import { RichText } from "../src/components/rich-text/index.ts";
import { Theme } from "../src/foundations/theme/index.ts";

afterEach(cleanup);

async function mount(initial = "") {
  const [value, setValue] = createSignal(initial);
  const send = vi.fn<(value: string) => void>();
  const command = vi.fn<(name: string) => void>();
  render(() => (
    <Theme mode="light">
      <Composer.Root
        value={value()}
        onValueChange={setValue}
        onSend={send}
        mentionCandidates={[{ id: "ada", name: "Ada Lovelace" }]}
        commands={[
          { name: "follow", description: "Follow #general" },
          { name: "rename", description: "Rename #general" },
        ]}
        onCommand={command}
      >
        <Composer.Formatting />
        <Composer.Input placeholder="Message #general" />
        <Composer.Toolbar>
          <Composer.FormattingToggle />
          <Composer.Send />
        </Composer.Toolbar>
      </Composer.Root>
    </Theme>
  ));
  const input = await screen.findByRole("combobox", { name: "Message #general" });
  const user = userEvent.setup();
  await user.click(input);
  return { input, value, setValue, send, command, user };
}

it("turns markdown into formatting as it is typed, and sends the draft as markdown", async () => {
  const { input, value, send, user } = await mount();
  await user.type(input, "ship **today** with `care` ");
  expect(input.querySelector("strong")).toHaveTextContent("today");
  expect(input.querySelector("code")).toHaveTextContent("care");
  expect(value()).toBe("ship **today** with `care`");
  await user.keyboard("{Enter}");
  expect(send).toHaveBeenCalledWith("ship **today** with `care`");
});

it("starts a new line with Shift+Enter, and a new item inside a list", async () => {
  const { input, value, user } = await mount();
  await user.type(input, "first");
  await user.keyboard("{Shift>}{Enter}{/Shift}second");
  expect(value()).toBe("first\nsecond");
  await user.keyboard("{Shift>}{Enter}{/Shift}- one{Shift>}{Enter}{/Shift}two");
  expect(input.querySelectorAll("li")).toHaveLength(2);
  expect(value()).toBe("first\nsecond\n\n- one\n- two");
});

it("sends with Enter only when no input method is composing", async () => {
  const { input, send, user } = await mount();
  await user.type(input, "hello");
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" });
  expect(send).toHaveBeenCalledWith("hello");
});

it("mentions a suggested member as one piece that links to them", async () => {
  const { input, value, send, user } = await mount();
  await user.type(input, "ask @lov");
  expect(input).toHaveAttribute("aria-expanded", "true");
  // The Enter that confirms an input method's text leaves the suggestion alone.
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  expect(screen.getByRole("option", { name: /Ada Lovelace/u })).toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(input.querySelector("[data-member=ada]")).toHaveTextContent("@Ada Lovelace");
  expect(value()).toBe("ask [@Ada Lovelace](member:ada)");
  expect(send).not.toHaveBeenCalled();
  // Deleting the mention deletes it whole.
  await user.keyboard("{Backspace}{Backspace}");
  expect(value()).toBe("ask");
});

it("closes the suggestions with Escape without closing what holds the composer", async () => {
  const { input, user } = await mount();
  await user.type(input, "@a");
  expect(screen.getByRole("listbox", { name: "People to mention" })).toBeInTheDocument();
  const outer = vi.fn();
  document.addEventListener("keydown", outer);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(outer).not.toHaveBeenCalled();
  document.removeEventListener("keydown", outer);
});

it("formats the selection from the toolbar, pressed while it applies", async () => {
  const { input, value, user } = await mount();
  await user.type(input, "important");
  await user.keyboard("{Control>}a{/Control}");
  const bold = screen.getByRole("button", { name: "Bold" });
  expect(bold).toHaveAttribute("aria-pressed", "false");
  await user.click(bold);
  expect(bold).toHaveAttribute("aria-pressed", "true");
  expect(value()).toBe("**important**");
  await user.click(screen.getByRole("button", { name: "Bulleted list" }));
  expect(value()).toBe("- **important**");
  // The toggle hides the formatting and says so.
  const toggle = screen.getByRole("button", { name: "Formatting" });
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByRole("toolbar", { name: "Formatting" })).toBeNull();
});

it("links the selected text to an address, and refuses other schemes", async () => {
  const { input, value, user } = await mount();
  await user.type(input, "the report");
  await user.keyboard("{Control>}a{/Control}");
  await user.keyboard("{Control>}{Shift>}u{/Shift}{/Control}");
  const address = await screen.findByRole("textbox", { name: "Link address" });
  await waitFor(() => expect(address).toHaveFocus());
  await user.type(address, "javascript:alert(1){Enter}");
  expect(address).toHaveAttribute("aria-invalid", "true");
  await user.clear(address);
  await user.type(address, "example.com/report{Enter}");
  expect(screen.queryByRole("group", { name: "Link" })).toBeNull();
  expect(value()).toBe("[the report](https://example.com/report)");
});

it("shows a draft the caller replaces, such as one cleared once sent", async () => {
  const { input, setValue, user } = await mount("kept **draft**");
  expect(input.querySelector("strong")).toHaveTextContent("draft");
  setValue("");
  await waitFor(() => expect(input.textContent).toBe(""));
  await user.type(input, "next");
  expect(input).toHaveTextContent("next");
});

it("reads pasted text as markdown, and keeps it as written inside code", async () => {
  const { input, value, user } = await mount();
  await user.paste("**Done:**\n- ship\n- `test`");
  expect(input.querySelector("strong")).toHaveTextContent("Done:");
  expect(input.querySelectorAll("li")).toHaveLength(2);
  expect(value()).toBe("**Done:**\n\n- ship\n- `test`");
  await user.keyboard("{Control>}a{/Control}{Backspace}");
  await user.click(screen.getByRole("button", { name: "Code block" }));
  await user.paste("**not bold**");
  expect(input.querySelector("strong")).toBeNull();
  expect(value()).toBe("```\n**not bold**\n```");
});

it("runs a command chosen after / in place of sending it", async () => {
  const { input, value, send, command, user } = await mount();
  await user.type(input, "/");
  const commands = screen.getByRole("listbox", { name: "Commands" });
  expect(
    within(commands)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["/followFollow #general", "/renameRename #general"]);
  await user.type(input, "re");
  expect(within(commands).getAllByRole("option")).toHaveLength(1);
  await user.keyboard("{Enter}");
  expect(command).toHaveBeenCalledWith("rename");
  expect(send).not.toHaveBeenCalled();
  expect(value()).toBe("");
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("takes / as text anywhere but the start, and once the commands are closed", async () => {
  const { input, send, command, user } = await mount();
  await user.type(input, "see /re");
  expect(screen.queryByRole("listbox")).toBeNull();
  await user.keyboard("{Control>}a{/Control}{Backspace}");
  await user.type(input, "/follow");
  expect(screen.getByRole("listbox", { name: "Commands" })).toBeInTheDocument();
  await user.keyboard("{Escape}{Enter}");
  expect(command).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledWith("/follow");
});

it("opens a code block from ``` and Shift+Enter, at the start or after a line", async () => {
  const { input, value, user } = await mount();
  await user.type(input, "```");
  await user.keyboard("{Shift>}{Enter}{/Shift}const a = 1;");
  expect(input.querySelector("pre")).toHaveTextContent("const a = 1;");
  expect(value()).toBe("```\nconst a = 1;\n```");
  await user.keyboard("{Control>}a{/Control}{Backspace}");
  await user.type(input, "Try this:");
  await user.keyboard("{Shift>}{Enter}{/Shift}```ts{Shift>}{Enter}{/Shift}let b;");
  expect(value()).toBe("Try this:\n\n```ts\nlet b;\n```");
  // Other markers only break the line.
  await user.keyboard("{Control>}a{/Control}{Backspace}");
  await user.type(input, "-");
  await user.keyboard("{Shift>}{Enter}{/Shift}next");
  expect(input.querySelectorAll("ul, pre")).toHaveLength(0);
  expect(value()).toBe("\\-\nnext");
});

it("sends lines that look like markdown blocks as the text they are", async () => {
  const { input, value, user } = await mount();
  await user.type(input, "a");
  for (const line of ["-", "# b", "2) c", "=="])
    await user.keyboard(`{Shift>}{Enter}{/Shift}${line}`);
  expect(value()).toBe("a\n\\-\n\\# b\n2\\) c\n\\==");
  // Read back as a message, it is one paragraph of those lines, with no heading or list.
  cleanup();
  const view = render(() => <RichText text={value()} />);
  const paragraphs = view.container.querySelectorAll("p");
  expect(paragraphs).toHaveLength(1);
  expect(paragraphs[0]!.innerHTML.split("<br>")).toEqual(["a", "-", "# b", "2) c", "=="]);
  expect(view.container.querySelector("ul, ol, li")).toBeNull();
});
