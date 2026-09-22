import { Atom } from "effect/unstable/reactivity";
import type { SignIn } from "../api/contracts.ts";

/** Seeded by SessionProvider, never shared through a global registry. */
export const sessionAtom = Atom.make<SignIn.Session | undefined>(undefined).pipe(Atom.keepAlive);
