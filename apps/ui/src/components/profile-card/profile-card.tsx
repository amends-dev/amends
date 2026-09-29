import {
  For,
  Show,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  splitProps,
  useContext,
  type JSX,
} from "solid-js";
import { IconMarkClose } from "@amends/icons";
import { Avatar } from "../avatar/index.ts";
import { Button } from "../button/index.ts";
import { IconButton } from "../icon-button/index.ts";
import { markTone, type Status } from "../status-mark/index.ts";
import { TurnMark } from "../turn-status/index.ts";
import type { AvatarToneName } from "../../foundations/color/tokens.ts";
import { classes } from "../../internal/props.ts";
import * as s from "./profile-card.css.ts";

/** A workspace member as their card shows them. */
export interface Profile {
  readonly id: string;
  readonly name: string;
  readonly kind: "person" | "agent";
  /** The reader themself. */
  readonly you?: boolean;
  /** No longer in the workspace; they keep their name, with nothing to do. */
  readonly former?: boolean;
  readonly initials?: string;
  readonly tone?: AvatarToneName;
  /**
   * Their state, such as an agent's setup or what it is working on: a patch on the avatar, words
   * after the kind, and why for what needs attention.
   */
  readonly status?: Status;
}

export interface RootProps {
  /** A member by ID, never by name; undefined when they cannot be shown. */
  readonly profile: (memberId: string) => Profile | undefined;
  /** Opens a conversation with the member, or a first message to them; sends nothing. */
  readonly onMessage?: (memberId: string) => void;
  /** Opens the agent's page. */
  readonly onOpenAgent?: (memberId: string) => void;
  /** Changes what the reader is called in the workspace. */
  readonly onChangeName?: () => void;
  readonly children: JSX.Element;
}

interface Open {
  readonly memberId: string;
  readonly anchor: HTMLElement;
  /** Clicked or chosen from the keyboard: it stays until an outside click or Escape. */
  readonly pinned: boolean;
}

interface Cards {
  readonly isOpenFor: (anchor: HTMLElement | undefined) => boolean;
  /** The pointer came onto a trigger. */
  readonly hover: (anchor: HTMLElement, memberId: string) => void;
  /** The pointer left a trigger. */
  readonly leave: () => void;
  /** Shows the card at once, as keyboard focus does, without moving focus. */
  readonly show: (anchor: HTMLElement, memberId: string) => void;
  /** Keeps the card open, as a click, Enter, or Space does. */
  readonly pin: (anchor: HTMLElement, memberId: string) => void;
  readonly close: () => void;
  /** Focus left a trigger for `next`: a card it only showed closes, unless focus went into it. */
  readonly blur: (next: Node | null) => void;
  /** Moves focus to the open card's first action, as Tab from its trigger does. */
  readonly enter: () => boolean;
}
const Context = createContext<Cards>();

/** Hover waits this long before opening a card, and this long to cross to it before closing. */
const openAfter = 250;
const closeAfter = 150;
/** The card sits this far from its trigger, and this far inside the screen's edges. */
const gap = 8;
const inset = 16;

/**
 * Profile cards for the members its triggers name: one compact card at a time, opened by hovering,
 * focusing, clicking, or tapping a Trigger. The card names the member, says whether they are a
 * person or an agent, and offers what the reader can do: Message, Open agent, or, on their own
 * card, Change name.
 */
