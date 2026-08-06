/**
 * Where the chosen theme lives.
 *
 * A cookie rather than local storage, so the server can render the right
 * palette into the first response. That matters for more than the flash of
 * wrong colour: an inline script inside the React tree is present in the markup
 * but never executed, so a theme applied only by script survives the click and
 * is lost on the next page load.
 *
 * A visitor who has never chosen carries no cookie, and the stylesheet follows
 * their operating system instead.
 */
export const THEME_COOKIE = 'cx-theme'

export type Theme = 'light' | 'dark'

/** Reads a cookie value, ignoring anything that is not a theme we know. */
export function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'dark' || value === 'light' ? value : undefined
}
