/**
 * ClickHouse Client (Backward Compatible)
 * 
 * This file maintains backward compatibility with existing code.
 * It now uses the new Database Connection Manager under the hood.
 * 
 * For new code, consider using:
 * import { getDatabase, DatabaseType } from '@/lib/db';
 */

import { getDatabase, DatabaseType } from './db/index';
import { getCurrentBranchPolicy } from './auth-policy';
import { ErrorTypes } from './errors';
import { getRequestContext } from './request-context';

type QueryOptions = {
  query: string;
  query_params?: Record<string, unknown>;
  [key: string]: unknown;
};

// Backward-compatible ClickHouse responses are intentionally loose across the existing data layer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseResult = any;

type QueryResult<T = unknown> = {
  json: () => Promise<T>;
};

let clickhouseInstance: ClickHouseClient | null = null;

/**
 * @deprecated Use getDatabase(DatabaseType.CLICKHOUSE) instead
 */
async function initClickHouse() {
  if (!clickhouseInstance) {
    try {
      const adapter = await getDatabase(DatabaseType.CLICKHOUSE);
      clickhouseInstance = adapter.getClient() as ClickHouseClient;
    } catch (error) {
      console.error('Failed to initialize ClickHouse client:', error);
      throw error;
    }
  }
  return clickhouseInstance;
}

/**
 * @deprecated Use getDatabase(DatabaseType.CLICKHOUSE) instead
 */
export async function getClickHouse() {
  return await initClickHouse();
}

// For backward compatibility, create a proxy object with proper typing
interface ClickHouseClient {
  query<T = LooseResult>(options: QueryOptions): Promise<QueryResult<T>>;
  [key: string]: unknown;
}

function injectBranchPolicy(query: string): string {
  if (!/\bselect\b/i.test(query) || !/\bbranch_sync\b/i.test(query)) {
    return query;
  }

  const authFilter = `branch_sync IN ({auth_branches:Array(String)})`;
  if (new RegExp(authFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(query)) {
    return query;
  }

  if (/\bwhere\b/i.test(query)) {
    return query.replace(/\bwhere\b/i, `WHERE ${authFilter} AND `);
  }

  const clauseMatch = query.match(/\b(group by|order by|limit)\b/i);
  if (clauseMatch?.index !== undefined) {
    return `${query.slice(0, clauseMatch.index)} WHERE ${authFilter} ${query.slice(clauseMatch.index)}`;
  }

  return `${query} WHERE ${authFilter}`;
}

async function applyBranchPolicyToQueryOptions(options: unknown) {
  if (!options || typeof options !== 'object') {
    return options;
  }

  const maybeOptions = options as Record<string, unknown>;
  if (typeof maybeOptions.query !== 'string') {
    return options;
  }

  const queryOptions = options as QueryOptions;
  const requestContext = getRequestContext();
  if (requestContext?.skipBranchAuth) {
    return queryOptions;
  }

  const policy = await getCurrentBranchPolicy();

  if (!policy.user) {
    throw ErrorTypes.UNAUTHORIZED("Authentication required");
  }

  if (!policy.isAllowed) {
    throw ErrorTypes.FORBIDDEN("Dashboard access has not been granted");
  }

  if (policy.isAdmin || policy.branches.includes('*')) {
    return queryOptions;
  }

  const branches = policy.user && policy.branches.length > 0
    ? policy.branches
    : ['__NO_ACCESS__'];

  return {
    ...queryOptions,
    query: injectBranchPolicy(queryOptions.query),
    query_params: {
      ...(queryOptions.query_params ?? {}),
      auth_branches: branches,
    },
  };
}

/**
 * @deprecated Use getDatabase(DatabaseType.CLICKHOUSE) instead
 * 
 * Legacy proxy for backward compatibility.
 * This maintains the same API as before but uses the connection manager.
 */
export const clickhouse: ClickHouseClient = new Proxy({} as ClickHouseClient, {
  get: (_target, prop) => {
    if (typeof prop === 'symbol') {
      return undefined;
    }

    return async (...args: unknown[]) => {
      const adapter = await getDatabase(DatabaseType.CLICKHOUSE);
      const client = adapter.getClient();

      if (!client) {
        throw new Error('ClickHouse client is not initialized');
      }

      const method = (client as Record<PropertyKey, unknown>)[prop];
      if (typeof method === 'function') {
        const finalArgs = prop === 'query' && args.length > 0
          ? [await applyBranchPolicyToQueryOptions(args[0]), ...args.slice(1)]
          : args;
        return Reflect.apply(method, client, finalArgs);
      }
      return method;
    };
  },
}) as ClickHouseClient;

/**
 * Executes a ClickHouse query with automatic branch-level permissions applied.
 * @param baseQuery The original SQL query
 * @param params Query parameters
 */
export async function queryWithBranchAuth(baseQuery: string, params: Record<string, unknown> = {}) {
  const policy = await getCurrentBranchPolicy();

  if (!policy.user) {
    throw ErrorTypes.UNAUTHORIZED("Authentication required");
  }

  if (!policy.isAllowed) {
    throw ErrorTypes.FORBIDDEN("Dashboard access has not been granted");
  }

  // Admin or user with '*' branch has access to everything
  if (policy.isAdmin || policy.branches.includes('*')) {
    return clickhouse.query({
      query: baseQuery,
      query_params: params
    });
  }

  // If user has no branches allowed, they shouldn't see anything.
  // We can inject a dummy condition that's always false, or just throw an error.
  // Let's inject a condition that's always false for safety, or just an empty array which IN () will fail on ClickHouse.
  // ClickHouse IN () with empty array might throw a syntax error depending on the version.
  // Let's handle empty branches by forcing a no-match.
  let branchesToFilter = policy.branches;
  if (branchesToFilter.length === 0) {
    branchesToFilter = ['__NO_ACCESS__'];
  }

  const hasWhere = baseQuery.toUpperCase().includes("WHERE");
  const authFilter = `branch_sync IN ({auth_branches:Array(String)})`;
  
  const finalQuery = hasWhere 
    ? baseQuery.replace(/WHERE/i, `WHERE ${authFilter} AND `) 
    : `${baseQuery} WHERE ${authFilter}`;

  return clickhouse.query({
    query: finalQuery,
    query_params: {
      ...params,
      auth_branches: branchesToFilter
    }
  });
}

