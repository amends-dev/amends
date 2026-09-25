/** How long the page must be hidden or unfocused before its return counts as a wake. */
export const awayThreshold = 30_000;

/**
 * Call `resumed` when the browser comes back online, or when the page returns to view or focus
 * after being away for at least `away` milliseconds. A connection that outlived a sleep or a
 * network change can stay open without delivering anything, so readers refresh at these moments.
 */
export function watchWake(
  target: Window,
  resumed: () => void,
  away: number = awayThreshold,
): () => void {
  let awaySince: number | undefined = target.document.hidden ? Date.now() : undefined;
  const leave = () => {
    awaySince ??= Date.now();
  };
  const back = () => {
    if (target.document.hidden || awaySince === undefined) return;
    const elapsed = Date.now() - awaySince;
    awaySince = undefined;
    if (elapsed >= away) resumed();
  };
  const visibility = () => (target.document.hidden ? leave() : back());
  target.addEventListener("online", resumed);
  target.addEventListener("blur", leave);
  target.addEventListener("focus", back);
  target.document.addEventListener("visibilitychange", visibility);
  return () => {
    target.removeEventListener("online", resumed);
    target.removeEventListener("blur", leave);
    target.removeEventListener("focus", back);
    target.document.removeEventListener("visibilitychange", visibility);
  };
}
