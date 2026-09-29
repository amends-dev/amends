import { afterEach, beforeEach, expect, it, vi } from "@effect/vitest";
import { cleanup, fireEvent, render, screen, within } from "@solidjs/testing-library";
import { Theme } from "../src/foundations/theme/index.ts";
import { Profiles, type Profile } from "../src/components/profile-card/index.ts";
import { RichText } from "../src/components/rich-text/index.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const people: Record<string, Profile> = {
  alex: { id: "alex", name: "Alex Morgan", kind: "person" },
  yumi: { id: "yumi", name: "Yumi", kind: "agent" },
  jamie: { id: "jamie", name: "Jamie Morgan", kind: "person", you: true },
  casey: { id: "casey", name: "Casey", kind: "person", former: true },
};

function mount() {
  const actions = {
    message: vi.fn<(memberId: string) => void>(),
    agent: vi.fn<(memberId: string) => void>(),
    rename: vi.fn<() => void>(),
  };
  render(() => (
    <Theme mode="light">
      <Profiles.Root
        profile={(id) => people[id]}
        onMessage={actions.message}
        onOpenAgent={actions.agent}
        onChangeName={actions.rename}
      >
        <p>
          {["alex", "yumi", "jamie", "casey", "gone"].map((id) => (
            <Profiles.Trigger memberId={id}>{id}</Profiles.Trigger>
          ))}
        </p>
      </Profiles.Root>
    </Theme>
  ));
  const trigger = (id: string) => screen.getByRole("button", { name: id });
  return { actions, trigger };
}

it("opens after a moment's hover and closes once the pointer has left the name and its card", () => {
  const { trigger } = mount();
  fireEvent.mouseEnter(trigger("alex"));
  vi.advanceTimersByTime(200);
  expect(screen.queryByRole("dialog")).toBeNull();
  vi.advanceTimersByTime(50);
  const card = screen.getByRole("dialog", { name: "Alex Morgan" });
  expect(card).toHaveTextContent("Person");
  expect(trigger("alex")).toHaveAttribute("aria-expanded", "true");
  // Crossing to the card keeps it open.
  fireEvent.mouseLeave(trigger("alex"));
  vi.advanceTimersByTime(100);
  fireEvent.mouseEnter(card);
  vi.advanceTimersByTime(500);
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.mouseLeave(card);
  vi.advanceTimersByTime(150);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("stays open after a click until Escape or a click outside, one card at a time", () => {
  const { trigger } = mount();
  fireEvent.click(trigger("alex"));
  expect(screen.getByRole("dialog", { name: "Alex Morgan" })).toBeInTheDocument();
  fireEvent.mouseLeave(trigger("alex"));
  vi.advanceTimersByTime(1000);
  expect(screen.getByRole("dialog", { name: "Alex Morgan" })).toBeInTheDocument();
  fireEvent.click(trigger("yumi"));
  expect(screen.getAllByRole("dialog").map((card) => card.getAttribute("aria-label"))).toEqual([
    "Yumi",
  ]);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger("alex"));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("offers what the reader can do: message, open an agent, or change their own name", () => {
  const { actions, trigger } = mount();
  fireEvent.click(trigger("yumi"));
  const agent = within(screen.getByRole("dialog", { name: "Yumi" }));
  expect(agent.getByText("Agent")).toBeInTheDocument();
  fireEvent.click(agent.getByRole("button", { name: "Open agent" }));
  expect(actions.agent).toHaveBeenCalledWith("yumi");
  expect(screen.queryByRole("dialog")).toBeNull();

  fireEvent.click(trigger("alex"));
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Message" }));
  expect(actions.message).toHaveBeenCalledWith("alex");

  fireEvent.click(trigger("jamie"));
  const you = within(screen.getByRole("dialog", { name: "Jamie Morgan" }));
  expect(you.getByText("Person · You")).toBeInTheDocument();
  expect(you.queryByRole("button", { name: "Message" })).toBeNull();
  fireEvent.click(you.getByRole("button", { name: "Change name" }));
  expect(actions.rename).toHaveBeenCalled();
});

it("keeps a former member's name with nothing to do, and says when a profile is unavailable", () => {
  const { trigger } = mount();
  fireEvent.click(trigger("casey"));
  const former = within(screen.getByRole("dialog", { name: "Casey" }));
  expect(former.getByText("Person · Former member")).toBeInTheDocument();
  expect(former.getByText("No longer in this workspace.")).toBeInTheDocument();
  expect(former.queryByRole("button", { name: /Message|Open agent/u })).toBeNull();
  fireEvent.click(trigger("gone"));
  expect(screen.getByRole("dialog", { name: "Profile unavailable" })).toHaveTextContent(
    "Profile unavailable",
  );
});

it("keeps the card open from the keyboard, with Tab reaching its actions", () => {
  const { trigger } = mount();
  trigger("alex").focus();
  fireEvent.keyDown(trigger("alex"), { key: "Enter" });
  const card = screen.getByRole("dialog", { name: "Alex Morgan" });
  fireEvent.keyDown(trigger("alex"), { key: "Tab" });
  expect(within(card).getByRole("button", { name: "Message" })).toHaveFocus();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(trigger("alex")).toHaveFocus();
});

it("opens as keyboard focus moves onto a name, not as focus comes back from outside the page", () => {
  const { trigger } = mount();
  // Arriving from outside the page, as when the window comes back to a focused name.
  trigger("alex").focus();
  expect(screen.queryByRole("dialog")).toBeNull();
  trigger("yumi").focus();
  expect(screen.getByRole("dialog", { name: "Yumi" })).toBeInTheDocument();
  trigger("yumi").blur();
  expect(screen.queryByRole("dialog")).toBeNull();
  trigger("yumi").focus();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("opens from a mention in a message, by the member it links to", () => {
  render(() => (
    <Theme mode="light">
      <Profiles.Root profile={(id) => people[id]}>
        <RichText text="Ask [@Alex](member:alex) about it" mentions={[people.alex!]} />
      </Profiles.Root>
    </Theme>
  ));
  fireEvent.click(screen.getByRole("button", { name: "@Alex Morgan" }));
  expect(screen.getByRole("dialog", { name: "Alex Morgan" })).toBeInTheDocument();
});
