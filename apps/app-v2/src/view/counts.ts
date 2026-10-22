/** Counts and their singular or plural labels. */

/** `count` of something, as the person reads it: "1 member", "4 members", by its `singular` and its `plural`. */
export const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

/** How many replies a thread has, as the person reads it: "1 reply", "4 replies". */
export const repliesLabel = (replies: number): string => pluralize(replies, "reply", "replies")
