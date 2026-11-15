/**
 * Entitlement layer for a future subscription model (Free / Premium / AI Premium).
 *
 * Billing is NOT active: there is no payment flow and every feature is available.
 * When subscriptions are introduced:
 *  1. RevenueCat (iOS/Android) or Stripe (web) sends webhooks to a Supabase Edge Function.
 *  2. That function writes the `subscriptions` table with the service role (users can only read their row).
 *  3. Set BILLING_ENABLED = true; `can()` then checks the tier that was read from the server.
 * Premium checks that matter must also be enforced on a backend (e.g. an edge function in front of the AI requests).
 * Safety, privacy, export and account management must never be gated.
 */
export type Tier = 'free' | 'premium' | 'ai_premium';
export type Feature = 'tracking' | 'workouts' | 'dashboard' | 'analytics' | 'history_extended' | 'training_advanced' | 'insights' | 'ai_coach' | 'ai_reports';

export const BILLING_ENABLED = false;

const REQUIRED: Record<Feature, Tier> = {
  tracking: 'free', workouts: 'free', dashboard: 'free',
  analytics: 'premium', history_extended: 'premium', training_advanced: 'premium', insights: 'premium',
  ai_coach: 'ai_premium', ai_reports: 'ai_premium',
};
const RANK: Record<Tier, number> = { free: 0, premium: 1, ai_premium: 2 };

export function can(feature: Feature, tier: Tier = 'free'): boolean {
  if (!BILLING_ENABLED) return true;
  return RANK[tier] >= RANK[REQUIRED[feature]];
}
export const requiredTier = (feature: Feature): Tier => REQUIRED[feature];
