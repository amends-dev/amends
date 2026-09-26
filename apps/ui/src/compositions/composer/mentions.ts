/** Someone who can be mentioned: their name as the token shows it, and how their mark looks. */
export interface MentionCandidate {
  readonly id: string;
  readonly label: string;
  /** Secondary text to match and show, such as an address. */
  readonly description?: string;
  readonly kind: "human" | "agent";
}
/**
 * The mention being typed before the caret: a word starting with @, at the start of the text or
 * after whitespace. The query is the rest of the word, and may itself contain @.
 */
export const mentionAt = (
  text: string,
  caret: number,
): { readonly start: number; readonly query: string } | undefined => {
  const word = /\S*$/u.exec(text.slice(0, caret))?.[0] ?? "";
  return word.startsWith("@") ? { start: caret - word.length, query: word.slice(1) } : undefined;
};
/** Candidates whose name starts with the query first, then those that contain it anywhere. */
export const matching = (
  candidates: ReadonlyArray<MentionCandidate>,
  query: string,
  limit = 8,
): ReadonlyArray<MentionCandidate> => {
  const wanted = query.toLocaleLowerCase();
  const starts: Array<MentionCandidate> = [],
    contains: Array<MentionCandidate> = [];
  for (const candidate of candidates) {
    const label = candidate.label.toLocaleLowerCase();
    if (label.startsWith(wanted)) starts.push(candidate);
    else if (label.includes(wanted) || candidate.description?.toLocaleLowerCase().includes(wanted))
      contains.push(candidate);
  }
  return [...starts, ...contains].slice(0, limit);
};
/** Replace the mention being typed with the chosen one's token and a space after it. */
export const insertMention = (text: string, start: number, caret: number, label: string) => {
  const token = `@${label} `;
  return { text: text.slice(0, start) + token + text.slice(caret), caret: start + token.length };
};
