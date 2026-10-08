# Pipely

Pipely is a private job application tracker. It is a single `index.html` file (HTML + CSS + JS, no build step, no libraries).

## Open it locally

- Double-click `index.html`, or
- Run `python3 -m http.server 8766 --bind 127.0.0.1` in this folder and open http://127.0.0.1:8766/

## Live URL

https://supbrice.github.io/pipely/ (GitHub Pages from `main` / root of the public repo https://github.com/supbrice/pipely).

The code is public. Your applications are not: they live only in the browser you open the page in, so the live site and the local copy each keep their own separate list. Use Export JSON / Import JSON to move data between them.

## Features

- Overview cards are clickable: Total, In progress, Interviews, Offers, Follow-ups due, and Response rate each open the matching applications.
- Follow-up reminders: an overdue banner at the top of Overview, a count in the tab title, and Followed up / Snooze buttons. Followed up writes a log entry and sets the next follow-up 7 days out.
- Response rate: share of applications sent 14+ days ago (withdrawn and closed postings left out) that moved to Screening, Interview, Offer, or Rejected.
- Import takes a Pipely JSON backup or a tracker CSV (Date applied, Company, Role, Location, Source, Status, Next step, Follow-up date, Apply URL, Job ID, Cover letter, Notes). Merge matches records by id and keeps your interview logs.
- Warns you when you add an application at a company where you already have an active one.
- Per-application interview log (date, type, note), stored in the optional `log` field. Older records without it still work.

## Moving data to the live site

Sidebar, then Export & backup. From the local preview, Send to live site opens the live page and passes your list over tab to tab with postMessage. Nothing is uploaded. The live page accepts data only from a 127.0.0.1 or localhost tab that opened it, and it asks you to choose Merge or Replace first. You can always Download JSON backup instead, then use Import on the other page.

## Where your data lives

Applications stay in the browser you use, under localStorage key `brice-job-apps-v1`. The selected tab is stored under `brice-job-apps-view`. Nothing is sent to a server, and this repo contains no application data. Each browser or device has its own separate list.

Export JSON before using Replace. Clear samples deletes only the built-in example records, not applications you added. Files named `index.html.bak-*` are backups of the page file, not of your application data, and are not committed.

This page is not part of the public portfolio.
