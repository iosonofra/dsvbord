import { getDb } from "../../../db";
import { deleteOrderPdf, writeOrderPdf } from "../../../db/storage";
import type { ArchiveMetrics, OrderRow, SavedOrder } from "../../order-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PAGE_SIZE = 100;

type DbOrder = {
  id: string; createdAt: string; references: string; shipments: number; packages: number;
  fileName: string; sequence: number; rowsJson: string; pdfFile: string; createdBy: string;
  archivedAt: string | null; archivedBy: string | null;
};

const ORDER_SELECT = `id, created_at AS createdAt, references_text AS "references", shipments, packages,
  file_name AS fileName, sequence, rows_json AS rowsJson, pdf_file AS pdfFile,
  created_by AS createdBy, archived_at AS archivedAt, archived_by AS archivedBy`;

function rowsFromJson(value: string): OrderRow[] {
  try { const rows = JSON.parse(value) as unknown; return Array.isArray(rows) ? rows as OrderRow[] : []; }
  catch { return []; }
}

function toSavedOrder(row: DbOrder): SavedOrder {
  return { id: row.id, createdAt: row.createdAt, references: row.references, shipments: row.shipments,
    packages: row.packages, fileName: row.fileName, sequence: row.sequence, rows: rowsFromJson(row.rowsJson),
    createdBy: row.createdBy, archivedAt: row.archivedAt, archivedBy: row.archivedBy };
}

function getOrder(id: string) {
  return getDb().prepare(`SELECT ${ORDER_SELECT} FROM orders WHERE id = ? LIMIT 1`).get(id) as DbOrder | undefined;
}

function cleanRows(value: unknown): OrderRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 2_000).flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as Partial<OrderRow>;
    if (typeof row.ref !== "string" || typeof row.consignmentId !== "string" ||
      typeof row.recipient !== "string" || typeof row.packages !== "number") return [];
    return [{ ref: row.ref.slice(0, 200), consignmentId: row.consignmentId.slice(0, 200),
      recipient: row.recipient.slice(0, 500), packages: Math.max(1, Math.floor(row.packages)) }];
  });
}

function workstation(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 100) : "Postazione sconosciuta";
}

