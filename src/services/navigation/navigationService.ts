import type { Router } from 'expo-router';

/**
 * Return to the Timer tab by dismissing any stacked/modal routes and then
 * switching to the tabs root.
 */
export function goToTimer(router: Router): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace('/');
}
