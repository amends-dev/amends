import { Atom } from "effect/unstable/reactivity";
import type { SignIn } from "../api/contracts.ts";

/** Seeded by SessionProvider, never shared through a global registry. */
export const sessionAtom = Atom.make<SignIn.Session | undefined>(undefined).pipe(Atom.keepAlive);
/**
 * Seeded by SessionProvider with the sign-out for its own credential scope. The HTTP layer calls
 * it when the host rejects that credential; a scope already replaced ignores the call.
 */
export const signOutAtom = Atom.make<() => void>(() => () => {}).pipe(Atom.keepAlive);
