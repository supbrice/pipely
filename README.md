# Pipely

Pipely is a private job application tracker. It is a single `index.html` file (HTML + CSS + JS, no build step, no libraries).

## Open it locally

- Double-click `index.html`, or
- Run `python3 -m http.server 8766 --bind 127.0.0.1` in this folder and open http://127.0.0.1:8766/

## Live URL

https://supbrice.github.io/pipely/ (GitHub Pages from `main` / root of the public repo https://github.com/supbrice/pipely).

The code is public. Your applications are not: they live only in the browser you open the page in, so the live site and the local copy each keep their own separate list. Use Export JSON / Import JSON to move data between them.

## Where your data lives

Applications stay in the browser you use, under localStorage key `brice-job-apps-v1`. The selected tab is stored under `brice-job-apps-view`. Nothing is sent to a server, and this repo contains no application data. Each browser or device has its own separate list.

Export JSON before using Replace. Clear samples deletes only the built-in example records, not applications you added. Files named `index.html.bak-*` are backups of the page file, not of your application data, and are not committed.

This page is not part of the public portfolio.
