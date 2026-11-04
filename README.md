# Fellowship Time Off

The time-off request site for the USC Transplant Surgery Fellowship: **https://timeoff.usctransplant.life**

- **Fellows** request a Thursday–Sunday weekend off or vacation days, see who else is off and who cross-covers, and remove their own upcoming time off.
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

This repository holds **only the pages**. There is no personal data here. The scheduling rules, the list of fellows and the calendar settings are in the private `timeoff-backend` repository and in the Apps Script project.

| File | What it is |
|---|---|
| `index.html` | Fellow page |
| `admin/index.html` | Admin page |
| `assets/api.js` | **Settings** (Apps Script URL, Google sign-in client ID), sign-in, and calls to the server |
| `assets/styles.css` | Styles for both pages |
| `privacy.html` | Privacy page (linked from the Google sign-in screen) |
| `CNAME` | The custom domain for GitHub Pages |

## Making changes

- **Page changes**: edit the HTML/CSS here and commit to `main`. GitHub Pages publishes within a minute or two.
- **Rule changes** (limits, cross-cover priority, …): these are in `timeOffRules.gs` in the private `timeoff-backend` repository, not here.
- **If the Apps Script deployment URL changes**, update `API_URL` in `assets/api.js`.
- **If the Google sign-in client changes**, update `CLIENT_ID` in `assets/api.js` *and* `TO_API.CLIENT_ID` in the Apps Script project.

## Trying it locally

Sign-in only works on addresses listed under "Authorized JavaScript origins" for the client ID in Google Cloud (`https://timeoff.usctransplant.life`, plus `http://localhost:8000` for local testing):

```
python3 -m http.server 8000
```

then open http://localhost:8000. Pages run against the real calendars, so use the previews in `timeoff-backend` (sample data, no sign-in) for anything experimental.

## Hosting

- GitHub Pages: Settings → Pages → Deploy from branch `main` / root, custom domain `timeoff.usctransplant.life`, Enforce HTTPS.
- DNS (Squarespace, domain `usctransplant.life`): `CNAME  timeoff → usc-transplant-surgery-fellowship.github.io`.
