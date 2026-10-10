# Bryz Jobs

A private job application tracker. Static site, no build step, no libraries. Published at <https://supbrice.github.io/pipely/> (GitHub Pages from `main` of `supbrice/pipely`).

The code is public. Your applications are not in the repo. They live in this browser's `localStorage` and can optionally sync through a secret GitHub Gist.

## Open it locally

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8766/>.

## What's on the page

- **Overview**: total applications, in progress, interviews, offers, and response rate. Each card filters the pipeline.
- **Pipeline**: search, status chips (Interested, Applied, Screening, Interview, Offer, Rejected, Withdrawn), and the list, 40 at a time with Show more. Change status inline, edit, open details, delete with undo.
- **Board**: one column per stage (Interested, Applied, Screening, Interview, Offer, then Rejected and Withdrawn). Drag a card to another column, or use the menu on the card (works on touch and keyboard). Undo is offered right after. Long columns show 20 cards with Show all.
- **Insights**: applications per week by source (last 8 weeks), counts by stage, where you applied, and a daily activity heatmap (last 12 weeks). All of it is counted from your list.
- **Interviews**: upcoming Interview or Screen entries from each application's log.
- **Follow-ups**: active applications whose next follow-up is within 7 days, with Followed up (logs it and sets the next one a week out) and Snooze 3 days.
- **Rejected**: every rejection with how many there are, the median days to a no (read from the log or notes when a date is there), and the top source. Search, filter by source, sort, and optionally include withdrawn.
- **Activity**: the latest log entries.
- **Your data**: Export JSON or CSV, Import JSON or CSV (Merge or Replace, with a preview), and Cloud sync.

**Interested** is for jobs you have not applied to yet. It is left out of the response rate and the charts, and it counts for follow-ups. Older records and older copies of the gist load unchanged; a record only gets the Interested status when you pick it. Note: a browser still running the old page before the redesign skips Interested records when it pulls from the gist.

Numbers: In progress = Screening + Interview. Response rate = applications sent 14 or more days ago (Interested and Withdrawn left out) that are no longer Applied. Follow-ups = Interested, Applied, Screening or Interview with a next follow-up that is overdue or within 7 days. Status names are matched ignoring case and extra spaces for counting; the stored text is not changed.

**Dark mode** is opt-in: the moon button in the header switches it and saves the choice under `brice-job-apps-theme` (the same key the old page used). Light is the default for everyone, whatever the system setting.

Adding an application at a company where you already have an active one shows a warning. A first visit starts empty; there is no sample data. If a browser still has the old built-in examples, a banner offers to remove them.

## Where your data lives

- Applications: `brice-job-apps-v1`, a JSON array of `{id, company, role, status, dateApplied, nextFollowUp, source, pay, link, notes, isSample, log}`. Loading never rewrites it, and editing a record keeps any field the form does not show.
- Sync settings (gist id, optional token, auto-pull, auto-push): `brice-job-apps-sync`, this browser only.
- Theme choice (`dark` or `light`): `brice-job-apps-theme`. Unset means light.
- If the stored applications cannot be read, the text is copied to `brice-job-apps-v1-unreadable-<timestamp>`, a banner explains it, and saving stays off so nothing is overwritten.

## Cloud sync (secret Gist)

Your data → **Cloud sync**.

- **Gist ID**: the secret gist that holds `pipely-apps.json`. Pull reads the raw gist URL; no token needed.
- **GitHub token** (optional): needed only to **Push**. Use a classic token with only the `gist` scope: <https://github.com/settings/tokens/new?scopes=gist&description=Bryz%20Jobs%20cloud%20sync>. It stays in this browser.
- **Auto-pull**: on load, if this browser is empty or only has examples, the gist list fills it. Otherwise a banner offers to pull.
- **Auto-push**: after a save, pushes to the gist when a token is set.

A link ending in `#pipely-gist=<gist id>` saves that gist id with auto-pull on and then clears itself from the address bar, which is the quickest way to set up a new device.

Do not commit tokens or application JSON to this repo (`.gitignore` excludes `*.json` and `*.csv`; the test fixture is fake data added on purpose). Anyone with the raw gist URL can read it, so treat the gist id like a private link.

## Tests

```sh
node --test tests/*.test.js
```

`tests/views.check.js` loads a record file (default: the fixture), computes every count straight from the JSON, and checks that the KPIs, chips, stage chart, board columns, Rejected view and follow-ups show exactly those numbers. It also covers dragging a card, the card menu, undo, Interested round-tripping through export/import, light-by-default with a dark system setting, the dark toggle, and layout in light and dark at 390/768/1440 px.

`tests/browser.check.js` drives the page in Chrome with the fake records in `tests/fixtures/apps.json`. It checks that loading writes nothing, CRUD and undo, reload persistence, export/import, the `#pipely-gist` link and auto-pull against a mocked gist (every write to GitHub is blocked), the unreadable-data banner, layout at 390/768/1440 px, and console errors. It needs `playwright-core` and Chrome (`CHROME=/path/to/chrome` if it is not at `/usr/bin/google-chrome`):

```sh
npm i --no-save playwright-core && node tests/browser.check.js
```

This page is not part of the public portfolio.
