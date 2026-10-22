/** Local dates, times, and day groups for display. */

import * as Array from "effect/Array"
import * as DateTime from "effect/DateTime"
import { pluralize } from "./counts.ts"

/** The time of day `dateTime` was, in the person's own time zone, as they read it: "10:02 AM". */
export const timeOf = (dateTime: DateTime.DateTime): string =>
  DateTime.formatLocal(dateTime, { hour: "numeric", minute: "2-digit" })

const clock = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })

/**
 * The time of day `dateTime` was, in the person's own time zone, without AM or PM, where there is little room: "10:02".
 */
export const shortTimeOf = (dateTime: DateTime.DateTime): string =>
  clock
    .formatToParts(DateTime.toDateUtc(dateTime))
    .filter(({ type }) => type !== "dayPeriod")
    .map(({ value }) => value)
    .join("")
    .trim()

/** The day and time `dateTime` was, with the weekday, as a tooltip names it: "Sunday, October 18, 2026 at 10:02 AM". */
export const fullTimeOf = (dateTime: DateTime.DateTime): string =>
  DateTime.formatLocal(dateTime, { dateStyle: "full", timeStyle: "short" })

const millisPerMinute = 60_000

const millisPerHour = 3_600_000

const millisPerDay = 86_400_000

/** The start of the day `at` fell on, in the person's own time zone, to group times by. */
export const dayOf = (at: DateTime.DateTime): DateTime.Zoned =>
  DateTime.startOf(DateTime.setZone(at, DateTime.zoneMakeLocal()), "day")

/** How many days before the day `today` the day `day` is, which a day with 23 or 25 hours does not change. */
const daysBefore = (day: DateTime.Zoned, today: DateTime.Zoned): number =>
  Math.round((DateTime.toEpochMillis(today) - DateTime.toEpochMillis(day)) / millisPerDay)

/**
 * `day` as the person reads it from `today`: "Today", "Yesterday", the weekday's name within the six days before,
 * then the date, with the year when it is not this one. `style` is how long the weekday and the month are spelled.
 */
const readDay = (day: DateTime.Zoned, today: DateTime.Zoned, style: "long" | "short"): string => {
  const daysAgo = daysBefore(day, today)
  if (daysAgo <= 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  if (daysAgo <= 6) return DateTime.formatLocal(day, { weekday: style })
  const isThisYear = DateTime.toParts(day).year === DateTime.toParts(today).year
  return DateTime.formatLocal(day, { month: style, day: "numeric", year: isThisYear ? undefined : "numeric" })
}

/** The day `day` began, as a divider names it from `now`: "Today", "Yesterday", "Tuesday", "September 20". */
export const dayLabel = (day: DateTime.Zoned, now: DateTime.DateTime): string => readDay(day, dayOf(now), "long")

/** The things that happened on one local day, under what that day is called. */
export type Day<Item> = Readonly<{ label: string; items: ReadonlyArray<Item> }>

/**
 * `items`, in the order given, as the days they happened on by the person's own clock, each named as it is from
 * `now`: "Today", "Yesterday", a weekday, or a date. `happenedAt` says when an item happened.
 */
export const groupByDay = <Item>(
  items: ReadonlyArray<Item>,
  happenedAt: (item: Item) => DateTime.DateTime,
  now: DateTime.DateTime
): ReadonlyArray<Day<Item>> => {
  const dated = items.map((item) => ({ item, day: dayOf(happenedAt(item)) }))

  return Array.isReadonlyArrayNonEmpty(dated)
    ? Array.groupWith(dated, (a, b) => DateTime.Equivalence(a.day, b.day)).map((run) => ({
        label: dayLabel(run[0].day, now),
        items: run.map(({ item }) => item)
      }))
    : []
}

/**
 * When `at` was, as a message shows it: its time of day when it was today, as "9:41 AM", otherwise the name
 * of its day from `now`, as `dayLabel` gives it: "Yesterday", "Tuesday", "September 20".
 */
export const whenLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const day = dayOf(at)
  return daysBefore(day, dayOf(now)) <= 0 ? timeOf(at) : dayLabel(day, now)
}

/**
 * How long before `now` it was `at`: "Just now", "12m ago", and "3h ago" within the day, then, by the day,
 * "Yesterday", "Tue", and "Sep 20", with the year when it is not this one.
 */
export const ageLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const elapsed = DateTime.toEpochMillis(now) - DateTime.toEpochMillis(at)
  if (elapsed < millisPerMinute) return "Just now"
  if (elapsed < millisPerHour) return `${Math.floor(elapsed / millisPerMinute)}m ago`
  const day = dayOf(at)
  const today = dayOf(now)
  return daysBefore(day, today) <= 0 ? `${Math.floor(elapsed / millisPerHour)}h ago` : readDay(day, today, "short")
}

/** The day `at` fell on, by the person's own clock, with its year, as a record says when it was made: "Oct 6, 2026". */
export const calendarDate = (at: DateTime.DateTime): string =>
  DateTime.formatLocal(at, { month: "short", day: "numeric", year: "numeric" })

/**
 * How long the app's time now may be behind the clock: the root reads the time once a minute, so an invitation the host
 * made a moment ago can end a week and some seconds after the time the app holds.
 */
const clockLag = millisPerMinute

/** How long is left until `at` by the app's time `now`, and what is left once its lag of a minute is counted. */
const timeLeft = (at: DateTime.DateTime, now: DateTime.DateTime): Readonly<{ remaining: number; counted: number }> => {
  const remaining = DateTime.toEpochMillis(at) - DateTime.toEpochMillis(now)
  return { remaining, counted: remaining - clockLag }
}

/**
 * How long after `now` it will be `at`, as the member settings say when an invitation closes, as `apps/ui` says it:
 * "Expires in 7 days", by the days left rounded up, and so at least one, so that an invitation made for a week reads
 * seven until a day of it has passed, and "Expired" once `at` has come. The days are counted from a minute after `now`,
 * which the app's time may be behind by.
 */
export const expiryInDaysLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const { remaining, counted } = timeLeft(at, now)
  const days = Math.max(1, Math.ceil(counted / millisPerDay))
  return remaining <= 0 ? "Expired" : `Expires in ${pluralize(days, "day", "days")}`
}

/** The most days an invitation's end is told in days, as `apps/ui` tells it; a later end is told by its date. */
const mostDaysToldInDays = 30

/**
 * How long after `now` it will be `at`, as the workspace list says when an invitation closes, as `apps/ui` says it: in
 * hours, rounded up and at least one, while less than a day is left ("Expires in 5 hours"), "Expires tomorrow" once
 * the days left, rounded up, are one, "Expires in 3 days" up to thirty days, the date after that ("Expires Oct 6,
 * 2026"), and "Expired" once `at` has come. What is left is counted from a minute after `now`, which the app's time
 * may be behind by, so that an invitation made for a week reads seven days until a day of it has passed.
 */
export const expiryLabel = (at: DateTime.DateTime, now: DateTime.DateTime): string => {
  const { remaining, counted } = timeLeft(at, now)

  if (remaining <= 0) {
    return "Expired"
  }

  if (counted < millisPerDay) {
    return `Expires in ${pluralize(Math.max(1, Math.ceil(counted / millisPerHour)), "hour", "hours")}`
  }

  if (counted > mostDaysToldInDays * millisPerDay) {
    return `Expires ${calendarDate(at)}`
  }

  const days = Math.ceil(counted / millisPerDay)
  return days === 1 ? "Expires tomorrow" : `Expires in ${pluralize(days, "day", "days")}`
}
