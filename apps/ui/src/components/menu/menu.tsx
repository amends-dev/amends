import * as Primitive from "@kobalte/core/dropdown-menu";
import { createContext, createSignal, splitProps, useContext, type JSX } from "solid-js";
import { IconCheck } from "@amends/icons";
import { Button, type ButtonProps } from "../button/index.ts";
import { overlayMount } from "../../internal/overlay.ts";
import * as s from "./menu.css.ts";

const TriggerContext = createContext<{
  readonly element: () => HTMLElement | undefined;
  readonly setElement: (element: HTMLElement) => void;
}>();

export type RootProps = {
  children: JSX.Element;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Where the list opens from its trigger. Default "bottom-start". */
  placement?: "bottom-start" | "bottom-end" | "top-start" | "right-end";
};

/** A menu of actions or a single choice, opened from a Trigger. */
export function Root(props: RootProps) {
  const [element, setElement] = createSignal<HTMLElement>();
  return (
    <TriggerContext.Provider value={{ element, setElement }}>
      <Primitive.Root
        placement={props.placement ?? "bottom-start"}
        gutter={6}
        open={props.open}
        onOpenChange={props.onOpenChange}
      >
        {props.children}
      </Primitive.Root>
    </TriggerContext.Provider>
  );
}

export type TriggerProps = Omit<ButtonProps, "chevron">;

/** A Button with a chevron that opens the menu. */
export function Trigger(props: TriggerProps) {
  const context = useContext(TriggerContext);
  return (
    <Primitive.Trigger
      as={(triggerProps: ButtonProps) => (
        <Button
          {...triggerProps}
          {...props}
          ref={(element: HTMLButtonElement) => {
            context?.setElement(element);
            const ref = triggerProps.ref;
            if (typeof ref === "function") ref(element);
          }}
          chevron
        />
      )}
    />
  );
}

export type PlainTriggerProps = {
  /** The trigger's own look, such as an avatar button's. */
  class?: string;
  "aria-label": string;
  title?: string;
  children: JSX.Element;
};

/** Opens the menu from a button styled by its caller, such as an avatar. */
export function PlainTrigger(props: PlainTriggerProps) {
  const context = useContext(TriggerContext);
  return (
    <Primitive.Trigger
      ref={(element: HTMLElement) => context?.setElement(element)}
      class={props.class}
      aria-label={props["aria-label"]}
      title={props.title}
    >
      {props.children}
    </Primitive.Trigger>
  );
}

export type ContentProps = {
  children: JSX.Element;
  /** Names the menu when its trigger's label is not enough. */
  "aria-label"?: string;
};

/** The floating list. It attaches inside the current dialog or Theme so it keeps the mode. */
export function Content(props: ContentProps) {
  const context = useContext(TriggerContext);
  return (
    <Primitive.Portal mount={overlayMount(context?.element())}>
      <Primitive.Content class={s.content} aria-label={props["aria-label"]}>
        {props.children}
      </Primitive.Content>
    </Primitive.Portal>
  );
}

export type RadioGroupProps = {
  value: string;
  onChange: (value: string) => void;
  /** A heading above the choices. */
  label?: string;
  children: JSX.Element;
};

/** Choices where one is current, such as a status filter or sort order. */
export function RadioGroup(props: RadioGroupProps) {
  return (
    <Primitive.RadioGroup value={props.value} onChange={props.onChange}>
      {props.label ? (
        <Primitive.GroupLabel class={s.label}>{props.label}</Primitive.GroupLabel>
      ) : null}
      {props.children}
    </Primitive.RadioGroup>
  );
}

export type RadioItemProps = {
  value: string;
  /** The label, optionally led by an icon or avatar. */
  children: JSX.Element;
  /** The accessible name when the children are not plain text. */
  textValue?: string;
};

export function RadioItem(props: RadioItemProps) {
  return (
    <Primitive.RadioItem
      value={props.value}
      textValue={props.textValue}
      closeOnSelect
      class={s.item}
    >
      <Primitive.ItemLabel class={s.itemLabel}>{props.children}</Primitive.ItemLabel>
      <Primitive.ItemIndicator>
        <IconCheck class={s.indicator} />
      </Primitive.ItemIndicator>
    </Primitive.RadioItem>
  );
}

export type ItemProps = {
  onSelect: () => void;
  children: JSX.Element;
  disabled?: boolean;
};

/** An action. */
export function Item(props: ItemProps) {
  const [local] = splitProps(props, ["onSelect", "children", "disabled"]);
  return (
    <Primitive.Item class={s.item} onSelect={() => local.onSelect()} disabled={local.disabled}>
      <Primitive.ItemLabel class={s.itemLabel}>{local.children}</Primitive.ItemLabel>
    </Primitive.Item>
  );
}

export type HeaderProps = {
  /** Such as the signed-in person's name. */
  title: string;
  /** Such as their email address. */
  detail?: string;
};

/** Who or what the menu is about, above its choices. */
export function Header(props: HeaderProps) {
  return (
    <div class={s.header}>
      <span class={s.headerTitle}>{props.title}</span>
      {props.detail ? <span class={s.headerDetail}>{props.detail}</span> : null}
    </div>
  );
}

export function Separator() {
  return <Primitive.Separator class={s.separator} />;
}
