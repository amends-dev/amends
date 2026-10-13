/**
 * Text a response part holds before it completes, as its turn's drafts carried it. A draft that
 * missed some of its text is `broken`: what arrived after the gap is not shown, and the completed
 * response in the turn's log replaces it.
 */
export interface Draft {
  readonly responseId: string
  readonly part: number
  readonly text: string
  readonly broken: boolean
}
/** Drafts by turn, each response part by `responseId` and `part`. */
export type Drafts = ReadonlyMap<string, ReadonlyMap<string, Draft>>

/**
 * Add a draft's text where it continues its part. Text already held is not added again; text past
 * a gap marks the part broken rather than showing out of order.
 */
export const drafted = (
  drafts: Drafts,
  signal: {
    readonly turnId: string
    readonly responseId: string
    readonly part: number
    readonly offset: number
    readonly text: string
  }
): Drafts => {
  const key = `${signal.responseId}\u0000${signal.part}`
  const parts = new Map(drafts.get(signal.turnId))
  const current = parts.get(key) ?? {
    responseId: signal.responseId,
    part: signal.part,
    text: "",
    broken: false
  }
  if (current.broken) return drafts
  const held = current.text.length
  if (signal.offset > held) parts.set(key, { ...current, broken: true })
  else if (signal.offset + signal.text.length > held)
    parts.set(key, { ...current, text: current.text + signal.text.slice(held - signal.offset) })
  else return drafts
  const next = new Map(drafts)
  next.set(signal.turnId, parts)
  return next
}

/**
 * The response a turn is writing now: the newest one with blocks its log does not hold yet, those
 * blocks in order, and whether any of it went missing on the way. `logged` holds the blocks the
 * log has, each as its response ID and position joined by a NUL character.
 */
export const writing = (
  drafts: Drafts,
  turnId: string,
  logged: ReadonlySet<string>
): { readonly text: string; readonly broken: boolean } | undefined => {
  const parts = [...(drafts.get(turnId)?.values() ?? [])].filter(
    (part) => !logged.has(`${part.responseId}\u0000${part.part}`)
  )
  const responseId = parts.at(-1)?.responseId
  const current = parts
    .filter((part) => part.responseId === responseId)
    .toSorted((left, right) => left.part - right.part)
  if (current.length === 0) return undefined
  return {
    text: current.map((part) => part.text).join(""),
    broken: current.some((part) => part.broken)
  }
}
