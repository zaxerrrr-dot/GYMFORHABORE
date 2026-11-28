# Calendar feed

Settings → Integrations → **Calendar feed** makes a private address (an iCalendar / ICS feed) that
Apple Calendar, Google Calendar, Outlook, Thunderbird or any other calendar app can subscribe to.
It shows your planned sessions, and if you switch on "Show finished workouts too", the workouts
you finished. The calendar app fetches it again by itself, so a change in your plan shows up there
(how often is the app's choice: Apple and Outlook every hour or so, Google every few hours).

It needs an Habcore Gym server (the address is served by it) with API tokens on (the default; see
docs/API_TOKENS.md, `API_TOKENS`).

## Subscribing

- **Apple Calendar** (iPhone, Mac): tap "Open in my calendar app" in the sheet, or Calendar →
  File → New Calendar Subscription and paste the link.
- **Google Calendar**: on a computer, Other calendars → + → From URL, paste the link.
- **Outlook**: Add calendar → Subscribe from web, paste the link.

## What is in it

- Planned sessions from a week ago to eight weeks ahead, as all-day events named after the
  routine, with its exercises in the description. A day holds what the app's own day plan says:
  a pinned or moved session, a rest day you set, the weekday plan (a combined day is one event per
  routine). A coach week or a rotation has no fixed days, so its next session shows today only;
  sessions you pinned to a day show on that day.
- With "Show finished workouts too": every workout of the last 90 days as a timed event
  ("✓ Push", with the number of sets and the exercises). A past day with a workout shows the
  workout instead of the plan.

Nothing else: no body weight, no notes, no photos.

## The link is the key

Anyone with the link sees what it shows, so keep it to yourself. It is a token of its own kind
(`kind: calendar`, listed under Settings → API tokens as "Calendar feed"): it reads this one feed
and nothing else, every other route refuses it, and it ends with "Sign out everywhere", a new
password or a disabled account, like every token. "Make a new link" ends the old one at once;
"Turn off" ends it without a new one. The server keeps the token sealed (AES-GCM, with a key
derived from `DATA_DIR/secret`) so the sheet can show the link again.

A calendar app cannot send a header, so the token is in the path:
`https://your-server/api/calendar/ogt_….ics`. Reverse proxies log request paths; if your access
logs are shared with someone, leave them out for `/api/calendar/` or turn the feed off.

Each fetch counts against the token's per-minute budget (`TOKEN_READS_PER_MIN`), and the answer
may be cached by the client for 15 minutes.

## Sessions at a set time (Habcore Gym kl16)

A trainer can plan a session for a client at a time of day (gym panel → client → "Zaplanuj trening",
"Mój grafik", or while leading the client: Home / the day sheet). Those sessions are in the feed as
**timed events**, next to the all-day plan days, which stay as they were.

- Times are written in **UTC** (`DTSTART:20261201T170000Z`). Each occurrence of a weekly series is
  its own event (no `RRULE`), worked out from the wall time in Poraj (Europe/Warsaw) with that day's
  offset, so 18:00 stays 18:00 on both sides of the summer/winter time change. Google Calendar, Apple
  Calendar and Outlook all read a UTC time the same way; a `TZID` with our own `VTIMEZONE` is what
  Outlook subscriptions have misread before. `X-WR-TIMEZONE:Europe/Warsaw` names the calendar's zone.
- Every occurrence has its own `UID` (`sess-<id>-c-<user>@habcore-gym`) that never changes;
  `SEQUENCE` counts its changes and `LAST-MODIFIED` says when it last changed.
- Title: "Trening z trenerem {trener} – Habcore Gym" (English: "Workout with {trainer} – Habcore Gym"); the
  description has the plan, the trainer and the trainer's note; `LOCATION` is
  "Habcore, ul. Mickiewicza 25J, 42-360 Poraj".
- A cancelled session stays for two days as `STATUS:CANCELLED` ("Odwołany: …"), then leaves the feed.
- `REFRESH-INTERVAL` and `X-PUBLISHED-TTL` ask for an hourly refresh; the answer carries an `ETag`
  (an unchanged feed answers `304`) and `Cache-Control: private, max-age=900`. How often a calendar
  really asks is its own choice: Apple usually within an hour, Outlook every few hours, Google up to
  several hours. The app (and its notifications) is where a change shows at once.

### The trainer's feed

A trainer (or an admin) has a second address: "Mój grafik" → the calendar button. It holds every
session that trainer leads, of every client of the gym, titled with the client's **first name** and
the plan only ("Trening: Ania · Upper – Habcore Gym"), with no note and nothing about health. It is a
token of its own kind (`calendar-trainer`), made, shown again, renewed and turned off like the
client's, and it stops answering once the person is no longer a trainer of the gym.

## What a day shows (Habcore Gym kl18)

- **Finished workouts** ("Pokaż też zakończone treningi", on by default; a feed made before kl18 and not
  touched since shows them too): "✓ {plan name}" (the workout's plans, else the name it was saved with)
  at its real start and end (a workout logged without a length gets an hour), described in the
  profile's language: time, volume, sets, exercises.
- **Sessions planned with a trainer** (kl16): timed events, as above.
- **The plan of a day** (no time of its own): only today and the days ahead that have no workout yet,
  titled with the plan's name. A plan's icon is never in a title (`emoji` holds an icon's name such as
  "dumbbell" since the app's own icons). A day gone by without a workout is not shown; a planned day
  that was trained shows only the finished workout.
- "Today" is the profile's zone, Europe/Warsaw when it names none.
