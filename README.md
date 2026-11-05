# Fellowship Time Off

The time-off request site for the USC Transplant Surgery Fellowship: **https://timeoff.usctransplant.life**

- **Fellows** request a Thursday–Sunday weekend off or vacation days, see who else is off and who cross-covers, add their own conferences and other time off (counted toward the 20 days), and remove their own time off. They can look at any month of the year; vacation and conference days can be added or removed on past dates too (weekends only before they start).
- **Viewers** (people with the viewer role, set in the portal) see who is off each month and who cross-covers.
- **Admins** (`/admin/`) do the same for any fellow, past or future, assign extra weekend days and custom time off, change cross-cover, see everyone's totals, and check the whole calendar against the rules (with buttons to fix what it finds).

## How it fits together

```
Browser ──► this repository (GitHub Pages: the pages people see)
   │
   │  "Sign in with Google" → a Google ID token
   ▼
Google Apps Script web app (private repository: timeoff-backend)
   checks the token with Google, applies the scheduling rules,
   reads and writes the fellowship Google Calendars as the fellowship account
```

This repository holds **only the pages**. There is no personal data here. The scheduling rules and the calendar settings are in the private `timeoff-backend` repository; who may use the site (fellows, viewers, admins) is set in the portal, https://portal.usctransplant.life. Signing in on any of the three fellowship sites (time off, call schedule, portal) signs you in on all of them.

| File | What it is |
|---|---|
| `index.html` | Main page (fellows request time off; viewers see the month) |
| `admin/index.html` | Admin page |
| `assets/api.js` | **Settings** (Apps Script URL, Google sign-in client ID, the portal's sign-in page), sign-in, and calls to the server |
| `assets/ui.js` | Small helpers the pages share (building the page, dates, messages) |
| `assets/styles.css` | Styles for all pages. The look (the pager header, colors, light and dark themes) is explained at the top of the file |
| `assets/fonts/` | The two fonts, stored here so nothing loads from elsewhere: Doto (the pager screen) and Atkinson Hyperlegible Next (everything else), both under the SIL Open Font License |
| `privacy.html` | Privacy page for all three sites (linked from the Google sign-in screen) |
| `CNAME` | The custom domain for GitHub Pages |

## Making changes

- **Page changes**: edit the HTML/CSS here and commit to `main`. GitHub Pages publishes within a minute or two.
- **Shared files** (`assets/styles.css`, `assets/ui.js`, `assets/api.js`, fonts) are the same on all three sites: make the same change in the `schedule` and `portal` repositories (their **Shared files** check warns when the copies differ).
- **Rule changes** (limits, cross-cover priority, …): these are in `timeOffRules.gs` in the private `timeoff-backend` repository, not here.
- **If the Apps Script deployment URL changes**, update `API_URL` in `assets/api.js` (on all three sites).
- **If the Google sign-in client changes**, update `CLIENT_ID` in `assets/api.js` (all three sites), in the portal's `session.html`, *and* `TO_API.CLIENT_ID` in the Apps Script project.

## Trying it locally

Sign-in only works on addresses listed under "Authorized JavaScript origins" for the client ID in Google Cloud (`https://timeoff.usctransplant.life`, plus `http://localhost:8000` for local testing):

```
python3 -m http.server 8000
```

then open http://localhost:8000. Pages run against the real calendars, so use the previews in `timeoff-backend` (sample data, a list of sample people to sign in as) for anything experimental.

## Hosting

- GitHub Pages: Settings → Pages → Deploy from branch `main` / root, custom domain `timeoff.usctransplant.life`, Enforce HTTPS.
- DNS (Squarespace, domain `usctransplant.life`): `CNAME  timeoff → usc-transplant-surgery-fellowship.github.io`.
