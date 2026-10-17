import { vi } from "@effect/vitest"

/** Evaluates the shell's width queries against a width the test controls. */
export function viewport(initial: number) {
  const lists = new Set<{ query: string; list: MediaQueryList }>()
  let width = initial
  const evaluate = (query: string) => {
    const min = /min-width:\s*([\d.]+)rem/.exec(query)
    const max = /max-width:\s*([\d.]+)rem/.exec(query)
    return (!min || width >= Number(min[1]) * 16) && (!max || width <= Number(max[1]) * 16)
  }
  vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const list = new EventTarget() as MediaQueryList
    Object.defineProperty(list, "matches", { get: () => evaluate(query) })
    lists.add({ query, list })
    return list
  })
  return (next: number) => {
    width = next
    for (const { list } of lists) list.dispatchEvent(new Event("change"))
  }
}
