import { PrismaClient } from "@prisma/client";
import { isDemoMode } from "./demo-accounts";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Demo Prisma stub. When the portal runs without a database (demo mode), we
 * cannot construct a real PrismaClient — but ~180 API routes call `prisma.*`
 * directly. Rather than editing every route, this stub answers every query
 * with a safe, correctly-shaped empty result so no endpoint throws or 500s:
 *
 *   findMany / groupBy / $queryRaw        → []
 *   findFirst / findUnique                → null   (guards `if (!x) 404` cleanly)
 *   findFirstOrThrow / findUniqueOrThrow  → {}     (avoids a thrown 500)
 *   count                                 → 0
 *   aggregate                             → { _sum:{}, _avg:{}, _min:{}, _max:{}, _count:0 }
 *   create / update / upsert              → the input data (best-effort echo)
 *   createMany / updateMany / deleteMany  → { count: 0 }
 *
 * The result: every dashboard/list/overview endpoint renders an empty state
 * instead of crashing, so all roles can browse all tabs before the real
 * backend (DATABASE_URL) is connected. Writes are no-ops in this mode.
 */
function buildDemoStub(): PrismaClient {
  const emptyAggregate = () => ({
    _sum: {},
    _avg: {},
    _min: {},
    _max: {},
    _count: 0,
  });

  const modelProxy = new Proxy(
    {},
    {
      get(_target, method: string) {
        switch (method) {
          case "findMany":
          case "groupBy":
            return async () => [];
          case "findFirst":
          case "findUnique":
            return async () => null;
          case "findFirstOrThrow":
          case "findUniqueOrThrow":
            return async () => ({});
          case "count":
            return async () => 0;
          case "aggregate":
            return async () => emptyAggregate();
          case "create":
          case "update":
          case "upsert":
            return async (args?: { data?: unknown; create?: unknown }) =>
              args?.data ?? args?.create ?? {};
          case "createMany":
          case "updateMany":
          case "deleteMany":
            return async () => ({ count: 0 });
          case "delete":
            return async () => ({});
          default:
            return async () => null;
        }
      },
    }
  );

  const rootProxy: PrismaClient = new Proxy({} as PrismaClient, {
    get(_target, prop: string): unknown {
      switch (prop) {
        case "$queryRaw":
        case "$queryRawUnsafe":
          return async () => [];
        case "$executeRaw":
        case "$executeRawUnsafe":
          return async () => 0;
        case "$transaction":
          return async (arg: unknown) => {
            if (Array.isArray(arg)) return Promise.all(arg);
            if (typeof arg === "function")
              return (arg as (tx: PrismaClient) => unknown)(rootProxy);
            return [];
          };
        case "$connect":
        case "$disconnect":
          return async () => {};
        case "$on":
        case "$use":
          return () => {};
        case "$extends":
          return () => rootProxy;
        default:
          // Any model name (user, transaction, serviceRoute, …) → model stub.
          return modelProxy;
      }
    },
  });

  return rootProxy;
}

function buildClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    // No database configured. In demo mode, hand back a stub that never throws
    // so the whole app is browsable; otherwise fail loudly as before.
    if (isDemoMode()) return buildDemoStub();
    throw new Error(
      "DATABASE_URL is not set. Add it to your hosting provider's environment variables (or copy .env.example to .env.local for local dev)."
    );
  }
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/**
 * Lazy Prisma proxy. The real client is constructed only on first property
 * access, so importing this module at build time (e.g. during Next.js page
 * data collection) never crashes when DATABASE_URL isn't set in CI.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = buildClient();
    }
    return Reflect.get(globalForPrisma.prisma, prop, receiver);
  },
});