export function Root(props: RootProps) {
  const [open, setOpen] = createSignal<Open>();
  // Focus returning to a trigger as its card closes does not open the card again.
  let returning = false;
  let opening: ReturnType<typeof setTimeout> | undefined;
  let closing: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(opening);
    clearTimeout(closing);
  };
  onCleanup(stop);
  const close = () => {
    stop();
    setOpen(undefined);
  };
  const later = () => {
    clearTimeout(closing);
    closing = setTimeout(() => {
      if (!open()?.pinned) setOpen(undefined);
    }, closeAfter);
  };
  const [card, setCard] = createSignal<HTMLDivElement>();
  const cards: Cards = {
    isOpenFor: (anchor) => anchor !== undefined && open()?.anchor === anchor,
    hover: (anchor, memberId) => {
      clearTimeout(closing);
      if (open()?.anchor === anchor) return;
      clearTimeout(opening);
      opening = setTimeout(() => {
        if (!open()?.pinned) setOpen({ memberId, anchor, pinned: false });
      }, openAfter);
    },
    leave: () => {
      clearTimeout(opening);
      if (open() && !open()!.pinned) later();
    },
    show: (anchor, memberId) => {
      if (returning) return;
      stop();
      if (open()?.anchor !== anchor) setOpen({ memberId, anchor, pinned: false });
    },
    pin: (anchor, memberId) => {
      stop();
      setOpen({ memberId, anchor, pinned: true });
    },
    close,
    blur: (next) => {
      const current = open();
      if (!current || current.pinned || (next && card()?.contains(next))) return;
      close();
    },
    enter: () => {
      const first = card()?.querySelector<HTMLElement>("[data-action]");
      first?.focus();
      return Boolean(first);
    },
  };
  // Escape closes the card, returning focus to its trigger when it was inside; so does a click
  // outside a kept card.
  createEffect(() => {
    const current = open();
    if (!current) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const inside = card()?.contains(document.activeElement) ?? false;
      close();
      if (!inside) return;
      returning = true;
      current.anchor.focus();
      returning = false;
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (card()?.contains(target) || current.anchor.contains(target)) return;
      close();
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    onCleanup(() => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    });
  });
  const act = (action: (() => void) | undefined) =>
    action
      ? () => {
          close();
          action();
        }
      : undefined;
  return (
    <Context.Provider value={cards}>
      {props.children}
      <Show when={open()} keyed>
        {(current) => (
          <Card
            ref={setCard}
            anchor={current.anchor}
            profile={props.profile(current.memberId)}
            onClose={close}
            onEnter={() => clearTimeout(closing)}
            onLeave={() => {
              if (!current.pinned) later();
            }}
            onMessage={act(props.onMessage && (() => props.onMessage!(current.memberId)))}
            onOpenAgent={act(props.onOpenAgent && (() => props.onOpenAgent!(current.memberId)))}
            onChangeName={act(props.onChangeName)}
          />
        )}
      </Show>
    </Context.Provider>
  );
}

/** The profile cards of the surrounding Root, if there is one. */
export const useProfiles = () => useContext(Context);

interface CardProps {
  readonly ref: (element: HTMLDivElement) => void;
  readonly anchor: HTMLElement;
  readonly profile: Profile | undefined;
  readonly onClose: () => void;
  readonly onEnter: () => void;
  readonly onLeave: () => void;
  readonly onMessage?: () => void;
  readonly onOpenAgent?: () => void;
  readonly onChangeName?: () => void;
}

/** Under its trigger, or above it when there is no room below, inside the screen's edges. */
function place(anchor: DOMRect, width: number, height: number) {
  const below = anchor.bottom + gap;
  const top =
    below + height > window.innerHeight - inset && anchor.top - gap - height >= inset
      ? anchor.top - gap - height
      : below;
  const left = Math.max(inset, Math.min(anchor.left, window.innerWidth - inset - width));
  return { top: `${top}px`, left: `${left}px` };
}

/** The tone a member's state reads in, for one that needs attention. */
const stateTone = (profile: Profile) =>
  profile.former || profile.status === undefined ? undefined : markTone(profile.status.mark);

