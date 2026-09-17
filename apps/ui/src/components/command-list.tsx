import { createSignal, For, Show } from "solid-js";
import { Button, IconButton } from "./button.tsx";
import { TextField } from "./text-field.tsx";
import * as s from "./command-list.css.ts";
export interface CommandListProps {
  label: string;
  commands: readonly string[];
  onChange?: (commands: string[]) => void;
  placeholder?: string;
  /** What the line being added is called, for the input that adds one. */
  inputLabel?: string;
}
/** Ordered shell lines. Omitting onChange renders the same list without editing controls. */
export function CommandList(props: CommandListProps) {
  const [line, setLine] = createSignal("");
  let input: HTMLInputElement | undefined;
  const add = () => {
    const command = line().trim();
    if (!command || !props.onChange) return;
    props.onChange([...props.commands, command]);
    setLine("");
    input?.focus();
  };
  return (
    <div class={s.root}>
      <ol class={s.list} aria-label={props.label}>
        <For each={props.commands}>
          {(command, index) => (
            <li class={s.row}>
              <span class={s.number} aria-hidden="true">
                {index() + 1}
              </span>
              <code class={s.command}>{command}</code>
              <Show when={props.onChange}>
                <IconButton
                  label={`Remove command ${index() + 1}: ${command}`}
                  size="compact"
                  variant="ghost"
                  onClick={() => {
                    props.onChange?.(props.commands.filter((_, i) => i !== index()));
                    input?.focus();
                  }}
                >
                  ×
                </IconButton>
              </Show>
            </li>
          )}
        </For>
      </ol>
      <Show when={props.onChange}>
        <div class={s.add}>
          <TextField
            ref={(node) => {
              input = node;
            }}
            aria-label={props.inputLabel ?? "New setup command"}
            value={line()}
            placeholder={props.placeholder ?? "Add a command"}
            onInput={(e) => setLine(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button variant="secondary" size="compact" disabled={!line().trim()} onClick={add}>
            add line
          </Button>
        </div>
      </Show>
    </div>
  );
}
