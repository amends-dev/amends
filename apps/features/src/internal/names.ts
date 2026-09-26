/**
 * What people in a workspace call a member: the name they chose there, or the identity they sign
 * in as until they choose one.
 */
export const nameOf = (member: {
  readonly name?: string | undefined;
  readonly identity: { readonly id: string };
}) => member.name ?? member.identity.id;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const first = (text: string, count: number) =>
  Array.from(graphemes.segment(text), (part) => part.segment).slice(0, count);
/** One or two initials from a name or identity, for an avatar. */
export const initials = (name: string) => {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const letters =
    words.length > 1 ? [...first(words[0]!, 1), ...first(words[1]!, 1)] : first(words[0] ?? "?", 2);
  return letters.join("").toLocaleUpperCase();
};
