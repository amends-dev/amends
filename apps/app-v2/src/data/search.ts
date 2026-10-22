/** Text normalization shared by searches and mention matching. */

/** `text` in lower case with its accents taken off, so that "José" and "jose" are the same when searched for. */
export const foldAccents = (text: string): string => text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase()
