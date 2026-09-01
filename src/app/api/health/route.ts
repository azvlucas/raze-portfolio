import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let db: "up" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    db = "up";
  } catch {
    db = "down";
  }

  const status = db === "up" ? 200 : 503;

  return NextResponse.json(
    {
      status: db === "up" ? "ok" : "degraded",
      service: "raze-pet",
      db,
      timezone: process.env.TIMEZONE || "America/Sao_Paulo",
      uptimeMs: process.uptime() * 1000,
      latencyMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    { status },
  );
}
