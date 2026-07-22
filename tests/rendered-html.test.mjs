import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { BORDER_ROWS_PER_PAGE, FINAL_BORDER_ROWS, paginateBorderoRows } from "../app/bordero-pagination.mjs";

test("builds DSV Borderò as a native Next.js application", async () => {
  const [layout, page, config, packageJson] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  await access(new URL("../.next/BUILD_ID", import.meta.url));
  assert.match(layout, /title: "DSV Borderò"/);
  assert.match(page, /Genera il borderò/);
  assert.match(page, /Importa etichette PDF/);
  assert.doesNotMatch(config, /output: "standalone"/);
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.scripts.dev, "next dev");
  assert.equal(pkg.scripts.build, "next build");
  assert.equal(pkg.scripts.start, "next start");
});

test("keeps the DSV design system tokenized and responsive", async () => {
  const [css, tokens, history] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../tokens.css", import.meta.url), "utf8"),
    readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /@import "\.\.\/tokens\.css";/);
  assert.match(css, /overflow-x:\s*clip/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}|rgb\(|hsl\(/i);
  assert.match(tokens, /--color-brand:\s*oklch/);
  assert.match(tokens, /--font-mono:/);
  assert.match(history, /Storico borderò/);
  assert.match(history, /aria-current="page"/);
});

