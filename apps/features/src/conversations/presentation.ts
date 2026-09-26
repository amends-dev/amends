import { toDate, type Member, type Thread } from "@amends/client";

/** How a member appears: their identity until profiles exist. */
export const memberName = (member: Member.Record | undefined) =>
  member?.identity.id ?? "Former member";
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const first = (text: string, count: number) =>
  Array.from(graphemes.segment(text), (part) => part.segment).slice(0, count);
/** One or two initials from a name, for an avatar. */
export const initials = (name: string) => {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters =
    words.length > 1 ? [...first(words[0]!, 1), ...first(words[1]!, 1)] : first(words[0] ?? "?", 2);
  return letters.join("").toLocaleUpperCase();
};
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
