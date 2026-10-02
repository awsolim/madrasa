import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { loadTenantBrandingFromHost } from "@/lib/tenant-branding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedSizes = new Set([
  "640x1136",
  "750x1334",
  "828x1792",
  "1125x2436",
  "1170x2532",
  "1179x2556",
  "1206x2622",
  "1242x2688",
  "1284x2778",
  "1290x2796",
  "1320x2868",
  "1536x2048",
  "1620x2160",
  "1640x2360",
  "1668x2224",
  "1668x2388",
  "2048x2732",
]);

export async function GET(request: NextRequest) {
  const width = Number(request.nextUrl.searchParams.get("width"));
  const height = Number(request.nextUrl.searchParams.get("height"));

  if (!Number.isInteger(width) || !Number.isInteger(height) || !allowedSizes.has(`${width}x${height}`)) {
    return Response.json({ error: "Unsupported startup image size." }, { status: 400 });
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const branding = await loadTenantBrandingFromHost(host);
  const iconUrl = new URL("/api/pwa/icon?size=512&purpose=apple", request.url).toString();
  const iconSize = Math.round(Math.min(width, height) * 0.29);
  const radius = Math.round(iconSize * 0.23);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: Math.round(iconSize * 0.16),
          background: "#E8F3F0",
          color: "#17624F",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={iconUrl}
          alt=""
          width={iconSize}
          height={iconSize}
          style={{ borderRadius: radius, objectFit: "cover" }}
        />
        <div style={{ display: "flex", fontSize: Math.round(iconSize * 0.2), fontWeight: 700, letterSpacing: "-0.03em" }}>
          {branding.shortName}
        </div>
      </div>
    ),
    {
      width,
      height,
      headers: {
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}
