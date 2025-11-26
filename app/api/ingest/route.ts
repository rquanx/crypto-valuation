import { NextRequest, NextResponse } from "next/server";
import { ingestDefillama, type NormalizedMetricType } from "@/lib/ingest";
import { triggerIngestNow } from "@/lib/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorize(request: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return true;

  const headerToken = request.headers.get("x-ingest-secret");
  const queryToken = request.nextUrl.searchParams.get("token");
  return headerToken === secret || queryToken === secret;
}

function parseMetricTypes(param: string | null): NormalizedMetricType[] | undefined {
  if (!param) return undefined;
  const allowed: NormalizedMetricType[] = ["fees", "revenue", "holders_revenue"];
  const parsed = param
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .map((value) =>
      value === "holdersrevenue" || value === "holders_revenue"
        ? "holders_revenue"
        : value === "revenue"
          ? "revenue"
          : value === "fees"
            ? "fees"
            : null,
    )
    .filter((value): value is NormalizedMetricType => Boolean(value));

  const unique = Array.from(new Set(parsed));
  return unique.length ? unique.filter((metric) => allowed.includes(metric)) : undefined;
}

function parseStringList(param: string | null): string[] | undefined {
  if (!param) return undefined;
  const values = param
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return values.length ? Array.from(new Set(values)) : undefined;
}

function parseNumberList(param: string | null): number[] | undefined {
  const values = parseStringList(param);
  if (!values) return undefined;
  const numbers = values
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  return numbers.length ? numbers : undefined;
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const metricTypes = parseMetricTypes(params.get("metrics"));
  const dryRun = params.get("dryRun") === "true";
  const useDirect = params.get("useDirect") === "true";
  const protocolFilter = {
    defillamaIds: parseStringList(params.get("defillamaIds")),
    slugs: parseStringList(params.get("slugs")),
    protocolIds: parseNumberList(params.get("protocolIds")),
  };

  // Allow bypassing the scheduler mutex when needed.
  if (useDirect) {
    const result = await ingestDefillama({
      metricTypes,
      dryRun,
      protocolFilter,
      logger: (msg) => console.log(msg),
    });
    return NextResponse.json({ ok: true, ...result });
  }

  const result = await triggerIngestNow("api", { metricTypes, dryRun, protocolFilter });
  if (!result) {
    return NextResponse.json(
      { ok: false, message: "Ingest already running" },
      { status: 429 },
    );
  }

  return NextResponse.json({ ok: true, ...result });
}
