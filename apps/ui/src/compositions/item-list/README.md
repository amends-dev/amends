# Item list

Compose `Root > Item > Link` with optional `Leading`, `Content > Title + Description`,
and `Meta`. Root renders a real list; Link requires an href and preserves native
anchor behavior. Do not nest controls in a link. Destination URLs and routing
belong to the caller.

The default is the flat roster row used in Settings, Agents, Environments,
Accounts, Connections, and Channels: transparent surface, a light dashed seam,
compact title and mono detail, and right-aligned metadata. In narrow containers,
metadata moves below the title and aligns after any leading mark. Workspace picker
membership rows use this same treatment. `variant="outline"` is for a separate
creation action. Long names wrap; the list has no compact mode or arrow-key
shortcuts. `aria-current="page"` marks a selected destination.

Comparison, Roster, RosterNarrow, Narrow, EnlargedRTL, and Activation cover both
themes, wrapping, semantics, and activation. Tab/Enter and browser link modifiers
work natively.

`Row` replaces Link when a row has independent controls. Place them in `Actions`,
alongside `Content`; this avoids nested links/buttons. The Actions story covers this shape.
