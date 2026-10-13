import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SignIn } from "../api/contracts.ts";

export interface SessionStore {
  readonly read: () => SignIn.Session | undefined;
  readonly write: (session: SignIn.Session | undefined) => void;
  readonly subscribe: (changed: () => void) => () => void;
}

const decode = Schema.decodeUnknownOption(Schema.fromJsonString(SignIn.Session));
const encode = Schema.encodeSync(Schema.fromJsonString(SignIn.Session));

/** Browser and Tauri webviews share this adapter; blocked storage degrades to memory. */
export function createBrowserSessionStore(apiBaseUrl: string): SessionStore {
  const key = `amends.session.v1:${apiBaseUrl}`;
  return {
    read: () => {
      try {
        const stored = window.localStorage.getItem(key);
        if (stored === null) return undefined;
        const decoded = decode(stored);
        if (Option.isSome(decoded)) return decoded.value;
        window.localStorage.removeItem(key);
      } catch {
        /* Storage may be unavailable in this webview. */
      }
      return undefined;
    },
    write: (session) => {
      try {
        if (session) window.localStorage.setItem(key, encode(session));
        else window.localStorage.removeItem(key);
      } catch {
        /* The current provider still owns the in-memory session. */
      }
    },
    subscribe: (changed) => {
      const onStorage = (event: StorageEvent) => {
        try {
          if (
            event.storageArea === window.localStorage &&
            (event.key === key || event.key === null)
          )
            changed();
        } catch {
          /* No readable storage to synchronize. */
        }
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}
