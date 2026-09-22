import { RadioGroup, type RadioGroupProps } from "@amends/frontend/compositions/radio-group";
export function radioGroupTypeExamples() {
  const props: RadioGroupProps = {
    label: "Role",
    value: undefined,
    options: [],
    onValueChange: (value) => value.toUpperCase(),
  };
  <RadioGroup {...props} variant="card" required name="role" />;
  // @ts-expect-error Selection belongs to the caller.
  <RadioGroup label="Role" options={[]} value={undefined} />;
  // @ts-expect-error Only the two reviewed presentations are supported.
  <RadioGroup {...props} variant="compact" />;
  const inputRef = (element: HTMLInputElement) => element;
  // @ts-expect-error Native group is a fieldset, not an input.
  <RadioGroup {...props} ref={inputRef} />;
  // @ts-expect-error Values are stable string identities.
  <RadioGroup {...props} options={[{ value: 7, label: "7" }]} />;
}
