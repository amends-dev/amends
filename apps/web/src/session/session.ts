import { SignIn } from "@amends/gateway/sign-in";
import { Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";

const sessionKey = "amends.session";
const lastWorkspaceKey = "amends.workspace";
const decodeSession = Schema.decodeUnknownOption(Schema.fromJsonString(SignIn.Session));
const encodeSession = Schema.encodeSync(Schema.fromJsonString(SignIn.Session));

const read = (key: string): string | undefined => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};
const write = (key: string, value: string | undefined) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* The session still works for this page when browser storage is unavailable. */
  }
};

/** The signed-in session, kept across reloads. Clearing it signs out. */
export const sessionAtom = Atom.writable<SignIn.Session | undefined, SignIn.Session | undefined>(
  () => {
    const stored = read(sessionKey);
    return stored === undefined
      ? undefined
      : decodeSession(stored).pipe((o) => (o._tag === "Some" ? o.value : undefined));
  },
  (context, value) => {
    write(sessionKey, value === undefined ? undefined : encodeSession(value));
    context.setSelf(value);
  },
).pipe(Atom.keepAlive);

/** The workspace opened most recently; the picker opens it by default next time. */
export const lastWorkspaceAtom = Atom.writable<string | undefined, string | undefined>(
  () => read(lastWorkspaceKey),
  (context, value) => {
    write(lastWorkspaceKey, value);
    context.setSelf(value);
  },
).pipe(Atom.keepAlive);
