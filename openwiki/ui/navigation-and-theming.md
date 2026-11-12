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
- `day/[date]`: task-first day/week/month focus overview

The tab shell contains four routes:

| Tab | Route | Role |
| --- | --- | --- |
| Today | `(tabs)/index` | Date, intentions, active-loop banner or start CTA, recent loops |
| Tasks | `(tabs)/tasks` | Loose capsules and a filterable flattened task tree |
| History | `(tabs)/history` | Day/week/month summaries, period navigation, weekly bars, monthly heatmap |
| Settings | `(tabs)/settings` | Duration, intentions, language, theme, notifications, backup/restore, about |

Tab icons are Ionicons, colored from the active/inactive theme tokens. The tab bar surface and border come from the palette, and scene backgrounds use `colors.background`.

## Screen shell and shared components

`Screen` wraps content in `SafeAreaView` with the top edge by default, applies the theme background, and renders either a `ScrollView` or a plain flex view. Scrollable screens use `keyboardShouldPersistTaps="handled"` and hide the vertical indicator. The default content padding is `spacing.md` with a bottom pad of `spacing.xxl`.

`Button` supports `primary`, `secondary`, `ghost`, and `danger` variants. It exposes `accessibilityRole="button"`, an accessibility label, an optional hint, and disabled/busy state; a loading button swaps the label for an activity indicator. `ConfirmDialog` wraps a transparent React Native `Modal` with a themed overlay and reuses `Button` for its actions. `EmptyState`, `LoadingScreen`, and form modals (task, intention, task picker) follow the same token-based styling.

The task pool uses a single `FlatList` of depth-aware rows from `flattenTree`, not nested views. Rows expose accessibility labels for expand/collapse and completion, and the add-task control is an accessible icon button.

## Day view

`app/day/[date].tsx` is the detailed focus overview opened from Today or History. It is task-first rather than loop-first:

- a summary counts focused time, distinct task capsules, and capsule segments;
- focus time is grouped by task capsule, with parent-task context, per-task totals, capsule counts, and color dots for the grouped segments;
- tapping a capsule highlights its time in both visualization modes and shows a selected-capsule card.

The view offers a **Timeline** mode and a **Clock** mode. The clock is a numbered 24-hour dial: hour labels `00` through `22` sit outside an inner data disc, and each capsule segment is a wedge colored from the shared capsule palette. Selecting a wedge outlines it, dims the other wedges, and updates the center total. Today's view also draws a live now marker. The timeline scrolls vertically, supports jump-to-now and jump-to-first-capsule actions, and highlights the same selected segments.

A `HistoryPeriodSwitcher` lets the same screen show a day, week, or month range. Week/month ranges use `getRangeCapsuleData`, which clips capsule intervals to the inclusive local-day bounds; the task-first grouping and totals are otherwise identical.

## Internationalization and direction

Language is resolved by `I18nProvider` from the persisted preference and the device locale. Screens consume `useTranslation()` for `t()` and `isRTL`; the provider owns the active language used by non-React formatters. Arabic is the only RTL language. Layout direction is forced through `I18nManager` on native and `<html dir>` on web; screens also flip directional icons and use start/end spacing so layouts remain correct before a native restart applies the new direction.

The Settings language picker lists System plus English, Russian, Arabic, Simplified Chinese, Turkish, and Malayalam. Language changes update React text immediately; native RTL layout changes apply after an app restart.

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

`WebPhoneFrame` wraps the root layout and activates only on web viewports at least 600×700. It centers a 390 px-wide screen and adds a bezel; on native, phones, and small viewports it returns children directly. See [Web Preview](../operations/web-preview.md) for the full behavior.

## Related pages

- [Web Preview](../operations/web-preview.md)
- [Hour Loop Quickstart](../quickstart.md)
- [Loop Lifecycle End to End](../workflows/loop-lifecycle.md)
- [Product Overview](../product/overview.md)
