import { For, Show, createMemo, type Accessor, type JSX } from "solid-js";

const sameIds = (previous: readonly string[], next: readonly string[]) =>
  previous.length === next.length && previous.every((id, index) => id === next[index]);

/**
 * Rows keyed by id rather than by object. Callers pass freshly built arrays on every refresh; a
 * list keyed by object would remount each row, dropping its focus. Each row reads its current item.
 */
export function Keyed<T>(props: {
  readonly each: readonly T[];
  readonly by: (item: T) => string;
  readonly children: (item: Accessor<T>) => JSX.Element;
}) {
  const ids = createMemo(() => props.each.map(props.by), [], { equals: sameIds });
  const index = createMemo(() => new Map(props.each.map((item) => [props.by(item), item])));
  return (
    <For each={ids()}>
      {(id) => <Show when={index().get(id)}>{(item) => props.children(item)}</Show>}
    </For>
  );
}
