import { Support } from "@amends/harness/conformance";
import { describe, expect, it } from "@effect/vitest";
import { AcpConnection, AcpHarness } from "../src/index.ts";

const { input, response, text } = Support;

describe("AcpHarness", () => {
  it("splits off the input that ends a transcript, which the session asks when it resumes", () => {
    const earlier = [input("One."), response("r1", text("Two."))];

    expect(AcpHarness.splitTrailingInput([...earlier, input("Three."), input("Four.")])).toEqual({
      history: earlier,
      trailing: [input("Three."), input("Four.")],
    });
    expect(AcpHarness.splitTrailingInput(earlier)).toEqual({ history: earlier, trailing: [] });
  });

  it("joins the pieces of each message an agent replays, and compares them to what was written", () => {
    const replayed = AcpHarness.replayedMessages([
      {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "Alice: Hi." },
        messageId: "m1",
      },
      {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Hmm." },
        messageId: "m2",
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hel" },
        messageId: "m2",
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "lo. " },
        messageId: "m2",
      },
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Again." },
        messageId: "m3",
      },
    ]);
    const written = [
      { role: "user", text: "Alice: Hi." },
      { role: "assistant", text: "Hello." },
      { role: "assistant", text: "Again." },
    ] as const;

    expect(replayed).toEqual(written);
    expect(AcpHarness.replayedAsWritten(written, replayed)).toBe(true);
    expect(AcpHarness.replayedAsWritten(written, replayed.slice(0, 2))).toBe(false);
    expect(
      AcpHarness.replayedAsWritten(written, [
        ...replayed.slice(0, 2),
        { role: "user", text: "Again." },
      ]),
    ).toBe(false);
  });

  it("names the problem an agent's refusal of a prompt describes", () => {
    const refusal = (code: number, message: string) =>
      AcpHarness.problemOf(
        new AcpConnection.RequestFailed({ method: "session/prompt", code, message }),
      );

    expect(refusal(-32000, "Authentication required")).toBe("model-access");
    expect(refusal(-32603, "Incorrect API key provided.")).toBe("model-access");
    expect(refusal(-32603, "Rate limit reached, retry later")).toBe("model-rate-limit");
    expect(refusal(-32603, "You exceeded your current quota")).toBe("model-quota");
    expect(refusal(-32603, "prompt is too long: 210000 tokens")).toBe("model-context");
    expect(refusal(-32603, "Overloaded")).toBe("model-provider");
    expect(refusal(-32603, "Invalid parameter: temperature")).toBe("model-request");
  });

  it("fails a session as ended, to try again, when the agent's output ends", () => {
    expect(
      AcpHarness.failureOf(
        new AcpConnection.Closed({ message: "The agent's output ended." }),
        "panic\n",
      ),
    ).toMatchObject({
      problem: "ended",
      retryable: true,
      reason: "The agent's output ended.\npanic",
    });
  });
});
