"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { saveBlobAs } from "../download-blob";
import { archiveSharedOrder, getLocalOrder, getPendingLocalOrderCount, getSharedPdf, listLocalOrders, listSharedOrders,
  restoreSharedOrder, syncLocalOrders } from "../order-store";
import type { ArchiveMetrics, SavedOrder as Item, SyncProgress } from "../order-types";

const emptyMetrics: ArchiveMetrics = { total: 0, today: 0, monthShipments: 0, monthPackages: 0 };
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const borderoNumber = (item: Item) => item.sequence ? `${item.createdAt.slice(0, 10).replaceAll("-", "")}-${String(item.sequence).padStart(3, "0")}` : "–";
const title = (item: Item) => `Borderò ${borderoNumber(item)}`;

function groupLabel(createdAt: string) {
  const date = new Date(createdAt), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (localDate(date) === localDate(today)) return "Oggi";
  if (localDate(date) === localDate(yesterday)) return "Ieri";
  const week = new Date(today); week.setDate(today.getDate() - 6);
  if (date >= week) return "Questa settimana";
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(date);
}

export default function History() {
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState<"loading" | "shared" | "local">("loading");
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [trash, setTrash] = useState(false);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState<Item | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [message, setMessage] = useState("");
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setSource(current => current === "local" ? "local" : "loading");
    try {
      const result = await listSharedOrders({ q: query, from, to, sort, trash, page, pageSize: 25 });
      setItems(result.orders); setTotal(result.total); setPages(result.pages); setMetrics(result.metrics); setSource("shared");
    } catch {
      const records = await listLocalOrders();
      const normalized = query.toLocaleLowerCase("it");
      const local = records.map(record => record.meta).filter(item => {
        if (trash || item.archivedAt) return false;
        const haystack = `${item.fileName} ${item.references} ${item.rows?.map(row => `${row.ref} ${row.consignmentId} ${row.recipient}`).join(" ")}`.toLocaleLowerCase("it");
        return (!normalized || haystack.includes(normalized)) && (!from || item.createdAt.slice(0, 10) >= from) && (!to || item.createdAt.slice(0, 10) <= to);
      }).sort((a, b) => sort === "date-asc" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt));
      setItems(local.slice((page - 1) * 25, page * 25)); setTotal(local.length); setPages(Math.max(1, Math.ceil(local.length / 25)));
      setMetrics({ total: local.length, today: local.filter(i => i.createdAt.slice(0, 10) === localDate()).length,
        monthShipments: local.filter(i => i.createdAt.slice(0, 7) === localDate().slice(0, 7)).reduce((sum, i) => sum + i.shipments, 0),
        monthPackages: local.filter(i => i.createdAt.slice(0, 7) === localDate().slice(0, 7)).reduce((sum, i) => sum + i.packages, 0) });
      setSource("local");
    }
  }, [from, page, query, sort, to, trash]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, refresh]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const pending = await getPendingLocalOrderCount();
        if (!active || pending === 0) return;
        setSyncProgress({ pending, completed: 0, failed: 0 });
        const result = await syncLocalOrders(progress => { if (active) setSyncProgress(progress); });
        if (active && result.completed > 0) setRefresh(value => value + 1);
      } catch {
        if (active) setSyncProgress(null);
      }
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const groups = useMemo(() => items.reduce<Record<string, Item[]>>((result, item) => {
    const label = groupLabel(item.createdAt); (result[label] ||= []).push(item); return result;
  }, {}), [items]);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setQuery(searchInput.trim()); };
  const quickDate = (range: "today" | "week" | "month" | "all") => {
    const now = new Date(); setTo(range === "all" ? "" : localDate(now));
    if (range === "today") setFrom(localDate(now));
    else if (range === "week") { const start = new Date(now); start.setDate(now.getDate() - 6); setFrom(localDate(start)); }
    else if (range === "month") setFrom(`${localDate(now).slice(0, 7)}-01`);
    else setFrom("");
    setPage(1);
  };
  const saveAs = async (item: Item) => { await saveBlobAs(async () => (await getSharedPdf(item.id)) ?? (await getLocalOrder(item.id))?.blob, item.fileName); };
  const showPreview = async (item: Item) => {
    setPreview(item); setPreviewUrl("");
    const blob = (await getSharedPdf(item.id)) ?? (await getLocalOrder(item.id))?.blob;
    if (blob) setPreviewUrl(URL.createObjectURL(blob)); else setMessage("PDF non disponibile.");
  };
  const closePreview = () => { if (previewUrl) URL.revokeObjectURL(previewUrl); setPreviewUrl(""); setPreview(null); };
  const copyNumber = async (item: Item) => { await navigator.clipboard.writeText(borderoNumber(item)); setMessage("Numero borderò copiato."); };
  const exportCsv = async (item: Item) => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = ["Ref-number;Consignment ID;Destinatario;Colli", ...(item.rows ?? []).map(row => [row.ref, row.consignmentId, row.recipient, row.packages].map(quote).join(";"))].join("\r\n");
    await saveBlobAs(async () => new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), item.fileName.replace(/\.pdf$/i, ".csv"));
  };
  const regenerate = (item: Item) => {
    sessionStorage.setItem("dsv-bordero-clone", JSON.stringify(item.rows ?? []));
    window.location.href = "/?clone=1";
  };
  const archive = async (item: Item) => {
    if (!window.confirm(`Spostare ${title(item)} nel cestino? Potrai ripristinarlo.`)) return;
    await archiveSharedOrder(item.id); setMessage("Borderò spostato nel cestino."); await load();
  };
  const restore = async (item: Item) => { await restoreSharedOrder(item.id); setMessage("Borderò ripristinato."); await load(); };

  return <main className="app-shell">
    <header className="app-header">
      <Link className="brand" href="/" aria-label="DSV Borderò — generazione"><strong>DSV</strong><span>Borderò</span></Link>
      <nav aria-label="Navigazione principale"><Link href="/">Generazione</Link><Link href="/history" aria-current="page">Storico</Link></nav>
    </header>

    <section className="workspace history-page">
      <header className="workspace-head history-head"><div className="workspace-title"><h1>Storico borderò</h1><span>Ricerca, consulta e gestisci l’archivio condiviso DVG Commerce.</span></div><Link className="primary link-button" href="/">Nuovo borderò <span aria-hidden="true">→</span></Link></header>

      <section className="history-metrics" aria-label="Riepilogo archivio">
        <dl><dt>Borderò {trash ? "nel cestino" : "totali"}</dt><dd>{source === "loading" ? "…" : metrics.total}</dd></dl>
        <dl><dt>Generati oggi</dt><dd>{metrics.today}</dd></dl>
        <dl><dt>Spedizioni del mese</dt><dd>{metrics.monthShipments}</dd></dl>
        <dl><dt>Colli del mese</dt><dd>{metrics.monthPackages}</dd></dl>
      </section>

      <section className="archive-toolbar" aria-label="Ricerca e filtri">
        <form className="history-search" onSubmit={submitSearch}><label htmlFor="archive-search">Cerca nello storico</label><div><input id="archive-search" type="search" value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Numero borderò, Ref-number, Consignment ID o destinatario"/><button className="primary" type="submit">Cerca</button></div></form>
        <div className="date-presets" aria-label="Intervalli rapidi"><button onClick={() => quickDate("today")}>Oggi</button><button onClick={() => quickDate("week")}>7 giorni</button><button onClick={() => quickDate("month")}>Questo mese</button><button onClick={() => quickDate("all")}>Tutto</button></div>
        <div className="history-filters"><label>Dal<input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }}/></label><label>Al<input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }}/></label><label>Ordina<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="date-desc">Più recenti</option><option value="date-asc">Meno recenti</option><option value="number-desc">Numero decrescente</option><option value="number-asc">Numero crescente</option><option value="shipments-desc">Più spedizioni</option><option value="packages-desc">Più colli</option></select></label><button className={`trash-toggle ${trash ? "active" : ""}`} onClick={() => { setTrash(value => !value); setPage(1); }}>{trash ? "Torna all’archivio" : "Cestino"}</button></div>
      </section>

      {message && <div className="history-notice" role="status">{message}<button aria-label="Chiudi messaggio" onClick={() => setMessage("")}>×</button></div>}
      {source === "local" && <div className="offline-banner" role="status">Server non disponibile: stai consultando la copia locale.</div>}
      {syncProgress && <div className={`sync-banner ${syncProgress.completed + syncProgress.failed < syncProgress.pending ? "active" : ""}`} role="status"><span className="sync-dot" aria-hidden="true"/><span>{syncProgress.completed + syncProgress.failed < syncProgress.pending ? `Sincronizzazione in background: ${syncProgress.completed} di ${syncProgress.pending}` : syncProgress.failed ? `${syncProgress.failed} documenti locali restano in attesa. Verranno ritentati automaticamente.` : `${syncProgress.completed} documenti locali sincronizzati.`}</span></div>}

      {source === "loading" && !items.length ? <div className="empty"><span aria-hidden="true">↗</span><h2>Caricamento dello storico</h2><p>Recupero dell’archivio condiviso in corso.</p></div>
      : !items.length ? <div className="empty"><span aria-hidden="true">{trash ? "✓" : "⌕"}</span><h2>{trash ? "Il cestino è vuoto" : "Nessun borderò trovato"}</h2><p>{query || from || to ? "Prova a modificare la ricerca o l’intervallo di date." : "I documenti generati compariranno qui."}</p>{(query || from || to) && <button className="secondary" onClick={() => { setSearchInput(""); setQuery(""); quickDate("all"); }}>Azzera filtri</button>}</div>
      : <section className="history-section" aria-labelledby="archive-title">
        <div className="history-section-head"><div><h2 id="archive-title">{trash ? "Documenti nel cestino" : "Documenti salvati"}</h2><p>{total} risultati · pagina {page} di {pages}</p></div></div>
        {Object.entries(groups).map(([label, group]) => <section className="history-group" key={label}><h3>{label}</h3><div className="history-table" role="table" aria-label={`Borderò — ${label}`}>
          <div className="history-table-head" role="row"><span>Documento</span><span>Data e postazione</span><span>Spedizioni</span><span>Colli</span><span>Azioni</span></div>
          {group.map(item => <article role="row" key={item.id}>
            <button className="history-open" onClick={() => void showPreview(item)}><span className="document-mark" aria-hidden="true">PDF</span><span className="history-copy"><strong>{title(item)}</strong><span>{item.references || "Nessun riferimento"}</span></span></button>
            <div className="history-origin"><strong>{new Date(item.createdAt).toLocaleString("it-IT")}</strong><small>{item.createdBy || "Postazione sconosciuta"}{item.archivedAt ? ` · eliminato da ${item.archivedBy}` : ""}</small></div>
            <strong className="history-value" data-label="Spedizioni">{item.shipments}</strong><strong className="history-value" data-label="Colli">{item.packages}</strong>
            <div className="history-actions"><button className="secondary compact-button" onClick={() => void showPreview(item)}>Anteprima</button><details className="history-menu"><summary aria-label={`Azioni per ${title(item)}`}>•••</summary><div>{trash ? <button onClick={() => void restore(item)}>Ripristina</button> : <><button onClick={() => void saveAs(item)}>Scarica PDF</button><button onClick={() => void copyNumber(item)}>Copia numero</button><button disabled={!item.rows?.length} onClick={() => void exportCsv(item)}>Esporta CSV</button><button disabled={!item.rows?.length} onClick={() => regenerate(item)}>Rigenera dai dati</button><button className="danger-action" onClick={() => void archive(item)}>Sposta nel cestino</button></>}</div></details></div>
          </article>)}
        </div></section>)}
        <nav className="pagination" aria-label="Pagine dello storico"><button className="secondary" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>← Precedente</button><span>Pagina <strong>{page}</strong> di <strong>{pages}</strong></span><button className="secondary" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Successiva →</button></nav>
      </section>}
    </section>

    {preview && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) closePreview(); }}><section className="download-modal history-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-title"><button className="modal-close" aria-label="Chiudi anteprima" onClick={closePreview}>×</button><header className="history-preview-head"><span className="document-mark" aria-hidden="true">PDF</span><div><h2 id="preview-title">{title(preview)}</h2><p>{new Date(preview.createdAt).toLocaleString("it-IT")} · {preview.shipments} spedizioni · {preview.packages} colli</p></div></header><div className="history-preview-layout"><div className="pdf-preview-frame">{previewUrl ? <iframe src={`${previewUrl}#view=FitH`} title={`Anteprima ${title(preview)}`}/> : <div className="preview-loading">Caricamento anteprima…</div>}</div><aside><dl><div><dt>Numero</dt><dd>{borderoNumber(preview)}</dd></div><div><dt>Postazione</dt><dd>{preview.createdBy || "Postazione sconosciuta"}</dd></div><div><dt>Spedizioni</dt><dd>{preview.shipments}</dd></div><div><dt>Colli</dt><dd>{preview.packages}</dd></div></dl><button className="primary" onClick={() => void saveAs(preview)}>Scarica PDF</button><button className="secondary" disabled={!preview.rows?.length} onClick={() => void exportCsv(preview)}>Esporta CSV</button></aside></div>{preview.rows?.length ? <div className="detail-table history-detail-table"><table><thead><tr><th>Ref-number</th><th>Consignment ID</th><th>Destinatario</th><th>Colli</th></tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}><td>{row.ref}</td><td className="mono-cell">{row.consignmentId}</td><td>{row.recipient}</td><td>{row.packages}</td></tr>)}</tbody></table></div> : null}</section></div>}
  </main>;
}
