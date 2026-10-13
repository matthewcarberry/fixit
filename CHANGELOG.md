# Changelog

## Unreleased

- Passkeys: sign in with Face ID, a fingerprint or a phone's screen lock instead of a password. Add one in Settings, then use "Sign in with a passkey". Passkeys need Fixit's https address, and they belong to that address, so changing `FIXIT_PUBLIC_URL` later means adding them again. When the admin resets someone's password, that person's passkeys are removed.

## 0.2.0

- New people get a welcome email with their sign-in details when email is set up. Without email, Fixit shows the admin the details to pass on.
- People added by the admin, or whose password the admin resets, choose their own password the next time they sign in.
- The admin can delete a person for good, after typing their name to confirm. This removes their account, the tickets they reported (with photos, messages and history) and anything they wrote on other tickets.

## 0.1.0

First version.

- Tickets with photos, optional categories, urgency and location
- Admin queue with filters, sorting and search
- Comments with private internal notes, and a full change history
- Automatic reminders while waiting on the requester, and automatic closing
- Push notifications, optional email
- Installable web app, light and dark mode
- Single Docker container with an Unraid template
