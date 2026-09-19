import { children, createSignal, For, Show, type JSX } from "solid-js";
import { Button } from "./button.tsx";
import * as s from "./code-block.css.ts";
export function CodeBlock(props: {
  text: string;
  label: string;
  copyable?: boolean;
  lineNumbers?: boolean;
  viewer?: boolean;
  footer?: JSX.Element;
  appearance?: "block" | "inline";
  /** Wrap long lines instead of scrolling sideways: prose reads that way, code and data do not. */
  wrap?: boolean;
}) {
  const footer = children(() => props.footer);
  const [feedback, setFeedback] = createSignal("");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setFeedback("Copied");
    } catch {
      setFeedback("Could not copy. Select and copy the command.");
    }
  };
  const code = () => (
    <pre
      data-viewer={props.viewer}
      data-wrap={props.wrap || undefined}
      class={s.root}
      data-appearance={props.appearance}
      tabIndex={0}
      aria-label={props.label}
    >
      <code>
        <Show when={props.lineNumbers} fallback={props.text}>
          <For each={props.text.split("\n")}>
            {(line, index) => (
              <span class={s.line}>
                <span class={s.number} aria-hidden="true">
                  {index() + 1}
                </span>
                <span>
                  {line}
                  {"\n"}
                </span>
              </span>
            )}
          </For>
        </Show>
      </code>
    </pre>
  );
  return (
    <Show
      when={props.copyable}
      fallback={
        <Show when={props.viewer || footer()} fallback={code()}>
          <div class={props.viewer ? s.viewer : undefined}>
            {code()}
            <Show when={footer()}>
              <div class={s.footer}>{footer()}</div>
            </Show>
          </div>
        </Show>
      }
    >
      <div class={s.copyable} data-appearance={props.appearance}>
        {code()}
        <Show when={footer()}>
          <div class={s.footer}>{footer()}</div>
        </Show>
        <div class={s.actions}>
          <Button
            size="compact"
            variant="secondary"
            onClick={() => {
              void copy();
            }}
            aria-label={`Copy ${props.label}`}
          >
            copy
          </Button>
          <span class={s.feedback} role="status">
            {feedback()}
          </span>
        </div>
      </div>
    </Show>
  );
}
