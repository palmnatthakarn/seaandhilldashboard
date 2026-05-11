// Caching utilities for Next.js server-side caching

import { unstable_cache } from 'next/cache';

/**
 * Creates a cached query function using Next.js unstable_cache
 *
 * @param queryFn - The async function to execute and cache
 * @param keyParts - Array of strings to form the cache key
 * @param revalidate - Cache duration in seconds (default: 300 = 5 minutes)
 * @returns Cached query function
 *
 * @example
 * const cachedData = await createCachedQuery(
 *   () => getAccountingKPIs(dateRange),
 *   ['accounting', 'kpis', startDate, endDate],
 *   300
 * )();
 */
export function createCachedQuery<T>(
  queryFn: () => Promise<T>,
  keyParts: string[],
  revalidate: number = 300 // 5 minutes default
) {
  if (process.env.ENABLE_SHARED_QUERY_CACHE !== 'true') {
    return queryFn;
  }

  return unstable_cache(queryFn, keyParts, {
    revalidate,
    tags: keyParts,
  });
}

/**
 * Cache duration presets in seconds
 */
export const CacheDuration = {
  SHORT: 60,        // 1 minute
  MEDIUM: 300,      // 5 minutes
  LONG: 900,        // 15 minutes
  VERY_LONG: 3600,  // 1 hour
  DAY: 86400,       // 24 hours
} as const;

/**
 * Generates a cache key from multiple parts
 */
export function generateCacheKey(...parts: (string | number | undefined)[]): string {
  return parts.filter(Boolean).join(':');
}
