import { Field } from "@amends/ui/compositions/field";
import { Input } from "@amends/ui/primitives/input";

export function fieldTypeExamples() {
  <Field
    id="wrapper"
    controlId="email"
    label="Email"
    description="Work address"
    error="Invalid"
    required
    controlDescribedBy="external"
  >
    {(control) => <Input type="email" name="email" {...control} />}
  </Field>;
  // @ts-expect-error A visible label is required.
  <Field>{(control) => <Input {...control} />}</Field>;
  // @ts-expect-error Use the render function to supply control associations.
  <Field label="Email" children={<Input />} />;
  // @ts-expect-error Error messages are text, not validation callbacks.
  <Field label="Email" error={() => "Invalid"}>
    {(control) => <Input {...control} />}
  </Field>;
  <Field label="Email">
    {(control) => {
      // @ts-expect-error The association object is read-only.
      control.id = "changed";
      return <Input {...control} />;
    }}
  </Field>;
}
