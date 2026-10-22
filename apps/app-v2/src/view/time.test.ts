import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import {
  ageLabel,
  calendarDate,
  dayLabel,
  dayOf,
  expiryInDaysLabel,
  expiryLabel,
  fullTimeOf,
  groupByDay,
  shortTimeOf,
  timeOf,
  whenLabel
} from "./time.ts"

/** The time `hour`:`minute` on a day by the clock of the machine the tests run on, so no time zone changes the day. */
const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  DateTime.makeUnsafe(new Date(year, month - 1, day, hour, minute))

/** `at` spelled with `options` the way the person's own locale spells it. */
const spelled = (at: DateTime.DateTime, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(DateTime.toEpochMillis(at))

/** A Monday afternoon. */
const now = local(2026, 10, 19, 14, 30)

describe("timeOf", () => {
  it("is the time of day, with hours and minutes only", () => {
    const time = timeOf(DateTime.makeUnsafe("2026-10-18T12:05:00Z"))

    expect(time).toMatch(/^\d{1,2}:\d{2}(\s?[AP]M)?$/i)
    expect(time).not.toMatch(/2026|Oct/)
  })

  it("tells times five minutes apart apart", () => {
    expect(timeOf(DateTime.makeUnsafe("2026-10-18T12:05:00Z"))).not.toBe(
      timeOf(DateTime.makeUnsafe("2026-10-18T12:10:00Z"))
    )
  })
})

describe("fullTimeOf", () => {
  it("is the weekday, the date with its year, and the time of day, for a tooltip", () => {
    const time = fullTimeOf(local(2026, 10, 18, 10, 2))

    expect(time).toMatch(/Sunday/)
    expect(time).toMatch(/October 18, 2026/)
    expect(time).toContain(timeOf(local(2026, 10, 18, 10, 2)))
  })
})

describe("dayOf", () => {
  it("is the start of the day by the person's own clock, the same for every time of that day", () => {
    const start = DateTime.toEpochMillis(local(2026, 10, 19, 0, 0))

    expect(DateTime.toEpochMillis(dayOf(local(2026, 10, 19, 0, 0)))).toBe(start)
    expect(DateTime.toEpochMillis(dayOf(local(2026, 10, 19, 14, 30)))).toBe(start)
    expect(DateTime.toEpochMillis(dayOf(local(2026, 10, 19, 23, 59)))).toBe(start)
  })

  it("tells the days either side of midnight apart", () => {
    expect(DateTime.toEpochMillis(dayOf(local(2026, 10, 19, 0, 1)))).not.toBe(
      DateTime.toEpochMillis(dayOf(local(2026, 10, 18, 23, 59)))
    )
  })
})

describe("dayLabel", () => {
  const labelOf = (at: DateTime.DateTime) => dayLabel(dayOf(at), now)

  it("is Today for the day of now, and for a later one, which a clock a little ahead can record", () => {
    expect(labelOf(local(2026, 10, 19, 0, 5))).toBe("Today")
    expect(labelOf(now)).toBe("Today")
    expect(labelOf(local(2026, 10, 19, 23, 59))).toBe("Today")
    expect(labelOf(local(2026, 10, 20, 0, 5))).toBe("Today")
  })

  it("is Yesterday for the day before, from either side of midnight", () => {
    expect(labelOf(local(2026, 10, 18, 23, 59))).toBe("Yesterday")
    expect(dayLabel(dayOf(local(2026, 10, 18, 23, 59)), local(2026, 10, 19, 0, 1))).toBe("Yesterday")
  })

  it("is the weekday's name, in full, for each of the five days before that", () => {
    const days = [17, 16, 15, 14, 13]
    const labels = days.map((day) => labelOf(local(2026, 10, day)))

    expect(labels).toEqual(days.map((day) => spelled(local(2026, 10, day), { weekday: "long" })))
    expect(new Set(labels).size).toBe(5)
    expect(labels.join("")).not.toMatch(/\d/)
  })

  it("is the date from a week before, which the weekday's name would not tell from today's, without this year", () => {
    const label = labelOf(local(2026, 10, 12))

    expect(label).toBe(spelled(local(2026, 10, 12), { month: "long", day: "numeric" }))
    expect(label).toContain("12")
    expect(label).not.toContain("2026")
  })

  it("has the year of another one on the date", () => {
    const label = labelOf(local(2025, 12, 25))

    expect(label).toBe(spelled(local(2025, 12, 25), { year: "numeric", month: "long", day: "numeric" }))
    expect(label).toContain("2025")
  })
})

describe("groupByDay", () => {
  const at = (item: DateTime.DateTime) => item
  const today = local(2026, 10, 19, 9, 0)
  const todayLater = local(2026, 10, 19, 13, 0)
  const yesterday = local(2026, 10, 18, 22, 0)
  const lastWeek = local(2026, 10, 9, 8, 0)

  it("makes a day of each run of items that fell on one, named from now, in the order given", () => {
    const days = groupByDay([todayLater, today, yesterday, lastWeek], at, now)

    expect(days.map(({ label }) => label)).toEqual(["Today", "Yesterday", dayLabel(dayOf(lastWeek), now)])
    expect(days.map(({ items }) => items)).toEqual([[todayLater, today], [yesterday], [lastWeek]])
  })

  it("makes a day of its own for a day that comes round again, since it groups the order it is given", () => {
    expect(groupByDay([today, yesterday, todayLater], at, now).map(({ label }) => label)).toEqual([
      "Today",
      "Yesterday",
      "Today"
    ])
  })

  it("makes no day of no items", () => {
    expect(groupByDay([], at, now)).toEqual([])
  })
})

describe("whenLabel", () => {
  it("is the time of day for a time today, from the start of the day to a later one a clock a little ahead can record", () => {
    expect(whenLabel(local(2026, 10, 19, 0, 5), now)).toBe(timeOf(local(2026, 10, 19, 0, 5)))
    expect(whenLabel(local(2026, 10, 19, 9, 41), now)).toBe(timeOf(local(2026, 10, 19, 9, 41)))
    expect(whenLabel(now, now)).toBe(timeOf(now))
    expect(whenLabel(local(2026, 10, 20, 0, 5), now)).toBe(timeOf(local(2026, 10, 20, 0, 5)))
  })

  it("is Yesterday for any time of the day before, from either side of midnight", () => {
    expect(whenLabel(local(2026, 10, 18, 23, 59), now)).toBe("Yesterday")
    expect(whenLabel(local(2026, 10, 18, 0, 0), now)).toBe("Yesterday")
    expect(whenLabel(local(2026, 10, 18, 23, 59), local(2026, 10, 19, 0, 1))).toBe("Yesterday")
  })

  it("is the weekday's name, in full, within the six days before, and the date after that", () => {
    expect(whenLabel(local(2026, 10, 15, 9, 0), now)).toBe(spelled(local(2026, 10, 15), { weekday: "long" }))
    expect(whenLabel(local(2026, 10, 12, 9, 0), now)).toBe(
      spelled(local(2026, 10, 12), { month: "long", day: "numeric" })
    )
    expect(whenLabel(local(2025, 12, 25, 9, 0), now)).toBe(
      spelled(local(2025, 12, 25), { year: "numeric", month: "long", day: "numeric" })
    )
  })
})

describe("shortTimeOf", () => {
  it("is the time of day without AM or PM, as timeOf says it otherwise", () => {
    const at = DateTime.makeUnsafe("2026-10-18T12:05:00Z")

    expect(shortTimeOf(at)).toMatch(/^\d{1,2}:\d{2}$/)
    expect(timeOf(at).startsWith(shortTimeOf(at))).toBe(true)
  })

  it("tells times five minutes apart apart", () => {
    expect(shortTimeOf(DateTime.makeUnsafe("2026-10-18T12:05:00Z"))).not.toBe(
      shortTimeOf(DateTime.makeUnsafe("2026-10-18T12:10:00Z"))
    )
  })
})

describe("ageLabel", () => {
  const ago = (parts: Partial<DateTime.DateTime.PartsForMath>) => ageLabel(DateTime.subtract(now, parts), now)

  it("is Just now under a minute, and for a time after now", () => {
    expect(ageLabel(now, now)).toBe("Just now")
    expect(ago({ seconds: 59 })).toBe("Just now")
    expect(ageLabel(DateTime.add(now, { minutes: 1 }), now)).toBe("Just now")
  })

  it("is the whole minutes under an hour, across midnight too", () => {
    expect(ago({ minutes: 1 })).toBe("1m ago")
    expect(ago({ minutes: 12 })).toBe("12m ago")
    expect(ago({ minutes: 59, seconds: 59 })).toBe("59m ago")
    expect(ageLabel(local(2026, 10, 18, 23, 50), local(2026, 10, 19, 0, 10))).toBe("20m ago")
  })

  it("is the whole hours within the day", () => {
    expect(ago({ hours: 1 })).toBe("1h ago")
    expect(ago({ hours: 3, minutes: 45 })).toBe("3h ago")
    expect(ageLabel(local(2026, 10, 19, 0, 0), now)).toBe("14h ago")
  })

  it("is Yesterday for any time of the day before, an hour or more ago, even a few hours back", () => {
    expect(ageLabel(local(2026, 10, 18, 22, 0), local(2026, 10, 19, 0, 30))).toBe("Yesterday")
    expect(ageLabel(local(2026, 10, 18, 0, 0), now)).toBe("Yesterday")
  })

  it("is the weekday's name, short, for each of the five days before that", () => {
    expect(ageLabel(local(2026, 10, 17, 9, 0), now)).toBe(spelled(local(2026, 10, 17), { weekday: "short" }))
    expect(ageLabel(local(2026, 10, 13, 23, 0), now)).toBe(spelled(local(2026, 10, 13), { weekday: "short" }))
  })

  it("is the short date after that, with the year only when it is not this one", () => {
    const thisYear = ageLabel(local(2026, 9, 20, 9, 0), now)
    const lastYear = ageLabel(local(2025, 9, 20, 9, 0), now)

    expect(thisYear).toBe(spelled(local(2026, 9, 20), { month: "short", day: "numeric" }))
    expect(thisYear).not.toContain("2026")
    expect(lastYear).toBe(spelled(local(2025, 9, 20), { year: "numeric", month: "short", day: "numeric" }))
    expect(lastYear).toContain("2025")
  })
})

describe("calendarDate", () => {
  it("is the day with its month and year, by the person's own clock, whatever the hour or how far back it was", () => {
    const dateOf = (at: DateTime.DateTime) => spelled(at, { month: "short", day: "numeric", year: "numeric" })

    expect(calendarDate(local(2026, 10, 6, 0, 5))).toBe(dateOf(local(2026, 10, 6, 0, 5)))
    expect(calendarDate(local(2026, 10, 6, 23, 59))).toBe(calendarDate(local(2026, 10, 6, 0, 5)))
    expect(calendarDate(local(2026, 10, 6, 12, 0))).toContain("2026")
    expect(calendarDate(local(2024, 2, 29, 12, 0))).toContain("2024")
    expect(calendarDate(local(2026, 10, 7, 0, 5))).not.toBe(calendarDate(local(2026, 10, 6, 23, 59)))
  })
})

describe("expiryLabel", () => {
  const after = (parts: Partial<DateTime.DateTime.PartsForMath>) => expiryLabel(DateTime.add(now, parts), now)

  it("is Expired once the time has come, and for one that came before", () => {
    expect(expiryLabel(now, now)).toBe("Expired")
    expect(expiryLabel(DateTime.subtract(now, { seconds: 1 }), now)).toBe("Expired")
    expect(expiryLabel(DateTime.subtract(now, { days: 3 }), now)).toBe("Expired")
  })

  it("is the hours left, rounded up and at least one, while less than a day is left", () => {
    expect(after({ seconds: 1 })).toBe("Expires in 1 hour")
    expect(after({ minutes: 30 })).toBe("Expires in 1 hour")
    expect(after({ hours: 5 })).toBe("Expires in 5 hours")
    expect(after({ hours: 12, minutes: 30 })).toBe("Expires in 13 hours")
    expect(after({ hours: 23, minutes: 59 })).toBe("Expires in 24 hours")
  })

  it("counts the hours from a minute after now, which the app's time may be behind by", () => {
    expect(after({ hours: 1, minutes: 1 })).toBe("Expires in 1 hour")
    expect(after({ hours: 1, minutes: 2 })).toBe("Expires in 2 hours")
    expect(after({ hours: 5, minutes: 1 })).toBe("Expires in 5 hours")
    expect(after({ hours: 5, minutes: 2 })).toBe("Expires in 6 hours")
  })

  it("is tomorrow at one day, and the hours until then, and the days after it, either side of it", () => {
    expect(after({ days: 1 })).toBe("Expires in 24 hours")
    expect(after({ days: 1, minutes: 1 })).toBe("Expires tomorrow")
    expect(after({ days: 1, minutes: 1, seconds: 1 })).toBe("Expires in 2 days")
  })

  it("is the days left rounded up, from two to thirty, so that an invitation just made for a week says seven", () => {
    expect(after({ days: 2 })).toBe("Expires in 2 days")
    expect(after({ days: 3 })).toBe("Expires in 3 days")
    expect(after({ days: 6, hours: 12 })).toBe("Expires in 7 days")
    expect(after({ days: 7 })).toBe("Expires in 7 days")
    expect(after({ days: 7, seconds: 50 })).toBe("Expires in 7 days")
    expect(after({ days: 7, minutes: 2 })).toBe("Expires in 8 days")
    expect(after({ days: 29, hours: 6 })).toBe("Expires in 30 days")
    expect(after({ days: 30 })).toBe("Expires in 30 days")
    expect(after({ days: 30, minutes: 1 })).toBe("Expires in 30 days")
  })

  it("is the date once more than thirty days are left", () => {
    const dateOf = (at: DateTime.DateTime) => spelled(at, { month: "short", day: "numeric", year: "numeric" })
    const justBeyond = DateTime.add(now, { days: 30, minutes: 1, seconds: 1 })
    const far = DateTime.add(now, { days: 45 })

    expect(expiryLabel(justBeyond, now)).toBe(`Expires ${dateOf(justBeyond)}`)
    expect(expiryLabel(far, now)).toBe(`Expires ${dateOf(far)}`)
    expect(expiryLabel(far, now)).toContain("2026")
  })
})

describe("expiryInDaysLabel", () => {
  const after = (parts: Partial<DateTime.DateTime.PartsForMath>) => expiryInDaysLabel(DateTime.add(now, parts), now)

  it("is Expired once the time has come, and for one that came before", () => {
    expect(expiryInDaysLabel(now, now)).toBe("Expired")
    expect(expiryInDaysLabel(DateTime.subtract(now, { seconds: 1 }), now)).toBe("Expired")
    expect(expiryInDaysLabel(DateTime.subtract(now, { days: 3 }), now)).toBe("Expired")
  })

  it("is a day, the singular, for as little as is left of the last one", () => {
    expect(after({ seconds: 1 })).toBe("Expires in 1 day")
    expect(after({ hours: 3, minutes: 45 })).toBe("Expires in 1 day")
    expect(after({ hours: 23, minutes: 59 })).toBe("Expires in 1 day")
    expect(after({ days: 1 })).toBe("Expires in 1 day")
  })

  it("is the days left rounded up, so that an invitation just made for a week says seven", () => {
    expect(after({ days: 1, minutes: 2 })).toBe("Expires in 2 days")
    expect(after({ days: 3 })).toBe("Expires in 3 days")
    expect(after({ days: 6, hours: 23, minutes: 59 })).toBe("Expires in 7 days")
    expect(after({ days: 6, hours: 12 })).toBe("Expires in 7 days")
    expect(after({ days: 7 })).toBe("Expires in 7 days")
    // The app's time now is read once a minute, so an invitation made since it was read ends a little after a week.
    expect(after({ days: 7, seconds: 50 })).toBe("Expires in 7 days")
    expect(after({ days: 7, minutes: 2 })).toBe("Expires in 8 days")
    expect(after({ days: 45 })).toBe("Expires in 45 days")
  })
})
