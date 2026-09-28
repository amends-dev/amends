import { splitProps, type JSX } from "solid-js";
import { IconMarkSearch } from "@amends/icons";
import { useField } from "../field/index.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./input.css.ts";

export type InputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

/** A bordered text field. Inside a Field it takes the label, help, and error associations. */
export function Input(props: InputProps) {
  const field = useField();
  const [local, native] = splitProps(props, ["class", "type"]);
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy()}
      aria-invalid={field?.invalid() ? true : undefined}
      {...native}
      type={local.type ?? "text"}
      class={classes(s.input, local.class)}
    />
  );
}

export type TextAreaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * A bordered field for several lines, such as an agent's instructions, sized by `rows`. Inside a
 * Field it takes the label, help, and error associations.
 */
export function TextArea(props: TextAreaProps) {
  const field = useField();
  const [local, native] = splitProps(props, ["class"]);
  return (
    <textarea
      id={field?.id}
      aria-describedby={field?.describedBy()}
      aria-invalid={field?.invalid() ? true : undefined}
      {...native}
      class={classes(s.input, s.textarea, local.class)}
    />
  );
}

export type SearchFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Also the accessible name, such as "Search tasks…". */
  placeholder: string;
};

/** A quiet filled search field for filtering a list. */
export function SearchField(props: SearchFieldProps) {
  const [local, native] = splitProps(props, ["class", "placeholder"]);
  return (
    <div class={classes(s.search, local.class)}>
      <IconMarkSearch class={s.searchIcon} />
      <input
        aria-label={local.placeholder}
        {...native}
        type="search"
        placeholder={local.placeholder}
        class={s.searchInput}
      />
    </div>
  );
}
