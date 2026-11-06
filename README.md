# USC Transplant Surgery Fellowship — Time Off

The time-off site for the USC Transplant Surgery Fellowship: **https://timeoff.usctransplant.life**

This repository holds only the pages. GitHub Pages serves them. They contain no personal data.
The server, the rules and the calendar settings live in the private `timeoff-backend` repository.
Its README covers administration, accounts and handover for all three sites.

## What people can do

**Fellows with Edit**

- Request a Thursday–Sunday weekend off, or vacation days.
- Add conferences and other time off. These count toward the 20 days.
- Remove their own time off.
- Change vacation and conference days on past dates too. Weekends change only before they start.
- See who else is off each month and who cross-covers.
- Browse any month of the year shown in the header.

**People with View** see who is off each month and who cross-covers.

**Admins** use `/admin/`. They can:

- Add or remove time off for any fellow, past or future.
- Assign extra weekend days and custom time off.
- Change cross-cover.
- See every fellow's totals.
- Run "Check rules" on the whole calendar, then fix what it finds with one click.

The portal (https://portal.usctransplant.life) sets each person's role.
From May 1, the header switches between this academic year and next. On Aug 1, the old year disappears.

## How it fits together

```
Browser ──► this repository (GitHub Pages)
   │  "Sign in with Google" or an emailed code → a sign-in token
   ▼
Apps Script web app (private repository: timeoff-backend)
   checks the token and the member list, applies the rules,
   reads and writes the fellowship calendars as the fellowship account
```

One sign-in covers the time-off site, the call schedule and the portal.
People sign in with Google or with a code emailed to any address. New people sign up in the portal.

## Files

| File | Purpose |
|---|---|
| `index.html` | Main page. Fellows request time off; viewers see the month |
| `admin/index.html` | Admin page |
| `assets/timeoff.js` | Parts both pages draw the same way: month grid, weekend choices, "Already off" list, conference form |
| `assets/api.js` | **Settings** (server URL, sign-in client ID, portal addresses), sign-in, server calls. Shared |
| `assets/ui.js` | Small page helpers: elements, dates, messages. Shared |
| `assets/styles.css` | Styles for every page, including the pager header and light and dark themes. Shared |
| `assets/fonts/` | Doto (pager screen) and Atkinson Hyperlegible Next (text), under the SIL Open Font License. Shared |
| `privacy.html` | Privacy page for all three sites. The Google sign-in screen links to it |
| `CNAME` | Custom domain for GitHub Pages |

"Shared" files must match in `timeoff`, `schedule` and `portal`.
The **Shared files** check in `schedule` and `portal` fails when the copies differ.
The server repository's settings check also compares them.

## Making changes

- **Pages**: edit here and commit to `main`. GitHub Pages publishes within a minute or two.
- **Shared files**: make the same change in `schedule` and `portal`.
- **`assets/timeoff.js`**: one change updates both the main page and the admin page.
- **Rules** (limits, cross-cover priority, windows): edit `timeOffRules.gs` in `timeoff-backend`.
- **New server URL**: update `API_URL` in `assets/api.js` on all three sites.
- **New sign-in client**: update `CLIENT_ID` in `assets/api.js` on all three sites.
  Also update the portal's `session.html` and `TO_API.CLIENT_ID` in `api.gs`.
- **Changes that touch the server too**: use the same branch name in each repository. Merge the pages first.

## Trying it locally

```
python3 -m http.server 8000      # then open http://localhost:8000
```

Google sign-in works on `http://localhost:8000` because the sign-in client allows that origin.
Local pages use the real server and the real calendars.
For experiments, use the previews in `timeoff-backend` instead. They run on sample data.

## Hosting

- **GitHub Pages**: Settings → Pages → Deploy from branch `main`, folder `/`. Custom domain `timeoff.usctransplant.life`. Enforce HTTPS on.
- **DNS** (Squarespace, `usctransplant.life`): `CNAME timeoff → usc-transplant-surgery-fellowship.github.io`.
