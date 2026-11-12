---
type: operations
title: Web Preview
description: Development-only browser preview covering run commands, the phone frame, platform limits, and SQLite OPFS behavior.
tags: [web, expo, preview, sqlite, development]
openwiki_generated: true
verified:
  - by: openwiki/0.7.2
    at: 2026-11-11T14:17:00.720Z
sources:
  - id: openwiki-source-ae02914ded99b1045ea700e3
    resource: repo://app/_layout.tsx
  - id: openwiki-source-100ac14d8e290518428d9516
    resource: repo://metro.config.js
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-d55d1d92fdab0c9a8be0e2dc
    resource: repo://src/components/common/WebPhoneFrame.tsx
  - id: openwiki-source-35855f6034a3aedd41cf8509
    resource: repo://src/services/notifications/notificationService.ts
generated: { by: "opencode", at: "2026-11-11T14:17:00.720Z" }
---


# Web Preview

The web target exists only to preview the UI in a browser during development. It is not a deployment target and does not share data with a phone.

## Running it

```bash
npm run web
```

Expo starts the web dev server at `http://localhost:8081`. The first run needs the web dependencies already declared in `package.json`:

- `react-dom`
- `react-native-web`
- `@expo/metro-runtime`

`@expo/metro-runtime` supplies the Metro runtime for web, `react-dom` is the renderer, and `react-native-web` maps React Native primitives to DOM elements.

## Metro and SQLite's WASM engine

`metro.config.js` extends the default Expo config with `wasm` in `config.resolver.assetExts`. The comment in the config explains why: `expo-sqlite`'s web implementation loads its SQLite engine from a `.wasm` file. Without that asset extension, Metro fails to resolve the module during bundling.

On web, `expo-sqlite` runs in a worker and stores the database in browser-private origin storage rather than the native SQLite file. The app still uses the same `SQLiteProvider`, migrations, repositories, and async queries; only the storage backend changes. Browser data is separate from the phone's `hour-loop.db`, so preview changes never migrate to a device.

## Desktop phone frame

`WebPhoneFrame` wraps the entire app in `RootLayout`. It activates only when all of these are true:

- `Platform.OS === 'web'`
- viewport width is at least 600
- viewport height is at least 700

When active, it centers the app in a 390 px-wide screen, caps the height at `min(844, viewportHeight - 64)`, and draws a rounded bezel with a dark backdrop. On native builds, phones, and small browser windows it returns its children unchanged, so it adds no layout cost to the shipped app.

## Notification behavior

Notifications are intentionally unavailable on web:

- `setupNotifications` returns immediately when `Platform.OS === 'web'`.
- `hasNotificationPermission` and `requestNotificationPermission` return `false` on web.

The rest of the loop flow still runs, so starting, pausing, and completing a loop works in the preview; only the OS notification cannot be scheduled. The service's normal permission check prevents a web schedule attempt.

## Limitations

- No local notifications.
- Browser storage is separate from native storage and can be cleared by the browser.
- The preview is not a responsive web app; the phone frame is a development convenience, not a layout target.
- Native-only behavior such as exact Android notification channels cannot be validated in the browser.
- The product spec explicitly excludes web deployment.

## Related pages

- [Navigation, Screens, and Theming](../ui/navigation-and-theming.md)
- [Hour Loop Quickstart](../quickstart.md)
- [Android Builds and Releases](android-builds-and-releases.md)
