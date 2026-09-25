# Settings forms

`WorkspaceNameForm` and `InviteMemberForm` are controlled presentations built from
Field, Input, Select, Button, and layout primitives. Values, role choices, pending
state, and callbacks come from the caller; neither form knows routes or contracts.

Names and recipients require a nonblank value; invitation roles require a selection.
Recipient syntax and authorization belong to the host. The connected feature owns
expected values, retry keys, request feedback, and refresh. Compared with the legacy
mock, invitations address identities and have no transferable code. Theme is inherited.
