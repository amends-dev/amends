import { expect, it } from "@effect/vitest";
import * as ThreadMessage from "../../src/thread/ThreadMessage.ts";

it("writes a mention as a link to the member, labelled with their name", () => {
  expect(ThreadMessage.mentionText("m-1", "Ada Lovelace")).toBe("[@Ada Lovelace](member:m-1)");
  expect(ThreadMessage.mentionText("a b/c", "[x]*_y`~<\\")).toBe(
    "[@\\[x\\]\\*\\_y\\`\\~\\<\\\\](member:a%20b%2Fc)",
  );
});

it("finds the members a text mentions, each once, in order", () => {
  const ada = ThreadMessage.mentionText("ada", "Ada");
  const odd = ThreadMessage.mentionText("a b", "[Odd] *name*");
  expect(ThreadMessage.mentionedIn(`${odd} and ${ada}, then ${ada} again`)).toEqual(["a b", "ada"]);
  expect(ThreadMessage.mentionedIn("@Ada, [Ada](member:ada), [@Ada](https://x)")).toEqual([]);
  expect(ThreadMessage.mentionedIn("[@Bad](member:%E0%A4%A)")).toEqual([]);
});
