# Changelog

Releases after 0.3.0 have their notes on the [Releases page](https://github.com/matthewcarberry/fixit/releases), written automatically from the pull requests each one includes.

## 0.3.0

- Passkeys: sign in with Face ID, a fingerprint or a phone's screen lock instead of a password. Add one in Settings, then use "Sign in with a passkey". Settings lists your passkeys with when each was added and last used, and you can rename or remove them. Passwords keep working.
- Passkeys need Fixit's https address, and they belong to that address, so changing `FIXIT_PUBLIC_URL` later means adding them again.
- When the admin resets someone's password, that person's passkeys are removed too.
- Ready for Unraid Community Applications: the repository now has a maintainer profile (`ca_profile.xml`), the template links to its readme and this changelog, and CI checks the template still matches what the container reads.

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
