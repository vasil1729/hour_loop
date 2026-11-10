import type { Router } from 'expo-router';

/**
 * Return to the Today tab by dismissing any stacked/modal routes.
 */
export function goToToday(router: Router): void {
  if (router.canDismiss()) {
    router.dismissAll();
    return;
  }
  router.replace('/');
}
