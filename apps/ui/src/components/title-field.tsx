import { splitProps } from "solid-js";
import { TextField, type TextFieldProps } from "./text-field.tsx";
import * as s from "./title-field.css.ts";
export function TitleField(props: TextFieldProps) {
  const [local, rest] = splitProps(props, ["class"]);
  return <TextField {...rest} class={`${s.root} ${local.class ?? ""}`} />;
}
