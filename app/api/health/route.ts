import { getDataPaths, getDb } from "../../../db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return Response.json({ status: "ok", storage: "local", dataDirectory: getDataPaths().dataDirectory });
  } catch (error) {
    console.error("Local storage health check failed", error);
    return Response.json({ status: "error", storage: "local" }, { status: 503 });
  }
}
