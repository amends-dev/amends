# Page header

Compose `Root > Crumbs + Heading(Title + Actions) + Meta` in the page shell.
Only Title is required. Apps provide route context, actions, and metadata
as ordinary children; the composition owns no routes or API data. Title is the page's
`h1`, set in Instrument Serif at 34px on larger screens and 26px on phones. Crumbs and
metadata use compact IBM Plex Mono. The reference positions the title and optional
action on one row when they fit and lets them wrap on narrow screens.

Place Root inside `Shell.Header workspace` and use `Shell.Main workspace` with
`Shell.Content` so the header and body share 30px desktop or 18px phone gutters.
To keep one quiet action right beside the title, such as renaming what the page shows, wrap
the Title and that action in `Lead`; Actions stay at the end of the row, and the lead wraps on
narrow screens. The WithLead stories show a group page's header.

Segmented section navigation is a separate sibling at the start of page content.
Sign-in and workspace selection keep the standalone Shell header.
