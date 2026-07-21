import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const base = process.argv[2] || "http://localhost:5181";
const dataDirectory = process.argv[3] || path.join(process.cwd(), "data-smoke");
const createdAt = "2026-07-21T20:00:00.000Z";

const json = async (url, init) => {
  const response = await fetch(`${base}${url}`, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(payload)}`);
  return payload;
};

const health = await json("/api/health");
const reserved = await json("/api/orders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ createdAt }) });
const id = crypto.randomUUID();
const meta = { id, createdAt, references: "LOCALTEST", shipments: 1, packages: 2,
  fileName: reserved.fileName, sequence: reserved.sequence, createdBy: "Smoke Alpine",
  rows: [{ ref: "LOCALTEST", consignmentId: "260721-000001", recipient: "DVG COMMERCE", packages: 2 }] };
const form = new FormData();
form.append("meta", JSON.stringify(meta));
form.append("pdf", new Blob([await readFile(path.join(process.cwd(), "ETICHETTE.pdf"))], { type: "application/pdf" }), "smoke.pdf");
const created = await json("/api/orders", { method: "POST", body: form });
const list = await json("/api/orders?q=LOCALTEST&page=1&pageSize=25");
const pdf = await fetch(`${base}/api/orders/pdf?id=${id}`);
const actionBody = JSON.stringify({ id, workstation: "Smoke Alpine" });
await json("/api/orders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: actionBody });
const trash = await json("/api/orders?trash=1&page=1&pageSize=25");
await json("/api/orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: actionBody });
const files = await readdir(dataDirectory, { recursive: true });

process.stdout.write(JSON.stringify({ health: health.status, storage: health.storage, number: reserved.number,
  created: created.order.id === id, searchMatches: list.total, pdfStatus: pdf.status,
  pdfBytes: (await pdf.arrayBuffer()).byteLength, inTrash: trash.orders.some(order => order.id === id),
  restored: true, sqlite: files.some(file => file === "dsv-bordero.sqlite"), localPdf: files.some(file => file.endsWith(".pdf")) }));
