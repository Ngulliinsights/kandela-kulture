# Kandela Kulture: website and RSVP backend

A multipage static site (29 pages) plus a small, dependency-free Node backend. Node 20 or later. No `npm install` needed.

```
public/      the website (static HTML, CSS, JS, fonts, patterns, logo sprite, service worker)
server/      app.js (API and static server), store.js (JSONL storage), start.js
data/        events.json (edit this to add gatherings), *.jsonl (created at runtime; never commit)
scripts/     purge.js (daily retention clean-up)
tests/       backend and site tests (node:test)
```

## Run

```
cp .env.example .env      # then export the values, or set them in your host
ADMIN_TOKEN=your-long-random-token npm start     # http://localhost:3000
npm test                  # 33 tests
```

## The experimental layer (assets/creative.js)

Progressive enhancement: the site works without it, and it respects reduced motion.

- **Living hero:** a field of flames with a drifting river of light; move or touch to ignite, and the light spreads.
- **Igniting headlines:** words light up one by one (whole words, so kerning is untouched). The full text stays in `aria-label`.
- **The wick:** a flame that travels down the page as you scroll (wide screens).
- **Constellation menu:** the sitemap as a network of Hearths. The accessible list stays underneath.
- **The Lighting room:** click one light and it spreads. Sound is off until asked; each light plays a pentatonic note.
- **Reading light:** manifesto words brighten as they reach the middle of the screen.
- **Passport:** tilts to touch, takes a stamp (Enter or Space works too).
- **Page transitions:** native cross-document view transitions where supported.

**Type and motion system** (`assets/style.css`): headings use Bricolage Grotesque with optical sizing, balanced wrapping and metric-matched fallbacks, so text does not jump when fonts load. Durations are tokens (`--t1` 140ms to `--t4` 760ms) with an expo-out easing (`--eo`). Content is never hidden without JavaScript. The menu opens as a circle of light from the button, with focus managed (Escape closes, focus returns). Page changes use native view transitions with a circular reveal from where you clicked (`assets/vt.js`, which must load before `app.js`).

To switch it all off, remove the `creative.js` script tag. Optional runtime check: `npm i jsdom --no-save && node tests/optional/dom-runtime.js`.

## Add or change gatherings

Edit `data/events.json` (id, title, date, time, area, bring, access, host, cap). Event pages and the gatherings list in `public/` are static, so ask the builder to regenerate them, or edit the HTML. The API reads `events.json` directly for capacity and dates.

## Endpoints

| Route | What it does |
| --- | --- |
| `POST /api/rsvp` | Saves a place. Validates a Kenyan number, requires 18+, records consent per purpose, ignores honeypot hits, refuses full or past events, idempotent per phone and event |
| `POST /api/stop` | Withdraws all consent for a number; never reveals whether it exists |
| `POST /api/enquiry` | Partner or collaborator enquiry |
| `GET /api/events` | Gatherings with spots left |
| `GET /api/admin/summary`, `/rsvps.csv` | Aggregate counts and a CSV export (formula-safe). Needs `Authorization: Bearer ADMIN_TOKEN` |
| `GET` or `DELETE /api/admin/subject?phone=` | Subject access and erasure (leaves a hashed tombstone, no number) |
| `POST /api/admin/purge` | Retention purge. Also `npm run purge` from cron |

## Data protection built in

Collect only first name, phone, optional needs. Consent is recorded per purpose with a timestamp and notice version, never pre-ticked. Data is deleted 90 days after a gathering unless the person opted in to future gatherings (their notes are still stripped). No cookies, no trackers, no third-party requests, strict CSP. The admin token is the only secret; keep `data/` outside any public path and back it up. Confirm registration, retention and wording with a Kenyan lawyer before launch.

## Before you go live

1. Replace the sample gatherings and every "Sample" label.
2. Set the WhatsApp number: `data-wa` on `<body>` in each page (digits only, e.g. 2547...), or edit `assets/app.js`.
3. Set a real domain in `public/sitemap.xml` and `robots.txt`.
4. Put the app behind HTTPS (a reverse proxy or host). Set `TRUST_PROXY=1` only if it sets `X-Forwarded-For`.
5. Write the safeguarding policy, then replace the summary on `safety.html`.
6. Have a designer rebuild the logo and patterns as production masters.
