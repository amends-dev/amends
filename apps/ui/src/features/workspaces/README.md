# Workspace creation form

Controlled presentation over Field, Input, Button, and Text. The caller owns the
name, pending state, validation/request errors, and submission. The form guards
pending submissions, rejects blank/whitespace-only names, preserves input identity,
and provides persistent status/error regions. It contains no route or API state.
Given `onMemberNameChange`, it also asks what people in the workspace will call the
creator, with `memberName` and its own `memberNameError`.

The first-run reference contributes its name field and heading. This form creates
only a workspace; it makes no claim about agent setup or later workspace renaming.
Comparison, Narrow, and Recovery cover themes, wrapping, validation, pending guards,
and retry without losing the draft; WithYourName covers the name field and its error.
