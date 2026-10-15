import type { Core } from '@hey-postie/core';
import { CoreProvider } from './core/CoreProvider';
import type { Locale } from './i18n';
import { Welcome } from './screens/Welcome';

interface AppProps {
  core: Core;
  locale: Locale;
}

export function App({ core, locale }: AppProps) {
  return (
    <CoreProvider core={core} locale={locale}>
      <Welcome />
    </CoreProvider>
  );
}
