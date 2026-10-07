import { describe, expect, it } from "@effect/vitest";
import { TurnPrompt } from "../../src/turn/prompt.ts";

const ada = (text: string): TurnPrompt.Input => ({ author: "Ada", own: false, text });
const kai = (text: string): TurnPrompt.Input => ({ author: "Kai", own: false, text });
const agent = (text: string): TurnPrompt.Input => ({ author: "Reviewer", own: true, text });

describe("a turn's prompt", () => {
  it("names each message by its author, leaving out the agent's own", () => {
    const prompt = TurnPrompt.promptOf(
      [ada("Can you review this?"), agent("On it."), kai("Mine too, please.")],
      undefined,
    );

    expect(prompt).toEqual(["Ada: Can you review this?", "Kai: Mine too, please."]);
  });

  it("tells the agent who asked it to try again", () => {
    expect(TurnPrompt.promptOf([ada("Review this.")], "Kai")).toEqual([
      "Ada: Review this.",
      "Kai asked you to try that again.",
    ]);
    expect(TurnPrompt.promptOf([], "Kai")).toEqual(["Kai asked you to try that again."]);
  });

  it("is nothing when there is nothing to say", () => {
    expect(TurnPrompt.promptOf([], undefined)).toBeUndefined();
    expect(TurnPrompt.promptOf([agent("Done.")], undefined)).toBeUndefined();
  });
});

describe("the conversation an agent joins", () => {
  it("has others' messages as the user's and the agent's own as its answers, sides alternating", () => {
    const conversation = TurnPrompt.conversationOf([
      ada("Hello."),
      kai("Hi all."),
      agent("Hello, both."),
      agent("What do you need?"),
      ada("A review."),
    ]);

    expect(conversation).toEqual([
      { role: "user", texts: ["Ada: Hello.", "Kai: Hi all."] },
      { role: "assistant", texts: ["Hello, both.", "What do you need?"] },
      { role: "user", texts: ["Ada: A review."] },
    ]);
    expect(TurnPrompt.conversationOf([])).toEqual([]);
  });
});
