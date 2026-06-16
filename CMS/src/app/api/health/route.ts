import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "bizbeecms-cms",
    runtime: "cloudflare-workers",
    time: new Date().toISOString(),
  });
}
