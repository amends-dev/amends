import { createSignal } from "solid-js";
import { Column } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Field } from "@amends/ui/compositions/field";
import { Combobox } from "./index.ts";
export const people = [
  { value: "ada", label: "Ada", kind: "agent" },
  { value: "rae", label: "Rae", kind: "agent" },
  { value: "jo", label: "Jo Mercer", kind: "user" },
  { value: "kit", label: "Kit Nakano", kind: "user" },
  { value: "ravi", label: "Ravi Kaur", kind: "contact" },
];
export function Assignee(props: {
  label?: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
  clearOnSelect?: boolean;
}) {
  const [value, setValue] = createSignal<string | null>(props.clearOnSelect ? "ada" : null);
  return (
    <Column gap={3}>
      <Field
        label={props.label ?? "Assign to"}
        description={props.description ?? "Type to filter by name."}
      >
        {(control) => (
          <Combobox.Root
            options={people}
            value={value()}
            onChange={setValue}
            name="assignee"
            required={props.required}
            disabled={props.disabled}
            clearOnSelect={props.clearOnSelect}
            itemComponent={(entry) => (
              <Combobox.Item item={entry.item}>
                <Combobox.ItemMark ring={entry.item.rawValue.kind === "agent" ? "dashed" : "solid"}>
                  {entry.item.rawValue.label[0]?.toLowerCase()}
                </Combobox.ItemMark>
                <Combobox.ItemLabel>{entry.item.rawValue.label}</Combobox.ItemLabel>
                <Combobox.ItemDescription>{entry.item.rawValue.kind}</Combobox.ItemDescription>
              </Combobox.Item>
            )}
          >
            <Combobox.Control>
              <Combobox.Input {...control} placeholder="Assign to…" />
            </Combobox.Control>
            <Combobox.Content>
              <Combobox.Listbox />
              <Combobox.Empty>nobody by that name</Combobox.Empty>
            </Combobox.Content>
          </Combobox.Root>
        )}
      </Field>
      <Text variant="mono" tone="secondary" role="status">
        assigned · {people.find((person) => person.value === value())?.label ?? "nobody"}
      </Text>
    </Column>
  );
}
