import { getDb } from "../../../../db";
import { readOrderPdf } from "../../../../db/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) return Response.json({ error: "Missing order id" }, { status: 400 });
    const order = getDb().prepare("SELECT file_name AS fileName, pdf_file AS pdfFile FROM orders WHERE id = ? LIMIT 1")
      .get(id) as { fileName: string; pdfFile: string } | undefined;
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const pdf = await readOrderPdf(order.pdfFile);
    if (!pdf) return Response.json({ error: "PDF not found" }, { status: 404 });
    const safeName = order.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return new Response(new Uint8Array(pdf.body), { headers: { "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}"`, "Cache-Control": "private, no-store", ETag: pdf.etag } });
  } catch (error) {
    console.error("Unable to read a local order PDF", error);
    return Response.json({ error: "Local PDF unavailable" }, { status: 503 });
  }
}
