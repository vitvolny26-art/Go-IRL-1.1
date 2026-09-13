/**
 * ChRem002D notification defaults are applied server-side from durable domain state:
 * Activity membership becoming joined and confirmed Beauty/Master bookings.
 *
 * Keep this compatibility component mounted while older bundles still lazy-load it,
 * but never gate a successful join behind a channel chooser. Users can override the
 * auth-derived default later in Profile / Master Settings.
 */
export function UserCommunicationPreferenceGate() {
  return null;
}
