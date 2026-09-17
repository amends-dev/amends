import { createSignal, Show } from "solid-js";
import { Identity } from "./identity.tsx";
import { Button } from "./button.tsx";
import { Popover } from "./popover.tsx";
import { RadioCardGroup } from "./radio-card.tsx";
import { Text } from "./text.tsx";
import { withTooltip } from "./overlay-trigger.ts";

import * as s from "./account-popover.css.ts";
export interface AccountPopoverProps {
  name: string;
  email?: string;
  identityDescription?: string;
  manageAccount?: { label: string; href: string };
  placement?: "bottom-start" | "bottom-end" | "top-start" | "top-end";
  compact?: boolean;
  theme: {
    preference: () => "cotton" | "soot" | "system";
    resolved: () => "cotton" | "soot";
    choose: (value: "cotton" | "soot" | "system") => void;
  };
  onSettings?: () => void;
  onShortcuts?: () => void;
  onSignOut?: () => void;
}
/** Account presentation; authentication and navigation stay with the application callbacks. */
export function AccountPopover(props: AccountPopoverProps) {
  const [open, setOpen] = createSignal(false);
  const act = (callback: () => void) => {
    setOpen(false);
    queueMicrotask(callback);
  };
  return (
    <Popover
      open={open()}
      onOpenChange={setOpen}
      label="Your account"
      placement={props.placement ?? "bottom-end"}
      theme={props.theme.resolved()}
      trigger={(trigger) => (
        <Identity
          name={props.name}
          kind="user"
          size={props.compact ? "medium" : "small"}
          compact
          trigger={(tooltip) => (
            <Button
              {...withTooltip<HTMLButtonElement>(trigger, tooltip)}
              variant="ghost"
              class={s.trigger}
              data-compact={props.compact ?? false}
              aria-label={`Your account — ${props.name}`}
            >
              {tooltip.children}
            </Button>
          )}
        />
      )}
    >
      <header class={s.identity}>
        <div class={s.identityText}>
          <Text as="strong" variant="body" class={s.name}>
            <Identity name={props.name} kind="user" size="large" />
          </Text>
          <Show when={props.email}>
            <span class={s.email}>{props.email}</span>
          </Show>
        </div>
      </header>
      <Show when={props.identityDescription || props.manageAccount}>
        <section class={s.explanation}>
          <Show when={props.identityDescription}>
            <p class={s.note}>{props.identityDescription}</p>
          </Show>
          <Show when={props.manageAccount}>
            {(account) => (
              <a class={s.link} href={account().href} target="_blank" rel="noreferrer">
                {account().label}
              </a>
            )}
          </Show>
        </section>
      </Show>
      <hr class={s.divider} />
      <section class={s.theme}>
        <RadioCardGroup
          label="Theme"
          value={props.theme.preference()}
          onChange={(value) => {
            if (value === "cotton" || value === "soot" || value === "system")
              props.theme.choose(value);
          }}
          options={[
            { value: "cotton", label: "Cotton", preview: <ThemeSwatch theme="cotton" /> },
            { value: "soot", label: "Soot", preview: <ThemeSwatch theme="soot" /> },
            {
              value: "system",
              label: "System",
              preview: <ThemeSwatch theme={props.theme.resolved()} />,
            },
          ]}
        />
        <p class={s.note}>
          {props.theme.preference() === "system"
            ? "Follows your operating system, which is the default."
            : props.theme.preference() === "cotton"
              ? "Warm paper, wherever you work."
              : "Quiet ink, wherever you work."}
        </p>
      </section>
      <Show when={props.onSettings || props.onShortcuts || props.onSignOut}>
        <hr class={s.divider} />
        <div class={s.actions}>
          <Show when={props.onSettings}>
            <button type="button" class={s.action} onClick={() => act(props.onSettings!)}>
              <span class={s.glyph} aria-hidden="true">
                ⚙
              </span>
              <span>Settings</span>
            </button>
          </Show>
          <Show when={props.onShortcuts}>
            <button type="button" class={s.action} onClick={() => act(props.onShortcuts!)}>
              <span class={s.glyph} aria-hidden="true">
                ⌗
              </span>
              <span>Keyboard shortcuts</span>
              <kbd class={s.shortcut} aria-hidden="true">
                /
              </kbd>
            </button>
          </Show>
          <Show when={props.onSignOut}>
            <button
              type="button"
              class={`${s.action} ${s.danger}`}
              onClick={() => act(props.onSignOut!)}
            >
              <span class={s.glyph} aria-hidden="true">
                →
              </span>
              <span>Sign out</span>
            </button>
          </Show>
        </div>
      </Show>
    </Popover>
  );
}
function ThemeSwatch(props: { theme: "cotton" | "soot" }) {
  return (
    <span data-theme={props.theme} class={s.swatch}>
      <span class={s.dot} />
      <span class={s.stitch} />
    </span>
  );
}
