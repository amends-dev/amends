import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  splitProps,
  untrack,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { Button, type ButtonProps } from "../button/index.ts";
import { OverlayHostContext } from "../overlay/scope.ts";
import { callHandler, classes } from "../internal/props.ts";

export interface RootProps extends ParentProps {
  id?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  animated?: boolean;
  /** Gate Escape and backdrop dismissal, for example while submitting. */
  dismissible?: boolean;
  initialFocus?: () => HTMLElement | undefined;
  returnFocus?: () => HTMLElement | undefined;
}
export type ContentProps = Omit<JSX.DialogHtmlAttributes<HTMLDialogElement>, "open" | "id">;

/** Shared native modal behavior; each composition supplies its own visual parts. */
export function createModalParts(
  name: string,
  s: { content: string; title: string; description: string },
) {
  interface State {
    id: Accessor<string>;
    open: Accessor<boolean>;
    setOpen: (open: boolean) => void;
    animated: Accessor<boolean>;
    dismissible: Accessor<boolean>;
    initialFocus?: () => HTMLElement | undefined;
    returnFocus?: () => HTMLElement | undefined;
    title: Accessor<boolean>;
    setTitle: (present: boolean) => void;
    description: Accessor<boolean>;
    setDescription: (present: boolean) => void;
  }
  const Context = createContext<State>();
  function context() {
    const state = useContext(Context);
    if (!state) throw new Error(`${name} parts require ${name}.Root`);
    return state;
  }
  function Root(props: RootProps) {
    const generated = createUniqueId(),
      [internal, setInternal] = createSignal(untrack(() => props.defaultOpen ?? false));
    const [title, setTitle] = createSignal(false),
      [description, setDescription] = createSignal(false);
    return (
      <Context.Provider
        value={{
          id: () => props.id ?? `${name.toLowerCase()}-${generated}`,
          open: () => props.open ?? internal(),
          setOpen: (open) => {
            if (props.open === undefined) setInternal(open);
            props.onOpenChange?.(open);
          },
          animated: () => props.animated ?? true,
          dismissible: () => props.dismissible ?? true,
          initialFocus: () => props.initialFocus?.(),
          returnFocus: () => props.returnFocus?.(),
          title,
          setTitle,
          description,
          setDescription,
        }}
      >
        {props.children}
      </Context.Provider>
    );
  }
  function useModal() {
    const state = context();
    return { open: state.open, close: () => state.setOpen(false) };
  }
  function Trigger(props: ButtonProps) {
    const state = context();
    const [local, native] = splitProps(props, ["onClick"]);
    return (
      <Button
        {...native}
        aria-haspopup="dialog"
        aria-expanded={state.open()}
        aria-controls={state.id()}
        onClick={(event) => {
          callHandler(local.onClick, event);
          if (!event.defaultPrevented) state.setOpen(true);
        }}
      />
    );
  }
  function Content(props: ContentProps) {
    const state = context();
    const [local, native] = splitProps(props, [
      "ref",
      "class",
      "classList",
      "children",
      "onCancel",
      "onClose",
      "onClick",
      "onPointerDown",
      "onAnimationEnd",
    ]);
    const [element, setElement] = createSignal<HTMLDialogElement>();
    const [phase, setPhase] = createSignal<"open" | "closing" | "closed">("closed");
    let previous: HTMLElement | undefined,
      outsideDown = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const restore = () => {
      if (!previous) return;
      const target = state.returnFocus?.() ?? previous;
      if (target?.isConnected && !target.closest("[hidden], [inert]"))
        target.focus({ preventScroll: true });
      previous = undefined;
    };
    const finish = () => {
      clear();
      const dialog = element();
      if (dialog?.open) dialog.close();
      setPhase("closed");
      restore();
    };
    createEffect(() => {
      const dialog = element(),
        open = state.open(),
        animated = state.animated();
      if (!dialog) return;
      untrack(() => {
        clear();
        if (open) {
          if (!dialog.open) {
            previous =
              dialog.ownerDocument.activeElement instanceof HTMLElement
                ? dialog.ownerDocument.activeElement
                : undefined;
            dialog.showModal();
          }
          setPhase("open");
          (
            state.initialFocus?.() ??
            dialog.querySelector<HTMLElement>("[data-modal-title]") ??
            dialog
          ).focus({ preventScroll: true });
        } else if (dialog.open) {
          setPhase("closing");
          if (
            !animated ||
            dialog.ownerDocument.defaultView?.matchMedia("(prefers-reduced-motion: reduce)").matches
          )
            finish();
          else timer = setTimeout(finish, 220);
        }
      });
    });
    onCleanup(finish);
    const outside = (event: MouseEvent) => {
      const dialog = element();
      if (!dialog || event.target !== dialog) return false;
      const rect = dialog.getBoundingClientRect();
      return (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      );
    };
    return (
      <OverlayHostContext.Provider value={element}>
        <dialog
          {...native}
          id={state.id()}
          tabIndex={-1}
          class={classes(s.content, local.class, local.classList)}
          data-frontend-modal
          {...{ [`data-frontend-${name.toLowerCase()}`]: "" }}
          data-phase={phase()}
          data-animated={state.animated()}
          aria-labelledby={
            props["aria-labelledby"] ?? (state.title() ? `${state.id()}-title` : undefined)
          }
          aria-describedby={
            props["aria-describedby"] ??
            (state.description() ? `${state.id()}-description` : undefined)
          }
          ref={(node) => {
            setElement(node);
            if (typeof local.ref === "function") local.ref(node);
          }}
          onCancel={(event) => {
            callHandler(local.onCancel, event);
            if (!event.defaultPrevented) {
              event.preventDefault();
              if (state.dismissible()) state.setOpen(false);
            }
          }}
          onClose={(event) => {
            callHandler(local.onClose, event);
            if (!event.currentTarget.open && state.open()) {
              state.setOpen(false);
              restore();
            }
          }}
          onPointerDown={(event) => {
            callHandler(local.onPointerDown, event);
            outsideDown = !event.defaultPrevented && outside(event);
          }}
          onClick={(event) => {
            callHandler(local.onClick, event);
            if (state.dismissible() && outsideDown && outside(event) && !event.defaultPrevented)
              state.setOpen(false);
            outsideDown = false;
          }}
          onAnimationEnd={(event) => {
            callHandler(local.onAnimationEnd, event);
            if (event.target === element() && phase() === "closing") finish();
          }}
        >
          {local.children}
        </dialog>
      </OverlayHostContext.Provider>
    );
  }
  function Title(props: JSX.HTMLAttributes<HTMLHeadingElement>) {
    const state = context();
    state.setTitle(true);
    onCleanup(() => state.setTitle(false));
    const [local, native] = splitProps(props, ["class", "classList"]);
    return (
      <h2
        {...native}
        id={`${state.id()}-title`}
        tabIndex={-1}
        data-modal-title
        class={classes(s.title, local.class, local.classList)}
      />
    );
  }
  function Description(props: JSX.HTMLAttributes<HTMLParagraphElement>) {
    const state = context();
    state.setDescription(true);
    onCleanup(() => state.setDescription(false));
    const [local, native] = splitProps(props, ["class", "classList"]);
    return (
      <p
        {...native}
        id={`${state.id()}-description`}
        class={classes(s.description, local.class, local.classList)}
      />
    );
  }

  return { Root, Trigger, Content, Title, Description, useModal, context };
}