function Card(props: CardProps) {
  const [element, setElement] = createSignal<HTMLDivElement>();
  const [position, setPosition] = createSignal<JSX.CSSProperties>({ visibility: "hidden" });
  const update = () => {
    const card = element();
    if (!card) return;
    const anchor = props.anchor.getBoundingClientRect();
    // A card whose trigger leaves the page, or scrolls out of view, closes.
    const shown = anchor.width > 0 || anchor.height > 0;
    if (
      !props.anchor.isConnected ||
      (shown && (anchor.bottom < 0 || anchor.top > window.innerHeight))
    ) {
      props.onClose();
      return;
    }
    setPosition(place(anchor, card.offsetWidth, card.offsetHeight));
  };
  createEffect(() => {
    if (!element()) return;
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    onCleanup(() => {
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    });
  });
  const detail = () => {
    const profile = props.profile;
    if (!profile) return "";
    return [
      profile.kind === "agent" ? "Agent" : "Person",
      profile.you && "You",
      profile.former && "Former member",
      !profile.former && profile.status?.label,
    ]
      .filter(Boolean)
      .join(" · ");
  };
  const actions = () => {
    const profile = props.profile;
    if (!profile || profile.former) return [];
    if (profile.you)
      return props.onChangeName ? [{ label: "Change name", run: props.onChangeName }] : [];
    return [
      props.onMessage && { label: "Message", run: props.onMessage },
      profile.kind === "agent" &&
        props.onOpenAgent && { label: "Open agent", run: props.onOpenAgent },
    ].filter((action): action is { label: string; run: () => void } => Boolean(action));
  };
  return (
    <div
      ref={(card) => {
        setElement(card);
        props.ref(card);
      }}
      role="dialog"
      aria-label={props.profile ? props.profile.name : "Profile unavailable"}
      class={s.card}
      style={position()}
      onMouseEnter={() => props.onEnter()}
      onMouseLeave={() => props.onLeave()}
      onFocusOut={(event) => {
        const next = event.relatedTarget as Node | null;
        if (next && (element()?.contains(next) || props.anchor.contains(next))) return;
        props.onClose();
      }}
    >
      <Show when={props.profile} fallback={<p class={s.unavailable}>Profile unavailable</p>}>
        {(profile) => (
          <>
            <div class={s.identity}>
              <Avatar
                name={profile().name}
                initials={profile().initials}
                tone={profile().tone}
                size={40}
                status={profile().former ? undefined : profile().status}
                decorative
              />
              <div class={s.names}>
                <p class={s.name}>{profile().name}</p>
                <p class={s.detail} data-tone={stateTone(profile())}>
                  <Show when={!profile().former && profile().status?.activity}>
                    {(activity) => <TurnMark state={activity()} />}
                  </Show>
                  {detail()}
                </p>
              </div>
              <IconButton
                icon={IconMarkClose}
                label="Close"
                size="compact"
                class={s.close}
                onClick={() => props.onClose()}
              />
            </div>
            <Show
              when={profile().former}
              fallback={
                <Show when={profile().status?.detail}>
                  {(why) => <p class={s.note}>{why()}</p>}
                </Show>
              }
            >
              <p class={s.note}>No longer in this workspace.</p>
            </Show>
            <Show when={actions().length > 0}>
              <div class={s.actions}>
                <For each={actions()}>
                  {(action) => (
                    <Button class={s.action} data-action onClick={() => action.run()}>
                      {action.label}
                    </Button>
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </Show>
    </div>
  );
}

export type TriggerProps = Omit<JSX.HTMLAttributes<HTMLSpanElement>, "children"> & {
  readonly memberId: string;
  /**
   * Reached by Tab and announced as a button. An avatar beside the name that also opens the card
   * is neither: the name is the trigger assistive technology meets. Default true.
   */
  readonly focusable?: boolean;
  readonly children: JSX.Element;
};

/**
 * A member's name, avatar, or mention that opens their card: after a moment's hover, at once on
 * keyboard focus, and kept open by a click, a tap, Enter, or Space. Tab from it reaches the card's
 * actions. Outside a Root it is only its contents.
 */
export function Trigger(props: TriggerProps) {
  const cards = useProfiles();
  const [local, native] = splitProps(props, ["memberId", "focusable", "children", "class"]);
  const [element, setElement] = createSignal<HTMLSpanElement>();
  onCleanup(() => {
    if (cards?.isOpenFor(element())) cards.close();
  });
  return (
    <Show
      when={cards}
      fallback={
        <span {...native} class={local.class}>
          {local.children}
        </span>
      }
    >
      {(cards) => (
        <span
          {...native}
          ref={setElement}
          class={classes(s.trigger, local.class)}
          role={local.focusable === false ? undefined : "button"}
          tabindex={local.focusable === false ? undefined : 0}
          aria-hidden={local.focusable === false ? "true" : undefined}
          aria-haspopup={local.focusable === false ? undefined : "dialog"}
          aria-expanded={local.focusable === false ? undefined : cards().isOpenFor(element())}
          onMouseEnter={(event) => cards().hover(event.currentTarget, local.memberId)}
          onMouseLeave={() => cards().leave()}
          onFocus={(event) => {
            // Keyboard focus moving here within the page; not the window coming back to a
            // trigger that kept focus, whose card was dismissed or closed with the window.
            if (event.relatedTarget && event.currentTarget.matches(":focus-visible"))
              cards().show(event.currentTarget, local.memberId);
          }}
          onBlur={(event) => cards().blur(event.relatedTarget as Node | null)}
          onClick={(event) => cards().pin(event.currentTarget, local.memberId)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              cards().pin(event.currentTarget, local.memberId);
            } else if (
              event.key === "Tab" &&
              !event.shiftKey &&
              cards().isOpenFor(event.currentTarget) &&
              cards().enter()
            )
              event.preventDefault();
          }}
        >
          {local.children}
        </span>
      )}
    </Show>
  );
}