function reserveSequence(day: string) {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const current = db.prepare("SELECT last_sequence AS value FROM bordero_counters WHERE day = ?").get(day) as { value: number } | undefined;
    const sequence = (current?.value ?? 0) + 1;
    if (current) db.prepare("UPDATE bordero_counters SET last_sequence = ? WHERE day = ?").run(sequence, day);
    else db.prepare("INSERT INTO bordero_counters(day, last_sequence) VALUES (?, ?)").run(day, sequence);
    db.exec("COMMIT");
    return sequence;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function numberSearch(query: string) {
  const compact = query.match(/^(\d{4})(\d{2})(\d{2})-(\d{3})$/);
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}-${compact[4]}` : query;
}

function addActivity(orderId: string, action: string, createdAt: string, actor: string) {
  getDb().prepare("INSERT INTO order_activity(order_id, action, created_at, workstation) VALUES (?, ?, ?, ?)")
    .run(orderId, action, createdAt, actor);
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const existsId = params.get("exists")?.slice(0, 100);
    if (existsId) {
      const existing = getOrder(existsId);
      return Response.json({ exists: Boolean(existing), order: existing ? toSavedOrder(existing) : undefined },
        { headers: { "Cache-Control": "no-store" } });
    }

    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, Number(params.get("pageSize")) || 25));
    const clauses = [params.get("trash") === "1" ? "archived_at IS NOT NULL" : "archived_at IS NULL"];
    const values: Array<string | number | null> = [];
    const query = (params.get("q") ?? "").trim().slice(0, 200);
    if (query) {
      clauses.push("(file_name LIKE ? OR references_text LIKE ? OR rows_json LIKE ?)");
      const pattern = `%${numberSearch(query)}%`; values.push(pattern, pattern, pattern);
    }
    const from = params.get("from"), to = params.get("to");
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { clauses.push("created_at >= ?"); values.push(`${from}T00:00:00.000Z`); }
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { clauses.push("created_at <= ?"); values.push(`${to}T23:59:59.999Z`); }
    const where = `WHERE ${clauses.join(" AND ")}`;
    const orderBy = ({ "date-asc": "created_at ASC", "number-asc": "sequence ASC", "number-desc": "sequence DESC",
      "shipments-desc": "shipments DESC", "packages-desc": "packages DESC" } as Record<string, string>)[params.get("sort") ?? ""] || "created_at DESC";
    const db = getDb();
    const result = db.prepare(`SELECT ${ORDER_SELECT} FROM orders ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
      .all(...values, pageSize, (page - 1) * pageSize) as unknown as DbOrder[];
    const count = db.prepare(`SELECT count(*) AS value FROM orders ${where}`).get(...values) as { value: number };
    const total = Number(count.value);
    const today = params.get("today")?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    const month = params.get("month")?.slice(0, 7) ?? today.slice(0, 7);
    const validInstant = (name: string, fallback: string) => {
      const value = params.get(name); return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
    };
    const fallbackTodayStart = `${today}T00:00:00.000Z`;
    const fallbackTodayEnd = new Date(Date.parse(fallbackTodayStart) + 86_400_000).toISOString();
    const fallbackMonthStart = `${month}-01T00:00:00.000Z`;
    const fallbackMonthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString();
    const todayStart = validInstant("todayStart", fallbackTodayStart), todayEnd = validInstant("todayEnd", fallbackTodayEnd);
    const monthStart = validInstant("monthStart", fallbackMonthStart), monthEnd = validInstant("monthEnd", fallbackMonthEnd);
    const todayTotals = db.prepare("SELECT count(*) AS borderos, coalesce(sum(shipments), 0) AS shipments, coalesce(sum(packages), 0) AS packages FROM orders WHERE archived_at IS NULL AND created_at >= ? AND created_at < ?")
      .get(todayStart, todayEnd) as { borderos: number; shipments: number; packages: number };
    const monthTotals = db.prepare("SELECT coalesce(sum(shipments), 0) AS shipments, coalesce(sum(packages), 0) AS packages FROM orders WHERE archived_at IS NULL AND created_at >= ? AND created_at < ?")
      .get(monthStart, monthEnd) as { shipments: number; packages: number };
    const metrics: ArchiveMetrics = { total, today: Number(todayTotals.borderos), todayShipments: Number(todayTotals.shipments),
      todayPackages: Number(todayTotals.packages), monthShipments: Number(monthTotals.shipments), monthPackages: Number(monthTotals.packages) };
    return Response.json({ orders: result.map(toSavedOrder), total, page, pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)), metrics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to read the local order archive", error);
    return Response.json({ error: "Local archive unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json() as { createdAt?: string };
    if (typeof payload.createdAt !== "string" || !Number.isFinite(Date.parse(payload.createdAt)))
      return Response.json({ error: "Invalid creation date" }, { status: 400 });
    const day = payload.createdAt.slice(0, 10), sequence = reserveSequence(day);
    return Response.json({ sequence, fileName: `bordero-dsv-${day}-${String(sequence).padStart(3, "0")}.pdf`,
      number: `${day.replaceAll("-", "")}-${String(sequence).padStart(3, "0")}` });
  } catch (error) {
    console.error("Unable to reserve a local bordero number", error);
    return Response.json({ error: "Unable to reserve bordero number" }, { status: 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: string; workstation?: string };
    if (!payload.id) return Response.json({ error: "Missing order id" }, { status: 400 });
    const actor = workstation(payload.workstation);
    const result = getDb().prepare("UPDATE orders SET archived_at = NULL, archived_by = NULL WHERE id = ?").run(payload.id);
    if (!Number(result.changes)) return Response.json({ error: "Order not found" }, { status: 404 });
    addActivity(payload.id, "restored", new Date().toISOString(), actor);
    return Response.json({ order: toSavedOrder(getOrder(payload.id)!) });
  } catch (error) {
    console.error("Unable to restore local order", error);
    return Response.json({ error: "Unable to restore order" }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { id?: string; workstation?: string };
    if (!payload.id) return Response.json({ error: "Missing order id" }, { status: 400 });
    const actor = workstation(payload.workstation), archivedAt = new Date().toISOString();
    const result = getDb().prepare("UPDATE orders SET archived_at = ?, archived_by = ? WHERE id = ?").run(archivedAt, actor, payload.id);
    if (!Number(result.changes)) return Response.json({ error: "Order not found" }, { status: 404 });
    addActivity(payload.id, "archived", archivedAt, actor);
    return Response.json({ order: toSavedOrder(getOrder(payload.id)!) });
  } catch (error) {
    console.error("Unable to archive local order", error);
    return Response.json({ error: "Unable to archive order" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let pdfFile = "";
  try {
    const form = await request.formData(), rawMeta = form.get("meta"), pdf = form.get("pdf");
    if (typeof rawMeta !== "string" || !(pdf instanceof Blob)) return Response.json({ error: "Invalid order payload" }, { status: 400 });
    if (pdf.size === 0 || pdf.size > MAX_PDF_BYTES) return Response.json({ error: "PDF exceeds the 25 MB limit" }, { status: 413 });
    const input = JSON.parse(rawMeta) as Partial<SavedOrder>;
    if (typeof input.id !== "string" || input.id.length > 100 || typeof input.createdAt !== "string" ||
      !Number.isFinite(Date.parse(input.createdAt)) || typeof input.shipments !== "number" || typeof input.packages !== "number")
      return Response.json({ error: "Invalid order metadata" }, { status: 400 });
    const existing = getOrder(input.id);
    if (existing) return Response.json({ order: toSavedOrder(existing) });

    const day = input.createdAt.slice(0, 10);
    const sequence = Number.isInteger(input.sequence) && Number(input.sequence) > 0 ? Number(input.sequence) : reserveSequence(day);
    const fileName = `bordero-dsv-${day}-${String(sequence).padStart(3, "0")}.pdf`;
    const rows = cleanRows(input.rows), actor = workstation(input.createdBy);
    pdfFile = await writeOrderPdf(input.id, pdf);
    getDb().prepare(`INSERT INTO orders(id, created_at, references_text, shipments, packages, file_name, sequence,
      rows_json, pdf_file, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(input.id, input.createdAt, typeof input.references === "string" ? input.references.slice(0, 1_000) : "",
        Math.max(0, Math.floor(input.shipments)), Math.max(0, Math.floor(input.packages)), fileName, sequence,
        JSON.stringify(rows), pdfFile, actor);
    addActivity(input.id, "created", input.createdAt, actor);
    return Response.json({ order: toSavedOrder(getOrder(input.id)!) }, { status: 201 });
  } catch (error) {
    console.error("Unable to write the local order archive", error);
    if (pdfFile) { try { await deleteOrderPdf(pdfFile); } catch {} }
    return Response.json({ error: "Unable to archive order" }, { status: 503 });
  }
}
