import { ThreadMessage } from "@amends-dev/core/thread"
import { describe, expect, it } from "@effect/vitest"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import {
  bob,
  conversationWithBob,
  deleted,
  design,
  general,
  membership,
  opening,
  reply,
  saying,
  thread
} from "../test/fixtures.ts"
import {
  ageLabel,
  calendarDate,
  dayLabel,
  dayOf,
  expiryLabel,
  foldAccents,
  groupByDay,
  groupMark,
  initials,
  isOpen,
  messageRuns,
  messageWords,
  placeName,
  pluralize,
  repliesLabel,
  textRuns,
  threadContains,
  threadRuns,
  threadSubtitle,
  threadWords,
  timeOf,
  whenLabel
} from "./seen.ts"

describe("initials", () => {
  it("is the first letters of the first two words of a name, in capitals", () => {
    expect(initials("Alex Morgan")).toBe("AM")
    expect(initials("mary jane watson")).toBe("MJ")
    expect(initials("  Alex   Morgan ")).toBe("AM")
  })

  it("is the first letter of a name of one word", () => {
    expect(initials("Yumi")).toBe("Y")
    expect(initials("scout")).toBe("S")
  })

  it("is nothing for a name with no letters, and takes a whole character for the first of a word", () => {
    expect(initials("")).toBe("")
    expect(initials("   ")).toBe("")
    expect(initials("🦊 Fox")).toBe("🦊F")
  })
})

describe("where a group is", () => {
  const members = [membership.member, bob]
  const self = membership.member.id

  it("is marked by a team's #, and a conversation's other members' initials", () => {
    expect(groupMark(general, "General")).toBe("#")
    expect(groupMark(conversationWithBob, "Bob")).toBe("B")
    expect(groupMark(conversationWithBob, "Bob Ross, Alex Morgan")).toBe("BR")
  })

  it("is said as a line says it: a team as # and its name, a conversation by the others in it", () => {
    expect(placeName(design, members, self)).toBe("#Design")
    expect(placeName(conversationWithBob, members, self)).toBe("Bob")
  })

  it("is said by the side pane's subtitle as the thread in it, or only as a thread while the group is not read", () => {
    expect(threadSubtitle(Option.some(general), members, self)).toBe("Thread in #General")
    expect(threadSubtitle(Option.some(conversationWithBob), members, self)).toBe("Thread in Bob")
    expect(threadSubtitle(Option.none(), members, self)).toBe("Thread")
  })
})

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

/** The time `hour`:`minute` on a day by the clock of the machine the tests run on, so no time zone changes the day. */
const local = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  DateTime.makeUnsafe(new Date(year, month - 1, day, hour, minute))

/** `at` spelled with `options` the way the person's own locale spells it. */
const spelled = (at: DateTime.DateTime, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, options).format(DateTime.toEpochMillis(at))

/** A Monday afternoon. */
const now = local(2026, 10, 19, 14, 30)

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

/** Alice and bob, who a text can mention. */
const members = [membership.member, bob]

describe("textRuns", () => {
  const mentionOf = (member: typeof bob, label = member.name) => ThreadMessage.mentionText(member.id, label)

  it("is the words as written in one run, and no runs for none", () => {
    expect(textRuns("Let's grab some coffee", members)).toEqual([{ text: "Let's grab some coffee" }])
    expect(textRuns("", members)).toEqual([])
  })

  it("shows a mention as @ and the name the member has now, a chip among the words", () => {
    expect(textRuns(`Thanks ${mentionOf(bob, "Robert")}, see you there`, members)).toEqual([
      { text: "Thanks " },
      { text: "@Bob", isMention: true },
      { text: ", see you there" }
    ])
    expect(textRuns(`${mentionOf(membership.member)} and ${mentionOf(bob)}`, members)).toEqual([
      { text: "@Alice", isMention: true },
      { text: " and " },
      { text: "@Bob", isMention: true }
    ])
  })

  it("shows a mention of someone who is not among the members by the name it recorded", () => {
    expect(textRuns(`${mentionOf(bob, "Robert")} let's grab coffee`, [membership.member])).toEqual([
      { text: "@Robert", isMention: true },
      { text: " let's grab coffee" }
    ])
  })

  it("leaves the rest of the markdown as written", () => {
    expect(textRuns("*Ship* it, [the notes](https://example.com)", members)).toEqual([
      { text: "*Ship* it, [the notes](https://example.com)" }
    ])
  })
})

describe("messageRuns", () => {
  it("is the runs of what a message says, a mention as the name its member has now", () => {
    const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

    expect(messageRuns(asked, members)).toEqual([{ text: "@Bob", isMention: true }, { text: " can you check this?" }])
    expect(messageRuns(reply, members)).toEqual([{ text: "Sounds good" }])
  })

  it("is one run saying a deleted message was deleted", () => {
    expect(messageRuns(deleted(reply), members)).toEqual([{ text: "This message was deleted." }])
  })
})

