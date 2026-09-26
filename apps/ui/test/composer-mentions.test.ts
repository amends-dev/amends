import { expect, it } from "@effect/vitest";
import {
  insertMention,
  matching,
  mentionAt,
  type MentionCandidate,
} from "../src/compositions/composer/mentions.ts";

it("finds the @ word before the caret, including addresses, and nothing else", () => {
  expect(mentionAt("Ask @ad", 7)).toEqual({ start: 4, query: "ad" });
  expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" });
  expect(mentionAt("Hi\n@ada@merc", 12)).toEqual({ start: 3, query: "ada@merc" });
  expect(mentionAt("mail jo@mercier.co", 18)).toBeUndefined();
  expect(mentionAt("Ask @ada later", 14)).toBeUndefined();
  // Only the text before the caret counts.
  expect(mentionAt("Ask @ada later", 8)).toEqual({ start: 4, query: "ada" });
});

it("ranks names that start with the query before other matches, up to a limit", () => {
  const people: ReadonlyArray<MentionCandidate> = [
    { id: "1", label: "Mara", kind: "human" },
    { id: "2", label: "Ada", description: "marketing", kind: "agent" },
    { id: "3", label: "Rae Mar", kind: "human" },
    { id: "4", label: "Zed", kind: "human" },
  ];
  expect(matching(people, "MAR").map((person) => person.id)).toEqual(["1", "2", "3"]);
  expect(matching(people, "").map((person) => person.id)).toEqual(["1", "2", "3", "4"]);
  expect(matching(people, "", 2)).toHaveLength(2);
  expect(matching(people, "nobody")).toEqual([]);
});

it("replaces the typed word with the chosen token and puts the caret after it", () => {
  expect(insertMention("Ask @ad please", 4, 7, "Ada")).toEqual({
    text: "Ask @Ada  please",
    caret: 9,
  });
});
