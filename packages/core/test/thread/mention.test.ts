import { describe, expect, it } from "@effect/vitest"
import * as ThreadMessage from "../../src/thread/ThreadMessage.ts"
import * as MemberId from "../../src/workspace/MemberId.ts"

it("writes a mention as a link to the member, labelled with their name", () => {
  expect(ThreadMessage.mentionText("m-1", "Ada Lovelace")).toBe("[@Ada Lovelace](member:m-1)")
  expect(ThreadMessage.mentionText("a b/c", "[x]*_y`~<\\")).toBe("[@\\[x\\]\\*\\_y\\`\\~\\<\\\\](member:a%20b%2Fc)")
})

it("finds the members a text mentions, each once, in order", () => {
  const ada = ThreadMessage.mentionText("ada", "Ada")
  const odd = ThreadMessage.mentionText("a b", "[Odd] *name*")
  expect(ThreadMessage.mentionedIn(`${odd} and ${ada}, then ${ada} again`)).toEqual(["a b", "ada"])
  expect(ThreadMessage.mentionedIn("@Ada, [Ada](member:ada), [@Ada](https://x)")).toEqual([])
  expect(ThreadMessage.mentionedIn("[@Bad](member:%E0%A4%A)")).toEqual([])
})

describe("parts", () => {
  const text = (words: string) => ThreadMessage.Part.cases.Text.make({ text: words })
  const mention = (memberId: string, label: string) =>
    ThreadMessage.Part.cases.Mention.make({ memberId: MemberId.MemberId.make(memberId), label })

  it("is one run of text for words with no mention, and no runs for none", () => {
    expect(ThreadMessage.parts("Let's grab some coffee")).toEqual([text("Let's grab some coffee")])
    expect(ThreadMessage.parts("@Ada, [Ada](member:ada), [@Ada](https://x)")).toEqual([
      text("@Ada, [Ada](member:ada), [@Ada](https://x)")
    ])
    expect(ThreadMessage.parts("")).toEqual([])
  })

  it("is the mention and the text after it for a mention at the start", () => {
    expect(ThreadMessage.parts(`${ThreadMessage.mentionText("m-1", "Caleb")} Let's grab some coffee`)).toEqual([
      mention("m-1", "Caleb"),
      text(" Let's grab some coffee")
    ])
  })

  it("is the text before and after for a mention in the middle", () => {
    expect(ThreadMessage.parts(`Thanks ${ThreadMessage.mentionText("m-1", "Ada Lovelace")}, see you there`)).toEqual([
      text("Thanks "),
      mention("m-1", "Ada Lovelace"),
      text(", see you there")
    ])
  })

  it("is the text before and the mention for a mention at the end", () => {
    expect(ThreadMessage.parts(`Can you check ${ThreadMessage.mentionText("m-1", "Jamie")}`)).toEqual([
      text("Can you check "),
      mention("m-1", "Jamie")
    ])
  })

  it("is the mention alone for a text that is one", () => {
    expect(ThreadMessage.parts(ThreadMessage.mentionText("m-1", "Jamie"))).toEqual([mention("m-1", "Jamie")])
  })

  it("is each mention in order, with the text between them as one run, and none between two that touch", () => {
    const ada = ThreadMessage.mentionText("ada", "Ada")
    const bob = ThreadMessage.mentionText("bob", "Bob")

    expect(ThreadMessage.parts(`${ada} and ${bob}, then ${ada} again`)).toEqual([
      mention("ada", "Ada"),
      text(" and "),
      mention("bob", "Bob"),
      text(", then "),
      mention("ada", "Ada"),
      text(" again")
    ])
    expect(ThreadMessage.parts(`${ada}${bob}`)).toEqual([mention("ada", "Ada"), mention("bob", "Bob")])
  })

  it("reads a label as the name that was written, and an id as the member's", () => {
    expect(ThreadMessage.parts("[@A\\]B](member:x)")).toEqual([mention("x", "A]B")])
    expect(ThreadMessage.parts(ThreadMessage.mentionText("a b/c", "[x]*_y`~<\\"))).toEqual([
      mention("a b/c", "[x]*_y`~<\\")
    ])
  })

  it("keeps a link whose id does not decode as text, in one run with the words around it", () => {
    const ada = ThreadMessage.mentionText("ada", "Ada")

    expect(ThreadMessage.parts("[@Bad](member:%E0%A4%A)")).toEqual([text("[@Bad](member:%E0%A4%A)")])
    expect(ThreadMessage.parts(`Hi [@Bad](member:%E0%A4%A) and ${ada}, bye`)).toEqual([
      text("Hi [@Bad](member:%E0%A4%A) and "),
      mention("ada", "Ada"),
      text(", bye")
    ])
  })

  it("mentions the members mentionedIn finds", () => {
    const odd = ThreadMessage.mentionText("a b", "[Odd] *name*")
    const written = `[@Bad](member:%E0%A4%A) ${odd} and ${ThreadMessage.mentionText("ada", "Ada")}`

    expect(
      ThreadMessage.parts(written).flatMap((part) =>
        ThreadMessage.Part.isAnyOf(["Mention"])(part) ? [part.memberId] : []
      )
    ).toEqual(ThreadMessage.mentionedIn(written))
  })
})
