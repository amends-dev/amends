import { describe, expect, it } from "@effect/vitest";
import { TurnPrompt } from "../../src/turn/prompt.ts";

const ada = (text: string): TurnPrompt.Said => ({ author: "Ada", own: false, text });
const kai = (text: string): TurnPrompt.Said => ({ author: "Kai", own: false, text });
const agent = (text: string): TurnPrompt.Said => ({ author: "Reviewer", own: true, text });

describe("a turn's prompt", () => {
  it("names each message by its author, leaving out the agent's own", () => {
    const prompt = TurnPrompt.promptOf(
      [ada("Can you review this?"), agent("On it."), kai("Mine too, please.")],
      undefined,
    );

    expect(prompt?.content).toMatchObject([
      { type: "text", text: "Ada: Can you review this?" },
      { type: "text", text: "Kai: Mine too, please." },
    ]);
  });

  it("tells the agent who asked it to try again", () => {
    expect(TurnPrompt.promptOf([ada("Review this.")], "Kai")?.content).toMatchObject([
      { type: "text", text: "Ada: Review this." },
      { type: "text", text: "Kai asked you to try that again." },
    ]);
    expect(TurnPrompt.promptOf([], "Kai")?.content).toMatchObject([
      { type: "text", text: "Kai asked you to try that again." },
    ]);
  });

  it("is nothing when there is nothing to say", () => {
    expect(TurnPrompt.promptOf([], undefined)).toBeUndefined();
    expect(TurnPrompt.promptOf([agent("Done.")], undefined)).toBeUndefined();
  });
});

describe("the conversation an agent joins", () => {
  it("has others' messages as the user's and the agent's own as its answers, sides alternating", () => {
    const history = TurnPrompt.historyOf([
      ada("Hello."),
      kai("Hi all."),
      agent("Hello, both."),
      agent("What do you need?"),
      ada("A review."),
    ]);

    expect(history.content).toMatchObject([
      {
        role: "user",
        content: [
          { type: "text", text: "Ada: Hello." },
          { type: "text", text: "Kai: Hi all." },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Hello, both." },
          { type: "text", text: "What do you need?" },
        ],
      },
      { role: "user", content: [{ type: "text", text: "Ada: A review." }] },
    ]);
    expect(TurnPrompt.historyOf([]).content).toEqual([]);
  });
});
