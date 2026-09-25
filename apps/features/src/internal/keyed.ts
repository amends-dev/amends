import { createMemo, type Accessor } from "solid-js";

const sameIds = (previous: ReadonlyArray<string>, next: ReadonlyArray<string>) =>
  previous.length === next.length && previous.every((id, index) => id === next[index]);

/**
 * Identify rows by domain ID rather than by object. Every refresh decodes new objects, and a
 * list keyed by them would remount each row, discarding its focus, open dialogs, and drafts.
 * Iterate `ids` and read the current item with `get`.
 */
export function keyed<T>(items: Accessor<ReadonlyArray<T>>, id: (item: T) => string) {
  const ids = createMemo(() => items().map(id), [], { equals: sameIds });
  const index = createMemo(() => new Map(items().map((item) => [id(item), item])));
  return { ids, get: (key: string) => index().get(key) };
}
