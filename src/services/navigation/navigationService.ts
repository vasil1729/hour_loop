import type { Router } from 'expo-router';

/**
 * Return to the Today tab by dismissing any stacked/modal routes and then
 * switching to the tabs root. Dismissing alone keeps whichever tab the loop was
 * started from, which is not necessarily Today.
 */
export function goToToday(router: Router): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace('/');
}
