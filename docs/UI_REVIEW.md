# Today dashboard UX review

Status: accepted for implementation

## Outcome

TrackIt's visual foundation is strong, but the Today page currently behaves more like a data
report than a daily assistant. The redesign should help the user understand what matters and take
the next useful action without inspecting every card.

Target content balance:

- 45% status
- 25% insight
- 30% action

## Preferred hierarchy

1. Greeting and concise daily summary.
2. One contextual primary next action.
3. Compact health metrics.
4. Today's goals and progress.
5. One useful trend or insight.
6. Recent journal activity.

## Findings and decisions

### Contextual action

The header's generic Quick add action does not answer "What should I do next?" The dashboard will
select one contextual action, in this order: recover unavailable data, add an energy check-in, add
a missing weight reading, set a missing goal, or review trends when the day is sufficiently
complete.

### Missing metrics

Large cards containing only "No reading today" waste prime space and look inert. Missing metrics
will use explicit actions such as "How's your energy?" and "Add weight". Missing imported metrics
will direct users to data sources where appropriate.

### Goals

An empty progress bar must never represent a missing goal. Metrics without targets show a Set goal
action. Metrics with targets show value, target, unit, and percentage together.

### Trends

Charts require enough data to communicate a trend. Empty charts are replaced with a compact
explanation and a relevant call to action. A single observation is described as insufficient data
rather than presented as a trend.

### Journal and provenance

The dashboard shows three recent entries. Manual provenance ("You") is hidden because it is the
default; imported or machine-created sources stay visible. Full provenance remains available in
the Journal.

### Navigation and layout

Navigation is grouped into Daily, Explore, and Data. The desktop Today view uses a main column and
a useful side rail at wide widths. The collapsed navigation always retains a control to expand it.

### Quick add

Quick add can open directly to a contextual entry type. Labels describe the operation being saved,
and corrupted separator characters must not appear in user-facing copy.

## Implementation iterations

### Iteration 1: action hierarchy and honest empty states

- Add the daily summary and contextual next action.
- Make missing metric cards actionable.
- Do not render progress bars without goals.
- Replace empty and insufficient sleep charts.

### Iteration 2: density, provenance, and navigation

- Compact metric cards and journal activity.
- Show only meaningful provenance on Today.
- Group sidebar destinations and preserve expand/collapse controls.
- Use a right-side rail on wide screens.

### Iteration 3: Quick add

- Support contextual initial entry types.
- Clarify modal and submit labels.
- Prioritize common actions and repair copy encoding.

### Iteration 4: verification

- Cover action selection and empty states with component tests.
- Run formatting, linting, unit tests, and the production build.
- Confirm responsive and keyboard behavior in browser-level tests.

## Remaining-opportunity closure

The following opportunities were identified during the settings, Trends, and Nutrition review and
have now been implemented:

- Trends supports every observation metric plus calories, protein, carbohydrates, fat, fiber,
  sugar, saturated fat, sodium, and potassium. Cross-unit comparisons use independently normalized
  series and say so beside the chart.
- Goals retain their history. A goal can be retired with an effective end date instead of being
  overwritten or deleted.
- Foods, recipes, meal snapshots, CSV import, meal editing, and repeat logging preserve the
  extended nutrient set. Sodium and potassium use milligrams; the other nutrient amounts use grams.
- Nutrition determines “today” using the user's configured timezone, matching the rest of the
  application rather than the browser's incidental timezone.
- Settings sections are nested routes. Unknown settings URLs show a dedicated not-found state and
  an explicit route back to Settings.

### Further opportunities reviewed but intentionally not added

- Vitamins and minerals beyond potassium are not collected yet. Adding an open-ended micronutrient
  model deserves a separate schema design rather than more fixed columns.
- Normalized comparison shows relative movement, not clinical correlation or causation. The product
  deliberately avoids generating health claims from sparse personal data.
- Nutrient targets are not inferred automatically. Users should set targets with appropriate
  professional guidance instead of receiving invented defaults.

No usability-critical opportunity from this review remains open.
