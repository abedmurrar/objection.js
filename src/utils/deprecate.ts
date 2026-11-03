const LOGGED_DEPRECATIONS = new Set<string>();

function deprecate(message: string): void {
  // Only log deprecation messages once.
  if (!LOGGED_DEPRECATIONS.has(message)) {
    LOGGED_DEPRECATIONS.add(message);
    console.warn(message);
  }
}

// For tests, which check the messages.
function resetDeprecations(): void {
  LOGGED_DEPRECATIONS.clear();
}

export { deprecate, resetDeprecations };
