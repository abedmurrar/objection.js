const LOGGED_DEPRECATIONS = new Set<string>();

function deprecate(message: string): void {
  // Only log deprecation messages once.
  if (!LOGGED_DEPRECATIONS.has(message)) {
    LOGGED_DEPRECATIONS.add(message);
    console.warn(message);
  }
}

export { deprecate };
