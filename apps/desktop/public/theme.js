// Applies the stored theme before the first paint, so the window never flashes the wrong one.
// The key and the values are those of packages/ui/src/core/settings.ts (readTheme); React takes
// over from here with the same rule. A refused storage leaves the system theme in charge.
try {
  var theme = window.localStorage.getItem('hey-postie:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (_) {}
