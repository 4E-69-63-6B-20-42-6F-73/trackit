# Frontend state boundaries

TrackIt separates stateful orchestration from props-only presentation.

## Containers and controllers

Stateful components, pages, and hooks may own:

- React state, reducers, effects, refs, and URL state.
- React Query reads and mutations.
- API calls and cache invalidation.
- Navigation and application-level commands.
- Derivation that decides *what* data should be requested or mutated.

These files should pass already-prepared data and callbacks into views.

## `*View.tsx` components

Files ending in `View.tsx` are presentation-only. They may:

- Render data received through props.
- Choose visual variants from props.
- Invoke callback props in response to user interaction.
- Compose other presentation components.

They must not own application state, effects, queries, API calls, or application hooks. ESLint enforces this boundary by blocking React state/effect hooks, React Query, application hooks, and API modules from `*View.tsx` files.

## Cache propagation

Server-state mutations update or invalidate React Query caches directly at the domain API boundary. Do not synchronize server state with `window` events. Global DOM events are reserved for UI commands that are intentionally outside server state, such as opening the global log menu.
