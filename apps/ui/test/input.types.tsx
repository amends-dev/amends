import { Input } from "@amends/ui/primitives/input";

export function inputTypeExamples() {
  <Input
    type="email"
    name="recipient"
    required
    autocomplete="email"
    aria-describedby="help"
    onInput={(event) => event.currentTarget.value}
    ref={(element) => {
      const input: HTMLInputElement = element;
      return input;
    }}
  />;
  <Input type="password" readOnly />;
  // @ts-expect-error Only textual input types are in this slice.
  <Input type="checkbox" />;
  // @ts-expect-error Platform-specific number controls are a separate slice.
  <Input type="number" />;
  // @ts-expect-error Input is void and cannot have children.
  <Input>Text</Input>;
  // @ts-expect-error Label composition is owned by the caller.
  <Input label="Title" />;
  // @ts-expect-error Native aria-invalid is used; no custom validation prop.
  <Input error="Invalid" />;
  // @ts-expect-error The ref targets an input, not a textarea.
  <Input ref={(element: HTMLTextAreaElement) => element} />;
}
