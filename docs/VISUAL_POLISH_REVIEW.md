# Visual polish review

Reviewed at desktop and Pixel 7 viewport sizes on 21 August 2026. Source captures are stored under
`docs/ui-screenshots/desktop` and `docs/ui-screenshots/mobile` for every primary route and nested
Settings page.

The screenshots use local demo mode, so server-backed screens intentionally show disconnected or
unavailable states. This is useful for evaluating the states most likely to be seen during initial
self-host setup.

## Findings implemented

- Profile settings exposed a raw HTML/JSON parser exception. It now shows a concise, actionable
  connection message without implementation details.
- Goals simultaneously showed an unavailable warning and a “No goals yet” empty state. The empty
  state is now suppressed when loading fails.
- Journal search and Nutrition administration competed with page titles on narrow screens. Mobile
  headers now stack, with actions wrapping across the available width.
- Journal category chips compressed and clipped their labels. Chips now retain their intrinsic
  width inside a horizontally scrollable row.
- The Settings overview repeated a large explanatory card below the navigation on mobile. The
  redundant card is hidden at that breakpoint.
- Connected-but-empty Security screens lacked context. Active sessions and security activity now
  have explicit empty-state explanations, and “Sign out all devices” is disabled when empty.
- Connection cards used excessive minimum height on mobile. They are more compact without changing
  hierarchy or touch targets.
- The Saved recipes empty state had cramped copy and action spacing. It now uses a deliberate
  compact vertical layout.

## Overall assessment

The desktop shell is consistent and balanced. Today is the densest page but maintains a clear
action-first hierarchy. Journal is the cleanest high-density screen. Nutrition, Goals, Connections,
and Settings now use space consistently and have clear task boundaries.

On mobile, the fixed seven-destination navigation is dense but each item remains readable and has a
usable target. A More menu would reduce density but hide important destinations; the current
tradeoff is appropriate for alpha. Fixed navigation can cover content while a full-page screenshot
is assembled, but normal scrolling provides bottom clearance and all content remains reachable.

No additional defect found in this pass justifies more interface complexity. Populated
server-backed states should be recaptured against a seeded release database before publishing
marketing or documentation images.
