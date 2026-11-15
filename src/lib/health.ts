/**
 * Integration architecture for Apple Health, Google Health Connect and future wearables.
 *
 * A browser / PWA has no access to HealthKit or Health Connect – both are native-only APIs.
 * Nothing is simulated here: every provider reports `available: false` until FitFlow is wrapped
 * as a native app (e.g. Capacitor) and a real adapter is registered with `registerHealthProvider`.
 *
 * Data FitFlow would request, and why (request nothing else):
 *  - steps, walking/running distance → Activity section (replaces manual entry)
 *  - workouts                        → Calendar and weekly report
 *  - sleep analysis                  → Sleep section (bedtime / wake time / duration)
 * Imported values must be stored with their source so they are never confused with manual entries.
 */
export type HealthProviderId = 'apple_health' | 'health_connect';
export type HealthDataType = 'steps' | 'distance' | 'workouts' | 'sleep';

export interface HealthSample { type: HealthDataType; start: string; end: string; value: number; unit: string; source: HealthProviderId }
export interface HealthProvider {
  id: HealthProviderId;
  isAvailable(): Promise<boolean>;
  requestPermissions(types: HealthDataType[]): Promise<HealthDataType[]>;
  read(type: HealthDataType, from: string, to: string): Promise<HealthSample[]>;
}

const unavailable = (id: HealthProviderId): HealthProvider => ({
  id,
  isAvailable: async () => false,
  requestPermissions: async () => [],
  read: async () => { throw new Error(`${id} is only available in a native build`); },
});

const providers = new Map<HealthProviderId, HealthProvider>([
  ['apple_health', unavailable('apple_health')],
  ['health_connect', unavailable('health_connect')],
]);

/** A native wrapper calls this at start-up with its real HealthKit / Health Connect adapter. */
export function registerHealthProvider(p: HealthProvider) { providers.set(p.id, p); }
export const healthProviders = (): HealthProvider[] => [...providers.values()];
