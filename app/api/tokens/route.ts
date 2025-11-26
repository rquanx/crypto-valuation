import { NextRequest, NextResponse } from "next/server";
import {
  getTokenAggregates,
  parseWindowParam,
  type MetricPreference,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMetricPreference(value: string | null): MetricPreference {
  const normalized = (value || "").toLowerCase();
  if (normalized === "holders_revenue" || normalized === "holdersrevenue") return "holders_revenue";
  if (normalized === "revenue") return "revenue";
  if (normalized === "fees") return "fees";
  return "auto";
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
  const metricPreference = parseMetricPreference(params.get("metric"));
  const windows = parseWindowParam(params.get("window") ?? params.get("windows"));
  const search = params.get("search");
  const chain = params.get("chain");
  const ids = parseIds(params.get("ids"));
  const slugs = parseStrings(params.get("slugs"));
  const defillamaIds = parseStrings(params.get("defillamaIds") ?? params.get("defillama_id"));

  try {
    const data = getTokenAggregates({
      metricPreference,
      windows,
      search,
      chain,
      ids,
      slugs,
      defillamaIds,
    });

    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 },
    );
  }
}

