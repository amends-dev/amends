# HTTP contract

`@amends/api-http` declares the public HTTP API with Effect `HttpApi`. It contains
no handlers, so servers and browser clients share it without leaking server code.
Every response and error is a core or gateway schema; this package only adds
HTTP status annotations, paths, and the authentication declaration.

## Groups

- `session`: `POST /session/email` requests a one-time code for an address and
  `POST /session/code` exchanges it for a session. Neither needs a credential.
- `me`: `GET /me/workspaces` lists the principal's memberships and pending
  invitations.
- `workspaces`: `POST /workspaces` creates a workspace owned by the authenticated
  human.
- `members`: `GET` and `DELETE /workspaces/:workspaceId/members/:memberId`.
- `invitations`: `POST /workspaces/:workspaceId/invitations` issues, `POST
…/:invitationId/accept` and `…/revoke` change state, and `POST …/enable`
  upgrades workspaces created before invitations existed.

Workspace IDs travel in the path so a host can route a request to the right
workspace before reading its body. Status codes follow `ApiErrors`: not a member,
denied, not owner, and not recipient are 403; missing records are 404; ownership
protection, repeated removal, existing membership, and storage conflicts are 409;
consumed or expired invitations are 410; rejected input, expiry, or permission
names are 400; and an uncertain commit is 500 with its commit ID.

## Authentication

`Authentication` is bearer middleware that provides `Principal`, the
authenticated human or agent identity. Hosts implement it by verifying the
credential; clients implement it by attaching one. Endpoints that only a human
may call fail with `HumanRequired` when the principal is an agent. The contract
does not define how credentials are issued.
