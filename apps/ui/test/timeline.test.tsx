import { afterEach, expect, it, vi } from "@effect/vitest"
import { cleanup, fireEvent, render, within } from "@solidjs/testing-library"
import { Theme } from "../src/foundations/theme/index.ts"
import { Timeline, type TimelineEntry } from "../src/screens/timeline/index.ts"

afterEach(cleanup)

const start = new Date(2026, 8, 29, 10, 0)
const minute = (minutes: number) => new Date(start.getTime() + minutes * 60_000)
const message = (
  id: string,
  author: string,
  at: Date,
  replies?: number
): Extract<TimelineEntry, { kind: "message" }> => ({
  kind: "message",
  id,
  author: { id: author, name: author },
  at,
  text: `Message ${id}`,
  ...(replies === undefined ? {} : { thread: { replies } })
})

const stackedIds = (entries: ReadonlyArray<TimelineEntry>, days = false) => {
  const view = render(() => (
    <Theme mode="light">
      <Timeline entries={entries} days={days} />
    </Theme>
  ))
  return [...view.container.querySelectorAll("article[data-continued]")].map(
    (article) => article.textContent?.match(/Message (\w+)/u)?.[1]
  )
}

it("stacks an author's messages in a row, within five minutes of the one before", () => {
  expect(
    stackedIds([
      message("a1", "ada", minute(0)),
      message("a2", "ada", minute(1)),
      message("a3", "ada", minute(5)),
      message("b1", "bo", minute(6)),
      message("b2", "bo", minute(12)),
      message("b3", "bo", minute(16))
    ])
  ).toEqual(["a2", "a3", "b3"])
})

it("starts again after a replies summary, anything between, or a new day", () => {
  expect(
    stackedIds([
      message("t1", "ada", minute(0), 2),
      message("t2", "ada", minute(1), 0),
      message("t3", "ada", minute(2), 3),
      message("t4", "ada", minute(3))
    ])
  ).toEqual([])
  expect(
    stackedIds([
      message("n1", "ada", minute(0)),
      { kind: "event", id: "e1", text: "Ada created a task" },
      message("n2", "ada", minute(1))
    ])
  ).toEqual([])
  expect(stackedIds([message("d1", "ada", new Date(2026, 8, 28, 23, 59)), message("d2", "ada", start)], true)).toEqual(
    []
  )
})

it("keeps a stacked message's author and time for assistive technology", () => {
  const view = render(() => (
    <Theme mode="light">
      <Timeline entries={[message("s1", "ada", minute(0)), message("s2", "ada", minute(1))]} />
    </Theme>
  ))
  const [first, second] = view.container.querySelectorAll("article")
  expect(first!.querySelector("time")).toBeVisible()
  expect(second).toHaveAttribute("data-continued")
  expect(second!.textContent).toContain("ada")
  expect(second!.querySelector("time")?.getAttribute("dateTime")).toBe(minute(1).toISOString())
})

it("offers a thread's opening message Reply in thread among its actions", () => {
  const open = vi.fn<(messageId: string) => void>()
  const view = render(() => (
    <Theme mode="light">
      <Timeline
        entries={[message("o1", "ada", minute(0), 0), message("o2", "bo", minute(1))]}
        activeId="o1"
        onOpenThread={open}
      />
    </Theme>
  ))
  const [opener, reply] = view.container.querySelectorAll("article")
  const actions = within(opener!).getByRole("group", { name: "Message actions" })
  const action = within(actions).getByRole("button", { name: "Reply in thread" })
  expect(action).toHaveAttribute("aria-expanded", "true")
  fireEvent.click(action)
  expect(open).toHaveBeenCalledWith("o1")
  // A message in a thread has nothing to reply in.
  expect(within(reply!).queryByRole("group", { name: "Message actions" })).toBeNull()
})

it("opens an agent's turn log from its reply's actions, with nothing noted under it", () => {
  const log = vi.fn<(turnId: string) => void>()
  const view = render(() => (
    <Theme mode="light">
      <Timeline entries={[{ ...message("r1", "yumi", minute(0)), turn: { id: "turn-1" } }]} onOpenTurnLog={log} />
    </Theme>
  ))
  const [reply] = view.container.querySelectorAll("article")
  const actions = within(reply!).getByRole("group", { name: "Message actions" })
  fireEvent.click(within(actions).getByRole("button", { name: "View turn log" }))
  expect(log).toHaveBeenCalledWith("turn-1")
  expect(reply!.textContent).not.toContain("Completed")
  // A tap focuses the message, showing its actions on touch screens.
  expect(reply).toHaveAttribute("tabindex", "-1")
})
