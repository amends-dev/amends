import { Button, Notice, Text } from "@amends/ui/components";
import { AsyncResult } from "effect/unstable/reactivity";
import { createMemo, Show, type Accessor, type JSX } from "solid-js";
import { explain, failureOf, valueOf } from "../api/errors.ts";

/** Keeps a successful content owner mounted while refreshing the same query. */
export function QueryView<A, E>(props: {
  result: AsyncResult.AsyncResult<A, E>;
  loading: string;
  retry: () => void;
  children: (value: Accessor<NonNullable<A>>) => JSX.Element;
}) {
  const value = createMemo(() => valueOf(props.result));
  return (
    <>
      <Show when={AsyncResult.isInitial(props.result)}>
        <Text role="status">{props.loading}</Text>
      </Show>
      <Show when={failureOf(props.result)}>
        {(failure) => (
          <Notice tone="danger" live="polite">
            {value() !== undefined ? "Showing saved data. " : ""}
            {explain(failure().cause)}{" "}
            <Button variant="secondary" onClick={props.retry}>
              try again
            </Button>
          </Notice>
        )}
      </Show>
      <Show when={value()}>{props.children}</Show>
      <Show when={value() !== undefined && AsyncResult.isWaiting(props.result)}>
        <Text variant="caption" role="status">
          Refreshing…
        </Text>
      </Show>
    </>
  );
}

export function CommandError<A, E>(props: { result: AsyncResult.AsyncResult<A, E> }) {
  return (
    <Show when={failureOf(props.result)}>
      {(failure) => (
        <Notice tone="danger" live="polite">
          {explain(failure().cause)}
        </Notice>
      )}
    </Show>
  );
}
