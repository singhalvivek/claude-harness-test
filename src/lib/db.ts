// Prisma client singleton. Next.js dev hot-reload re-evaluates modules on every
// change, which would otherwise open a new PrismaClient (and DB connection) each
// time and exhaust handles. Cache the instance on `globalThis` outside production.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
