# Manual browser test checklist

Run these checks in a browser against the real backend using real accounts. Do not use the integration check or synthetic accounts against the real application database. Leave every checkbox unticked until the owner performs that check.

## AC-01 — Registration

- [ ] Register a new account with a valid display name, email, and password.
- [ ] Confirm the app navigates to Login and shows the registration confirmation.

## AC-02 — Duplicate email

- [ ] Attempt to register another account with the same email.
- [ ] Confirm the server message and email field error are shown without losing the other form input.

## AC-03 — Login and wrong password

- [ ] Log in with the registered account and confirm the dashboard opens.
- [ ] Log out, enter the right email with a wrong password, and confirm the exact invalid-credentials form alert.

## AC-04 — Profile validation

- [ ] Submit the profile form with required fields empty and confirm each field-level error is shown.
- [ ] Try over-limit bio/interests and malformed URLs; confirm invalid fields are identified.

## AC-05 — Profile persistence after refresh

- [ ] Save the display name, bio, experience level, interests, and valid profile URLs.
- [ ] Refresh `/profile` and confirm the server-returned values remain visible and the header name is updated.

## AC-06 — Skill add and remove

- [ ] Add one catalogue skill to offered and wanted lists.
- [ ] Confirm the skill is removed from that panel's available choices, then remove it and confirm it returns.

## AC-07 — Discover and search

- [ ] Open Discover and confirm the other real developer accounts are listed without the signed-in account.
- [ ] Search by part of a developer's name, press Enter, then use the debounced search and browser back/forward.
- [ ] Confirm pagination/search state survives reload and results match the search.

## AC-08 — Matching explanation

- [ ] Add complementary offered/wanted skills using the real accounts.
- [ ] Open Matches and confirm the match type, score, overlap skill groups, and explanation are visible.
- [ ] Confirm the page describes the score as skill overlap, not as a probability or AI prediction.

## AC-09 — Send a collaboration request

- [ ] From another developer's profile, send a request with a message.
- [ ] Repeat with an empty optional message if desired and confirm the pending state replaces the action.

## AC-10 — Accept a request

- [ ] Sign in as the recipient and open Incoming requests.
- [ ] Accept the pending request and confirm the status becomes Accepted and both profiles show Connected.

## AC-11 — Reject a request

- [ ] Send a separate request to another real account.
- [ ] Choose Reject, confirm the inline irreversible-action warning, then confirm rejection.
- [ ] Sign in as the sender and confirm the rejected status and new-request hint are shown.

## AC-12 — Authorization and protected routes

- [ ] While logged out, open `/dashboard` or another protected deep link and confirm redirect to Login; after login, confirm return to the requested page.
- [ ] As a non-recipient, use the browser's network tools to attempt `POST /api/requests/{id}/accept` for another user's request and confirm the API returns `403 FORBIDDEN`.

## AC-13 — Persistence after backend restart

- [ ] Save profile and skill changes and create a request using real accounts.
- [ ] Restart the backend, refresh the browser, and confirm the profile, skills, request state, and session behavior match the server/database state.

## AC-14 — Full workflow

- [ ] Complete registration, login, profile completion, skill setup, discovery, matching, request sending, recipient acceptance or rejection, logout, and login again with real accounts.
- [ ] Confirm every screen reflects server data after refresh and no unexpected errors appear.
