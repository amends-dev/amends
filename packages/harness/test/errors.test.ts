import { describe, expect, it } from "@effect/vitest";
import { AiError } from "effect/unstable/ai";
import { HarnessErrors } from "@amends/harness";

const refused = (description: string) =>
  AiError.make({
    module: "Test",
    method: "streamText",
    reason: new AiError.InvalidRequestError({ description }),
  });

describe("HarnessErrors.modelProblem", () => {
  it("tells a request longer than the model's context window from other rejected requests", () => {
    expect(
      HarnessErrors.modelProblem(refused("prompt is too long: 250000 tokens > 200000 maximum")),
    ).toBe("model-context");
    expect(
      HarnessErrors.modelProblem(
        refused("This model's maximum context length is 128000 tokens (context_length_exceeded)."),
      ),
    ).toBe("model-context");
    expect(HarnessErrors.modelProblem(refused("temperature must be at most 1"))).toBe(
      "model-request",
    );
  });
});
