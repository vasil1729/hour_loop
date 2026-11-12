import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '../../i18n/I18nProvider';
import { useTheme } from '../../theme/ThemeContext';
import { spacing } from '../../theme/tokens';
import { Button } from './Button';

type Props = { children: React.ReactNode };
type State = { error: Error | null };

function DatabaseErrorScreen({ error }: { error: Error }) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const busy = error.message.includes('NoModificationAllowedError');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>
        {busy ? t('app.databaseBusyTitle') : t('app.databaseErrorTitle')}
      </Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {busy
          ? t('app.databaseBusyBody')
          : t('app.databaseErrorBody', { message: error.message })}
      </Text>
      {Platform.OS === 'web' ? (
        <Button
          label={t('app.reload')}
          onPress={() => window.location.reload()}
        />
      ) : null}
    </View>
  );
}

/**
 * Catches SQLite web worker failures (most commonly an OPFS access-handle
 * conflict when the app is open in more than one tab) and shows an actionable
 * message instead of an uncaught render error.
 */
export class DatabaseErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('Local database failed to open', error);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return <DatabaseErrorScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    maxWidth: 420,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
