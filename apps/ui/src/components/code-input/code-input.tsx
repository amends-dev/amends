import { For, splitProps, type JSX } from "solid-js"
import { classes } from "../../internal/props.ts"
import { useField } from "../field/index.ts"
import * as s from "./code-input.css.ts"

export type CodeInputProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onInput" | "maxLength" | "pattern" | "children"
> & {
  value: string
  /** Called with digits only, at most six. */
  onValueChange: (value: string) => void
  /** Called once six digits are in, such as to verify right away. */
  onComplete?: (value: string) => void
  invalid?: boolean
}

/**
 * A six-digit code in one native field, drawn as six cells: typing, pasting, deleting, and the
 * platform's one-time-code autofill all work as in a text field. Place it in a Field.
 */
export function CodeInput(props: CodeInputProps) {
  const field = useField()
  const [local, native] = splitProps(props, ["value", "onValueChange", "onComplete", "invalid", "disabled", "class"])
  const digits = () => local.value.slice(0, 6).split("")
  return (
    <div
      class={classes(s.root, local.class)}
      data-invalid={local.invalid || field?.invalid() ? "" : undefined}
      data-disabled={local.disabled ? "" : undefined}
    >
      <For each={[0, 1, 2, 3, 4, 5]}>
        {(index) => (
          <span class={s.cell} aria-hidden="true" data-next={index === Math.min(digits().length, 5) ? "" : undefined}>
            {digits()[index] ?? ""}
          </span>
        )}
      </For>
      <input
        id={field?.id}
        aria-describedby={field?.describedBy()}
        aria-invalid={local.invalid || field?.invalid() ? true : undefined}
        inputmode="numeric"
        autocomplete="one-time-code"
        spellcheck={false}
        {...native}
        type="text"
        maxLength={6}
        pattern="[0-9]{6}"
        disabled={local.disabled}
        value={local.value}
        class={s.input}
        onInput={(event) => {
          const next = event.currentTarget.value.replaceAll(/\D/g, "").slice(0, 6)
          // Keep the field in step when non-digits were dropped.
          if (event.currentTarget.value !== next) event.currentTarget.value = next
          local.onValueChange(next)
          if (next.length === 6) local.onComplete?.(next)
        }}
      />
    </div>
  )
}
