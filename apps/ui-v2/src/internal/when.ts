// How screens word times, days, and who is typing.
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

/** Such as "10:02 AM". */
export const clockTime = (at: Date) => clock.format(at);
/** Such as "Sunday, September 27, 2026 at 10:02 AM", for a tooltip. */
export const fullTime = (at: Date) => full.format(at);
/** The local calendar day, to group entries under day seams. */
export const dayOf = (at: Date) => startOfDay(at).getTime();
/** Today, yesterday, a weekday within the week, then the date. */
export function dayLabel(day: number, now = new Date()) {
  const days = Math.round((startOfDay(now).getTime() - day) / 86_400_000);
  const date = new Date(day);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return weekday.format(date);
  return (date.getFullYear() === now.getFullYear() ? thisYear : otherYear).format(date);
}
/** The time today, otherwise the day. */
export const whenLabel = (at: Date, now = new Date()) =>
  dayOf(at) === dayOf(now) ? clockTime(at) : dayLabel(dayOf(at), now);
/** One or two names, or several people. Empty when nobody is typing. */
export function typingText(names: readonly string[]) {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}
