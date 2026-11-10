import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { currentDayKey, currentMonthKey } from '../domain/shared/dateUtils';
import {
  getDaySummary,
  getMonthSummary,
  type IntentionSummary,
} from '../features/intentions/intentionsService';

export function useIntentions() {
  const db = useSQLiteContext();
  const [daily, setDaily] = useState<IntentionSummary | null>(null);
  const [monthly, setMonthly] = useState<IntentionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [dailySummary, monthlySummary] = await Promise.all([
      getDaySummary(db, currentDayKey()),
      getMonthSummary(db, currentMonthKey()),
    ]);
    setDaily(dailySummary);
    setMonthly(monthlySummary);
    setLoading(false);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([getDaySummary(db, currentDayKey()), getMonthSummary(db, currentMonthKey())])
        .then(([dailySummary, monthlySummary]) => {
          if (!cancelled) {
            setDaily(dailySummary);
            setMonthly(monthlySummary);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  return {
    daily,
    monthly,
    loading,
    refresh,
    dayKey: currentDayKey(),
    monthKey: currentMonthKey(),
  };
}
