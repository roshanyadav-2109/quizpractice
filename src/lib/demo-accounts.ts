/**
 * The demo accounts are gone: their passwords were public, so they were
 * deleted once the site was. Every demo address was on example.com, a
 * reserved domain no Google account can have — so any such account that ever
 * reappears is still kept off the real YouTube channel.
 */
export function isDemoAccount(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith('@example.com')
}