test("bundles PDF processing locally and keeps browser saving compatible", async () => {
  const [helper, page, worker, packageJson] = await Promise.all([
    readFile(new URL("../app/download-blob.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/pdf.worker.min.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(helper, /showSaveFilePicker/);
  assert.match(helper, /application\/octet-stream/);
  assert.match(page, /import\("pdfjs-dist"\)/);
  assert.match(page, /import\("pdf-lib"\)/);
  assert.match(page, /\/pdf\.worker\.min\.mjs/);
  assert.doesNotMatch(page, /cdn\.jsdelivr|https:\/\//);
  assert.ok(worker.length > 100_000);
  const pkg = JSON.parse(packageJson);
  assert.equal(pkg.dependencies["pdfjs-dist"], "4.10.38");
  assert.equal(pkg.dependencies["pdf-lib"], "1.17.1");
});

test("preserves international characters in generated PDFs", async () => {
  const [regularBytes, boldBytes, pageSource] = await Promise.all([
    readFile(new URL("../public/fonts/NotoSans-Regular.ttf", import.meta.url)),
    readFile(new URL("../public/fonts/NotoSans-Bold.ttf", import.meta.url)),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const page = document.addPage();
  page.drawText("Mühlenstraße · François · Łódź", { x: 24, y: 700, font: regular, size: 12 });
  page.drawText("MÜHLENSTRASSE · FRANÇOIS · ŁÓDŹ", { x: 24, y: 680, font: bold, size: 12 });
  const bytes = await document.save();
  assert.ok(bytes.length > 1_000);
  assert.match(pageSource, /doc\.registerFontkit\(fontkitModule\.default\)/);
  assert.match(pageSource, /NotoSans-Regular\.ttf/);
  assert.match(pageSource, /NotoSans-Bold\.ttf/);
  assert.doesNotMatch(pageSource, /StandardFonts\.Helvetica/);
  assert.match(pageSource, /const words=\(value\|\|"-"\)\.split/);
});

test("paginates bordero rows without orphaning totals and signatures", () => {
  assert.equal(BORDER_ROWS_PER_PAGE, 14);
  assert.equal(FINAL_BORDER_ROWS, 12);
  const sizes = count => paginateBorderoRows(Array.from({ length: count }, (_, index) => index)).map(page => page.length);
  assert.deepEqual(sizes(2), [2]);
  assert.deepEqual(sizes(12), [12]);
  assert.deepEqual(sizes(13), [7, 6]);
  assert.deepEqual(sizes(26), [14, 12]);
  assert.deepEqual(sizes(27), [9, 9, 9]);
  assert.deepEqual(sizes(40), [14, 14, 12]);
  for (let count = 1; count <= 250; count += 1) {
    const pages = paginateBorderoRows(Array(count).fill(null));
    assert.equal(pages.flat().length, count);
    assert.ok(pages.slice(0, -1).every(page => page.length <= BORDER_ROWS_PER_PAGE));
    assert.ok(pages.at(-1).length <= FINAL_BORDER_ROWS);
  }
});

test("keeps pagination in the header and aligns table content", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /text\("BORDERÒ DSV",m,14,15,true\)/);
  assert.match(page, /N\. BORDERÒ \$\{number\}/);
  assert.match(page, /text\("DVG Commerce",m\+w\/2/);
  assert.match(page, /PAGINA \$\{pageIndex\+1\} \/ \$\{chunks\.length\}/);
  assert.match(page, /alignedCell\(label as string/);
  assert.match(page, /alignedCell\(`TOTALE SPEDIZIONI/);
  assert.match(page, /alignedCell\(`TOTALE COLLI/);
  assert.match(page, /alignedLines\(recipientLines/);
  assert.match(page, /alignedCell\(String\(row\.packages\).*"right"/);
  assert.doesNotMatch(page, /DVG Commerce · Borderò/);
  assert.doesNotMatch(page, /Spedizioni \$\{String\(firstRow\)/);
});

test("stores the complete shared archive on local SQLite and filesystem", async () => {
  const [database, schema, storage, api, pdfApi, health, packageJson] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/storage.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/pdf/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(database, /node:sqlite/);
  assert.match(database, /DSV_DATA_DIR/);
  assert.match(database, /journal_mode = WAL/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS orders/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS bordero_counters/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS order_activity/);
  assert.match(storage, /node:fs\/promises/);
  assert.match(storage, /writeOrderPdf/);
  assert.match(api, /export async function GET/);
  assert.match(api, /export async function POST/);
  assert.match(api, /BEGIN IMMEDIATE/);
  assert.match(pdfApi, /readOrderPdf/);
  assert.match(health, /storage: "local"/);
  const pkg = JSON.parse(packageJson);
  const serialized = JSON.stringify(pkg);
  assert.doesNotMatch(serialized, /cloudflare|wrangler|vinext|drizzle/i);
});

test("provides an operational searchable and recoverable archive", async () => {
  const [history, api, store] = await Promise.all([
    readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/order-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(history, /Cerca nello storico/);
  assert.match(history, /Anteprima/);
  assert.match(history, /Esporta CSV/);
  assert.match(history, /Rigenera dai dati/);
  assert.match(history, /Sposta nel cestino/);
  assert.match(history, /Ripristina/);
  assert.match(api, /LIMIT \? OFFSET \?/);
  assert.match(api, /export async function DELETE/);
  assert.match(api, /export async function PATCH/);
  assert.match(store, /getWorkstationLabel/);
});

test("loads history before synchronizing only pending browser PDFs", async () => {
  const [history, store, api, types] = await Promise.all([
    readFile(new URL("../app/history/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/order-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/order-types.ts", import.meta.url), "utf8"),
  ]);
  assert.match(history, /Sincronizzazione in background/);
  assert.match(history, /getPendingLocalOrderCount/);
  assert.match(store, /filter\(record => record\.synced !== true\)/);
  assert.match(store, /sharedOrderExists/);
  assert.match(api, /params\.get\("exists"\)/);
  assert.match(types, /synced\?: boolean/);
});

test("ships a native Alpine service with persistent local data", async () => {
  const [installer, updater, initd, confd, readme] = await Promise.all([
    readFile(new URL("../scripts/install-alpine.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/update-alpine.sh", import.meta.url), "utf8"),
    readFile(new URL("../scripts/openrc/dsv-bordero.initd", import.meta.url), "utf8"),
    readFile(new URL("../scripts/openrc/dsv-bordero.confd", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.match(installer, /apk add --no-cache nodejs npm git/);
  assert.match(installer, /npm install/);
  assert.match(installer, /npm run build/);
  assert.match(installer, /Il repository è sotto \/root/);
  assert.match(updater, /git pull --ff-only/);
  assert.match(updater, /\/var\/backups\/dsv-bordero/);
  assert.match(initd, /supervisor="supervise-daemon"/);
  assert.match(initd, /command_user="dsv-bordero:dsv-bordero"/);
  assert.match(initd, /non è accessibile all'utente dsv-bordero/);
  assert.match(confd, /DSV_DATA_DIR="\/var\/lib\/dsv-bordero"/);
  assert.match(readme, /Cloudflare Tunnel/);
  assert.match(readme, /Cloudflare Access/);
  assert.match(readme, /git clone/);
});
