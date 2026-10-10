# Bryz Jobs

Bryz Jobs is a private job application tracker. It is a single `index.html` file (HTML + CSS + JS, no build step, no libraries) plus small `assets/` for the logo. The project still lives in the `supbrice/pipely` repo.

## Open it locally

- Double-click `index.html`, or
- Run `python3 -m http.server 8766 --bind 127.0.0.1` in this folder and open http://127.0.0.1:8766/

## Live URL

https://supbrice.github.io/pipely/ (GitHub Pages from `main` / root of the public repo https://github.com/supbrice/pipely).

The code is public. Your applications are not committed to the repo. They live in the browser (`localStorage` key `brice-job-apps-v1`) and can optionally sync through a **secret GitHub Gist**.

## Cloud sync (private Gist)

Preferences → **Cloud sync** stores settings under `brice-job-apps-sync` in this browser only.

- **Gist ID** — identifies the secret gist that holds `pipely-apps.json`. Pull uses the public raw URL for that secret gist (no token required).
- **GitHub token** — optional. Needed only to **Push** updates back to the gist. Create a classic token with the **gist** scope only: https://github.com/settings/tokens/new?scopes=gist&description=Bryz%20Jobs%20cloud%20sync  
  Paste it in Preferences and click Save. The token never goes into this git repo.
- **Auto-pull** — when this browser only has sample rows, Bryz Jobs replaces them with the gist list on load.
- **Auto-push** — after saves, pushes to the gist when a token is set.

Do not commit personal access tokens or application JSON to the public repo. The gist stays secret (unlisted); anyone who knows the raw gist URL can read it, so treat that ID like a private link.

## Features

- Overview cards are clickable: Total, In progress, Interviews scheduled, Offers, Rejected, and Response rate each open the matching applications. A short upcoming-follow-ups list links to the Follow-ups screen.
- Follow-ups has its own screen, in the sidebar and on the phone nav, with a count on that item, a count in the tab title, and Followed up / Snooze buttons.
- Pipeline stages: Interested, Applied, Screening, Interview, Offer, Rejected, Withdrawn. Interested is a stage before Applied. Existing statuses keep their meaning.
- If saved applications cannot be read, the original `brice-job-apps-v1` value is left in place and copied to `brice-job-apps-v1-unreadable-<timestamp>`. The banner can download that raw value, retry, or repair (keep valid rows, skip bad ones, only after you confirm).
- Response rate: share of applications sent 14+ days ago (withdrawn left out) that moved to Screening, Interview, Offer, or Rejected.
- Import takes a Bryz Jobs JSON backup or a tracker CSV. Merge matches by id and keeps interview logs.
- Warns when you add an application at a company where you already have an active one.
- Per-application interview log (date, type, note).

## Moving data between browsers

Prefer Cloud sync (Pull / Push). You can still Export JSON / Import JSON, or from a local preview use Send to live site (tab-to-tab postMessage; nothing uploaded to GitHub).

## Where your data lives

- Applications: `brice-job-apps-v1`. An unreadable copy, if reading fails, is also kept under `brice-job-apps-v1-unreadable-<timestamp>`.
- Selected tab: `brice-job-apps-view`
- Sync settings (gist id + optional token): `brice-job-apps-sync`
- Theme (`light` or `dark`): `brice-job-apps-theme`. If that key is unset, Bryz Jobs follows the system color scheme. The header toggle saves a choice.

Export JSON before using Replace. Clear samples deletes only the built-in examples. Files named `index.html.bak-*` are page backups, not application data, and are not committed.

This page is not part of the public portfolio.
