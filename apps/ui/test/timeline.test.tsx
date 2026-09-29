import { afterEach, expect, it } from "@effect/vitest";
import { cleanup, render } from "@solidjs/testing-library";
import { Theme } from "../src/foundations/theme/index.ts";
import { Timeline, type TimelineEntry } from "../src/screens/timeline/index.ts";

afterEach(cleanup);

const start = new Date(2026, 8, 29, 10, 0);
const minute = (minutes: number) => new Date(start.getTime() + minutes * 60_000);
const message = (
  id: string,
  author: string,
  at: Date,
  replies?: number,
): Extract<TimelineEntry, { kind: "message" }> => ({
  kind: "message",
  id,
  author: { id: author, name: author },
  at,
  text: `Message ${id}`,
  ...(replies === undefined ? {} : { thread: { replies } }),
});

const stackedIds = (entries: readonly TimelineEntry[], days = false) => {
  const view = render(() => (
    <Theme mode="light">
      <Timeline entries={entries} days={days} />
    </Theme>
  ));
  return [...view.container.querySelectorAll("article[data-continued]")].map(
    (article) => article.textContent?.match(/Message (\w+)/u)?.[1],
  );
};

it("stacks an author's messages in a row, within five minutes of the one before", () => {
  expect(
    stackedIds([
      message("a1", "ada", minute(0)),
      message("a2", "ada", minute(1)),
      message("a3", "ada", minute(5)),
      message("b1", "bo", minute(6)),
      message("b2", "bo", minute(12)),
      message("b3", "bo", minute(16)),
    ]),
  ).toEqual(["a2", "a3", "b3"]);
});

it("starts again after a replies summary, anything between, or a new day", () => {
  expect(
    stackedIds([
      message("t1", "ada", minute(0), 2),
      message("t2", "ada", minute(1), 0),
      message("t3", "ada", minute(2), 3),
      message("t4", "ada", minute(3)),
    ]),
  ).toEqual([]);
  expect(
    stackedIds([
      message("n1", "ada", minute(0)),
      { kind: "event", id: "e1", text: "Ada created a task" },
      message("n2", "ada", minute(1)),
    ]),
  ).toEqual([]);
  expect(
    stackedIds(
      [message("d1", "ada", new Date(2026, 8, 28, 23, 59)), message("d2", "ada", start)],
      true,
    ),
  ).toEqual([]);
});

it("keeps a stacked message's author and time for assistive technology", () => {
  const view = render(() => (
    <Theme mode="light">
      <Timeline entries={[message("s1", "ada", minute(0)), message("s2", "ada", minute(1))]} />
    </Theme>
  ));
  const [first, second] = view.container.querySelectorAll("article");
  expect(first!.querySelector("time")).toBeVisible();
  expect(second).toHaveAttribute("data-continued");
  expect(second!.textContent).toContain("ada");
  expect(second!.querySelector("time")?.getAttribute("dateTime")).toBe(minute(1).toISOString());
});
