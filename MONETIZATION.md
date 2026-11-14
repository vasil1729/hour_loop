# Monetization Plan

Hour Loop is free, open source, and licensed under `AGPL-3.0-or-later`. The
intended model is simple:

- The GitHub source and locally built APKs stay **ad-free**.
- A Google Play build may include a small, non-intrusive ad to support
  development.
- Ads must never appear during a running loop or interrupt a focus session.
- The source stays available under the AGPL, so anyone can build an ad-free
  version.

This document describes the recommended implementation. The actual AdMob
integration still needs real app/ad-unit IDs, a privacy-policy URL, and a
consent decision before it can be shipped.

## Recommended ad policy

- **Allowed placements:** About, Settings, History, or a dedicated “Support
  Hour Loop” screen.
- **Forbidden placements:** Today, Start loop, Active loop, Complete loop, Task
  detail while journaling, or any modal that affects focus.
- **Format:** one adaptive banner. Avoid interstitial ads and never use a
  rewarded ad to unlock core functionality.
- **Frequency:** one banner per screen at most; no ad refresh while the user is
  reading a journal or timer.
- **Open-source build:** ads disabled. The Play Store build can enable them with
  build-time configuration.

## Recommended revenue mix

Ads alone will produce very little revenue for a small utility app. Consider:

1. A single non-intrusive banner on low-focus screens.
2. A one-time **Remove ads** in-app purchase.
3. Optional GitHub Sponsors / donations.

Do not gate the timer, task pool, history, backups, or local data behind ads or
purchases.

## AdMob integration steps

1. Create an AdMob account and link the Play Store app.
2. Create:
   - one AdMob app ID;
   - one adaptive banner ad unit for the Play build.
3. Add `react-native-google-mobile-ads` and its Expo config plugin.
4. Keep IDs out of source control. Use build-time environment variables, for
   example:
   - `EXPO_PUBLIC_ADS_ENABLED=true`
   - `EXPO_PUBLIC_ADMOB_APP_ID=...`
   - `EXPO_PUBLIC_ADMOB_BANNER_ID=...`
5. Start with Google’s test IDs and verify the build on a real device.
6. Add a consent flow using Google’s UMP SDK before requesting ads in the EEA,
   UK, and Switzerland.
7. Publish a privacy policy that describes the AdMob SDK, device identifiers,
   consent, and data collection.
8. Complete the Play Console Data Safety form and update the store listing.
9. Rebuild and test the APK/AAB. Do not assume the Expo Go build supports native
   ad modules.

## Build split

Use one codebase with two configurations:

| Build | Ads | Distribution |
|---|---|---|
| GitHub / local APK | Off | GitHub Releases and direct installs |
| Google Play | On | Play Store |

The Play build should set the ad environment variables; the open-source build
should leave them unset. This keeps the GitHub build aligned with the
offline-first promise while allowing the Play listing to support development.

## AGPL and store compliance

- Keep the complete source available under AGPL-3.0-or-later.
- The AdMob SDK is an optional dependency; do not remove the user’s ability to
  build an ad-free version.
- Include the license and source link in About.
- Do not use ads to collect data beyond what the privacy policy and consent flow
  disclose.
- Follow Google Play’s ads, families, and data-safety policies.

## Blockers before shipping ads

- AdMob app ID and banner ad-unit ID.
- Privacy policy URL.
- Consent/UMP decision for the target regions.
- Final decision on placements and whether to add a “Remove ads” purchase.
- Updated store screenshots and Data Safety declarations.
