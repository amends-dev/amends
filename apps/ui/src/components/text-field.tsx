import { splitProps, type JSX } from "solid-js";
import { useFieldControl } from "./field.tsx";
import * as s from "./field.css.ts";

export type TextFieldProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "children"
> & {
  type?:
    | "text"
    | "email"
    | "password"
    | "search"
    | "tel"
    | "url"
    | "number"
    | "date"
    | "time"
    | "datetime-local"
    | "month"
    | "week";
};
/** Native input. Use inside Field, or supply a standalone accessible name. Ref targets the input. */
export function TextField(props: TextFieldProps) {
  const association = useFieldControl(props);
  const [local, rest] = splitProps(props, ["class", "type"]);
  return (
    <input
      {...rest}
      {...association}
      type={local.type ?? "text"}
      class={`${s.input} ${local.class ?? ""}`}
    />
  );
}
export type TextAreaProps = Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "children">;
/** Native multiline input with vertical resizing. Values and form resets follow native/Solid behavior. */
export function TextArea(props: TextAreaProps) {
  const association = useFieldControl(props);
  const [local, rest] = splitProps(props, ["class"]);
  return (
    <textarea
      rows={3}
      {...rest}
      {...association}
      class={`${s.input} ${s.textarea} ${local.class ?? ""}`}
    />
  );
}
