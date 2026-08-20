# Accessibility audit

Audit baseline: WCAG 2.2 level AA, TrackIt 0.1.0. Re-run this audit before each public release.

## Scope and evidence

The Today, Nutrition, Journal, Trends, Connections, Settings, locked-server, quick-add, and mobile
navigation states are covered. `npm run test:e2e` runs axe-core WCAG A/AA rules in desktop and Pixel
7 viewports, a keyboard bypass-block flow, the critical keyboard/touch-compatible journal flow, and
a four-times CPU-throttled phone interaction. The critical journal flow also runs on Firefox and
WebKit. The recent-meal flow is gated to one interaction and a confirmation within 20 seconds on
desktop and mobile. Component tests cover Today, Journal, and quick-add behavior.

The code review checked these WCAG areas that automated tooling cannot fully establish:

| Area                   | Result and evidence                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page structure         | One page-level heading per route; semantic `main`, `header`, `nav`, sections, lists, labels, and a keyboard-visible skip link.                                                            |
| Keyboard               | Native controls are used for actions; menus, modals, selects, and dialogs use Mantine focus management; escape and tab behavior remain library-native.                                    |
| Focus                  | A visible skip link appears on focus; Mantine focus rings are retained; disabled controls are not the only explanation of state.                                                          |
| Names and status       | Icon-only actions have accessible names, progress bars are named, loading indicators are named, and errors/successes use alert/status components.                                         |
| Contrast               | Muted text, navigation labels, primary actions, and status badges were remediated and are enforced by axe in light mode.                                                                  |
| Reflow and target size | Layouts reflow at 320 CSS pixels; primary targets are at least 36 pixels and mobile navigation targets are 58 pixels high. No two-dimensional scrolling is required for ordinary content. |
| Motion and timing      | No essential timed interaction or auto-playing motion exists. Pairing/confirmation expiry is explained and can be regenerated.                                                            |
| Touch and alternatives | All pointer interactions are single-pointer taps with keyboard equivalents; no drag, path gesture, or device-motion input is required.                                                    |

## Release gate

There are no known critical or serious WCAG A/AA findings. Automated results are a regression gate,
not a substitute for assistive-technology testing. Before a stable release, repeat smoke tests with
current NVDA/Chrome and VoiceOver/Safari and record any newly discovered issue in the changelog.
