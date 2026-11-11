---
type: ui
title: Navigation, Screens, and Theming
description: Expo Router tab, stack, and modal structure; shared UI components; theme resolution; design tokens; and the dev-only web frame.
tags: [expo-router, navigation, ui, theming, accessibility]
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ae02914ded99b1045ea700e3
    resource: repo://app/_layout.tsx
  - id: openwiki-source-00f781f4e9204dfc1c44e0a7
    resource: repo://app/(tabs)/_layout.tsx
  - id: openwiki-source-9e393b85e08f9b4b5f1d2a7e
    resource: repo://src/components/common/Button.tsx
  - id: openwiki-source-78dba1d40e72a0f7e28b6362
    resource: repo://src/components/common/Screen.tsx
  - id: openwiki-source-d55d1d92fdab0c9a8be0e2dc
    resource: repo://src/components/common/WebPhoneFrame.tsx
  - id: openwiki-source-5b8c82dad1678fd9560b96b4
    resource: repo://src/services/navigation/navigationService.ts
  - id: openwiki-source-273e93594e35c4c4e6ad8c29
    resource: repo://src/theme/ThemeContext.tsx
  - id: openwiki-source-1c8c8da584dc1c0d3471c206
    resource: repo://src/theme/tokens.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---

# Navigation, Screens, and Theming

The UI is an Expo Router app with a root stack, a four-tab shell, and stacked detail/modal screens. Presentation is theme-driven, and most screens query SQLite on focus rather than receiving data through global navigation state.

## Route structure

The root layout defines one `Stack` with headers hidden:

- `(tabs)`: the tab shell
- `loop/start`: presented as a modal
- `loop/active`: gestures disabled
- `loop/complete`: gestures disabled
- `loop/[id]`: read-only loop journal
- `task/[id]`: task detail and subtree

The tab shell contains four routes:

| Tab | Route | Role |
| --- | --- | --- |
| Today | `(tabs)/index` | Date, intentions, active-loop banner or start CTA, recent loops |
| Tasks | `(tabs)/tasks` | Filterable flattened task tree |
| History | `(tabs)/history` | Day navigation, day summary, loops, monthly summary |
| Settings | `(tabs)/settings` | Default duration, theme, notifications, about |

Tab icons are Ionicons, colored from the active/inactive theme tokens. The tab bar surface and border come from the palette, and scene backgrounds use `colors.background`.

## Screen shell and shared components

`Screen` wraps content in `SafeAreaView` with the top edge by default, applies the theme background, and renders either a `ScrollView` or a plain flex view. Scrollable screens use `keyboardShouldPersistTaps="handled"` and hide the vertical indicator. The default content padding is `spacing.md` with a bottom pad of `spacing.xxl`.

`Button` supports `primary`, `secondary`, `ghost`, and `danger` variants. It exposes `accessibilityRole="button"`, an accessibility label, an optional hint, and disabled/busy state; a loading button swaps the label for an activity indicator. `ConfirmDialog` wraps a transparent React Native `Modal` with a themed overlay and reuses `Button` for its actions. `EmptyState`, `LoadingScreen`, and form modals (task, intention, task picker) follow the same token-based styling.

The task pool uses a single `FlatList` of depth-aware rows from `flattenTree`, not nested views. Rows expose accessibility labels for expand/collapse and completion, and the add-task control is an accessible icon button.

## Theming

`ThemeProvider` resolves the final scheme from:

1. the persisted preference (`system`, `light`, `dark`) in the settings store, and
2. the platform color scheme when the preference is `system`.

It memoizes `{ scheme, colors }` and exposes it through `useTheme()`. Dark is the fallback when the system reports light and the preference is `system`, so the app defaults to its dark palette unless the system explicitly requests light.

Design tokens live in `tokens.ts`:

- `spacing`: `xs` 4 through `xxl` 48
- `radius`: `sm` 6, `md` 12, `lg` 20, `full` 9999
- `fontSize`: 11 through 64, including a dedicated timer size
- `lineHeight` and `fontWeight` scales
- `palette.dark` / `palette.light`, each defining background, surfaces, text, accents, status colors, border, and overlay

Screens do not hard-code palette colors; they read `colors` from `useTheme()`. A few intentionally fixed colors remain, such as white text on accent/danger buttons and the dark chrome of the web phone frame.

## Dismiss-to-Today behavior

`goToToday(router)` is the shared escape hatch after saving/closing a loop:

- if the router can dismiss, it calls `dismissAll()` to clear stacked/modal routes;
- otherwise it replaces the current route with `/`.

This keeps the Today tab as the stable root after journaling without assuming how deep the navigation stack is.

## Web-only frame

<!-- openwiki: broken internal link [/openwiki/operations/web-preview.md] link "/openwiki/operations/web-preview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
`WebPhoneFrame` wraps the root layout and activates only on web viewports at least 600×700. It centers a 390 px-wide screen and adds a bezel; on native, phones, and small viewports it returns children directly. See [Web Preview](/openwiki/operations/web-preview.md) for the full behavior.

## Related pages

<!-- openwiki: broken internal link [/openwiki/operations/web-preview.md] link "/openwiki/operations/web-preview.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Web Preview](/openwiki/operations/web-preview.md)
<!-- openwiki: broken internal link [/openwiki/quickstart.md] link "/openwiki/quickstart.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Hour Loop Quickstart](/openwiki/quickstart.md)
<!-- openwiki: broken internal link [/openwiki/workflows/loop-lifecycle.md] link "/openwiki/workflows/loop-lifecycle.md" is root-absolute, which no real consumer resolves against the repository root (not a coding agent reading the page, not GitHub's Markdown renderer, not a local viewer); use a path relative to this file instead. Fix the href or restore the target, then delete this comment. -->
- [Loop Lifecycle End to End](/openwiki/workflows/loop-lifecycle.md)
