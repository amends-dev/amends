import { RegistryContext, useAtom, useAtomRefresh, useAtomValue } from "@effect/atom-solid";
import { Exit } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { createEffect, createSignal, onCleanup, useContext } from "solid-js";
import { useSession } from "../session/boundary.tsx";
import { isNotMember, isUnauthorized } from "./errors.ts";
import { Me } from "./me.ts";

export function useQuery<A, E>(atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>) {
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const session = useSession();
  const registry = useContext(RegistryContext);
  const refreshMembership = () => registry.refresh(Me.workspaces());
  createEffect(() => {
    const current = result();
    if (!AsyncResult.isFailure(current)) return;
    if (isUnauthorized(current.cause)) session.replace(undefined);
    else if (isNotMember(current.cause)) refreshMembership();
  });
  return { result, refresh };
}

/** One command per owner; duplicate submissions and disposed callbacks have no effect. */
export function useCommand<Arg, A, E>(atom: Atom.AtomResultFn<Arg, A, E>) {
  const [result, execute] = useAtom(() => atom, { mode: "promiseExit" });
  const [pending, setPending] = createSignal(false);
  const session = useSession();
  const registry = useContext(RegistryContext);
  const refreshMembership = () => registry.refresh(Me.workspaces());
  let active = true;
  onCleanup(() => {
    active = false;
  });
  const run = async (input: Arg): Promise<Exit.Exit<A, E> | undefined> => {
    if (!active || pending()) return undefined;
    setPending(true);
    try {
      const exit = await execute(input);
      if (!active) return undefined;
      if (Exit.isFailure(exit)) {
        if (isUnauthorized(exit.cause)) {
          session.replace(undefined);
          return undefined;
        }
        if (isNotMember(exit.cause)) refreshMembership();
      }
      return exit;
    } finally {
      if (active) setPending(false);
    }
  };
  return { result, pending, run };
}
