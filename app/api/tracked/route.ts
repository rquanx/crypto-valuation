import { NextRequest, NextResponse } from "next/server";
import {
  addTrackedProtocolBySlug,
  getTrackedProtocols,
  type NormalizedMetricType,
  type ProtocolFilter,
} from "@/lib/ingest";
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

function parseProtocolFilter(request: NextRequest): ProtocolFilter | undefined {
  const params = request.nextUrl.searchParams;
  const defillamaId = params.get("defillamaId");
  const slug = params.get("slug");
  const protocolId = params.get("protocolId");

  const filter: ProtocolFilter = {};
  if (defillamaId) filter.defillamaIds = [defillamaId];
  if (slug) filter.slugs = [slug];
  if (protocolId && Number.isFinite(Number(protocolId))) {
    filter.protocolIds = [Number(protocolId)];
  }

  return Object.keys(filter).length ? filter : undefined;
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const filter = parseProtocolFilter(request);
  const items = getTrackedProtocols().filter((item) => {
    if (!filter) return true;
    return (
      (filter.protocolIds?.includes(item.protocolId) ?? false) ||
      (filter.defillamaIds?.some(
        (id) => id.toLowerCase() === item.protocol.defillamaId.toLowerCase(),
      ) ?? false) ||
      (filter.slugs?.some(
        (slug) => slug.toLowerCase() === item.protocol.slug.toLowerCase(),
      ) ?? false)
    );
  });

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { slug?: string; defillamaId?: string; metrics?: string } | null = null;
  try {
    payload = await request.json();
  } catch {
    payload = null;
  }

  const slugOrId =
    payload?.slug ||
    payload?.defillamaId ||
    request.nextUrl.searchParams.get("slug") ||
    request.nextUrl.searchParams.get("defillamaId");

  if (!slugOrId) {
    return NextResponse.json(
      { error: "Missing slug or defillamaId" },
      { status: 400 },
    );
  }

  try {
    const { created, protocolId, protocol } = await addTrackedProtocolBySlug(slugOrId);
    const metricTypes = parseMetricTypes(
      request.nextUrl.searchParams.get("metrics") ?? payload?.metrics ?? null,
    );

    let ingestResult = null;
    if (created) {
      ingestResult = await triggerIngestNow("tracked-add", {
        metricTypes,
        protocolFilter: { protocolIds: [protocolId] },
      });
    }

    return NextResponse.json({
      ok: true,
      created,
      protocolId,
      protocol,
      ingest: ingestResult,
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 404 },
    );
  }
}
