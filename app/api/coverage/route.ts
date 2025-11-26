import { NextRequest, NextResponse } from "next/server";
import { getCoverageList } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 300));
}

function parseBoolean(value: string | null): boolean | null {
  if (value == null) return null;
  return value === "true";
}

function parseIds(value: string | null): number[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isFinite(v)),
    ),
  );
}

function parseStrings(value: string | null): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  );
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const search = params.get("search");
  const chain = params.get("chain");
  const limit = parseLimit(params.get("limit"));
  const trackedOnlyFlag = parseBoolean(params.get("trackedOnly"));
  const ids = parseIds(params.get("ids"));
  const slugs = parseStrings(params.get("slugs"));
  const defillamaIds = parseStrings(params.get("defillamaIds") ?? params.get("defillama_id"));

  try {
    const items = getCoverageList({
      search,
      chain,
      limit,
      trackedOnly: trackedOnlyFlag ?? undefined,
      ids,
      slugs,
      defillamaIds,
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

