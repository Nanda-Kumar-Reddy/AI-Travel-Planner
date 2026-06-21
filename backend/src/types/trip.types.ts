/**
 * trip.types.ts — backend-local type definitions that mirror the shared package.
 *
 * The backend's tsconfig rootDir is `./src`, which prevents importing from
 * `../../../shared/src/index` directly. These types are kept in sync manually
 * and only contain what the controller layer needs for DayDiff computation.
 */

export type TimeOfDay = 'Morning' | 'Afternoon' | 'Evening';

/** Mirrors shared/src/index.ts Activity */
export interface ActivityShape {
  _id?: string;
  title: string;
  description: string;
  estimatedCostUSD: number;
  timeOfDay: TimeOfDay;
  lat?: number;
  lng?: number;
}

/** Mirrors shared/src/index.ts DayDiff */
export interface DayDiff {
  dayNumber: number;
  before: ActivityShape[];
  after: ActivityShape[];
  /** IDs of new/replaced activities in `after` — used for diff highlight on the frontend */
  changedActivityIds: string[];
}