describe("messageWords", () => {
  it("is the words of what a message says in one line, a mention as the name its member has now", () => {
    const asked = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Robert")}, look`)

    expect(messageWords(asked, members)).toBe("Hey @Bob, look")
    expect(messageWords(reply, members)).toBe("Sounds good")
  })

  it("is the name a mention recorded while its member is not among the members", () => {
    const asked = saying(opening, `Hey ${ThreadMessage.mentionText(bob.id, "Robert")}, look`)

    expect(messageWords(asked, [membership.member])).toBe("Hey @Robert, look")
  })

  it("says a deleted message was deleted", () => {
    expect(messageWords(deleted(reply), members)).toBe("This message was deleted.")
  })
})

describe("threadRuns", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

  it("is the title as one run when the thread has one", () => {
    expect(threadRuns({ ...thread, title: "Retro" }, Option.some(asked), members)).toEqual([{ text: "Retro" }])
  })

  it("is the runs of the opening without a title, and A thread while the opening is not read", () => {
    expect(threadRuns(thread, Option.some(asked), members)).toEqual([
      { text: "@Bob", isMention: true },
      { text: " can you check this?" }
    ])
    expect(threadRuns(thread, Option.none(), members)).toEqual([{ text: "A thread" }])
  })
})

describe("threadWords", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check this?`)

  it("is the title when the thread has one, and the words of the opening without, with a mention as its member's name", () => {
    expect(threadWords({ ...thread, title: "Retro" }, Option.some(asked), members)).toBe("Retro")
    expect(threadWords(thread, Option.some(asked), members)).toBe("@Bob can you check this?")
  })

  it("is A thread while the opening is not read", () => {
    expect(threadWords(thread, Option.none(), members)).toBe("A thread")
  })
})

describe("threadContains", () => {
  const asked = saying(opening, `${ThreadMessage.mentionText(bob.id, "Robert")} can you check the café menu?`)
  const contains = (query: string, titled: string | null = null) =>
    threadContains({ ...thread, title: titled }, Option.some(asked), members, query)

  it("is whether the title has the letters, or the opening's words do, in any case and whatever the accents", () => {
    expect(contains("RETRO", "Retro")).toBe(true)
    expect(contains("check")).toBe(true)
    expect(contains("CAFE")).toBe(true)
    expect(contains("retro")).toBe(false)
  })

  it("finds a title and an opening alike, as the person reads the opening's mention: the member's current name", () => {
    expect(contains("retro", "Retro")).toBe(true)
    expect(contains("check", "Retro")).toBe(true)
    expect(contains("@bob")).toBe(true)
    expect(contains("robert")).toBe(false)
  })

  it("leaves out the spaces around the letters, and keeps every thread for none", () => {
    expect(contains("  menu ")).toBe(true)
    expect(contains("")).toBe(true)
    expect(contains("   ")).toBe(true)
    expect(contains("  nothing like it ")).toBe(false)
  })

  it("has no words to find while the opening is not read and the thread has no title", () => {
    expect(threadContains(thread, Option.none(), members, "check")).toBe(false)
    expect(threadContains(thread, Option.none(), members, "")).toBe(true)
    expect(threadContains({ ...thread, title: "Retro" }, Option.none(), members, "retro")).toBe(true)
  })
})

describe("isOpen", () => {
  it("is true for a task that is not done or dismissed, and false for one that is", () => {
    expect((["triage", "todo", "doing", "held"] as const).map(isOpen)).toEqual([true, true, true, true])
    expect((["done", "dismissed"] as const).map(isOpen)).toEqual([false, false])
  })
})

describe("pluralize", () => {
  it("says the count with the singular for one, and with the plural for any other number", () => {
    expect(pluralize(1, "member", "members")).toBe("1 member")
    expect(pluralize(0, "member", "members")).toBe("0 members")
    expect(pluralize(12, "member", "members")).toBe("12 members")
    expect(pluralize(2, "reply", "replies")).toBe("2 replies")
  })
})

describe("repliesLabel", () => {
  it("says 1 reply for one, and the number of replies for any other number", () => {
    expect(repliesLabel(1)).toBe("1 reply")
    expect(repliesLabel(2)).toBe("2 replies")
    expect(repliesLabel(12)).toBe("12 replies")
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

describe("foldAccents", () => {
  it("is the text in lower case with its accents taken off", () => {
    expect(foldAccents("José Ñandú")).toBe("jose nandu")
    expect(foldAccents("ZOË")).toBe("zoe")
    expect(foldAccents("plain")).toBe("plain")
  })
})
