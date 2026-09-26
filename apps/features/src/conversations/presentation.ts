import { toDate, type Member, type Thread } from "@amends/client";
import { nameOf } from "../internal/names.ts";

export { initials } from "../internal/names.ts";

/** How a member appears: the name they chose here, else their identity. */
export const memberName = (member: Member.Record | undefined) =>
  member === undefined ? "Former member" : nameOf(member);
export type Author = ReturnType<typeof authorOf>;
/** The name and avatar kind of whoever wrote a message. */
export const authorOf = (
  author: Thread.Record["createdBy"],
  member: (memberId: string) => Member.Record | undefined,
) => {
  if (author._tag === "Contact") return { name: "Contact", kind: "contact" as const };
  const record = member(author.memberId);
  return {
    name: memberName(record),
    kind: record?.identity._tag === "Agent" ? ("agent" as const) : ("human" as const),
  };
};

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "long" });
const thisYear = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" });
const otherYear = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
/** When a message was published, as its header shows it. */
export const timeOf = (instant: Parameters<typeof toDate>[0]) => {
  const date = toDate(instant);
  return { datetime: date.toISOString(), text: clock.format(date), title: full.format(date) };
};
/** The local calendar day an instant falls on, to group entries under day seams. */
export const dayOf = (instant: Parameters<typeof toDate>[0]) =>
  startOfDay(toDate(instant)).getTime();
/** A day seam's label: today, yesterday, a weekday within the week, then the date. */
export const dayLabel = (day: number, now = new Date()) => {
  const days = Math.round((startOfDay(now).getTime() - day) / 86_400_000);
  const date = new Date(day);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return weekday.format(date);
  return (date.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(date);
};
/** When something came, as a list shows it: the time today, otherwise the day. */
export const whenOf = (instant: Parameters<typeof toDate>[0], now = new Date()) => {
  const time = timeOf(instant);
  const day = dayOf(instant);
  return { ...time, text: day === startOfDay(now).getTime() ? time.text : dayLabel(day, now) };
};
/** Who is typing, as a line: one or two names, or several people. */
export const typingText = (names: ReadonlyArray<string>) =>
  names.length === 0
    ? ""
    : names.length === 1
      ? `${names[0]} is typing…`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing…`
        : "Several people are typing…";
