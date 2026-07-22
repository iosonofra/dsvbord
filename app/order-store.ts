"use client";

import type { ArchivePage, SavedOrder, StoredOrder, SyncProgress } from "./order-types";

const DB_NAME = "dsv-borderi";
const STORE_NAME = "pdf";
const WORKSTATION_KEY = "dsv-bordero-workstation";

export function getWorkstationLabel() {
  if (typeof window === "undefined") return "Postazione sconosciuta";
  let value = localStorage.getItem(WORKSTATION_KEY);
  if (!value) {
    value = `Postazione ${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    localStorage.setItem(WORKSTATION_KEY, value);
  }
  return value;
}

function openLocalDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getLocalOrder(id: string) {
  const db = await openLocalDb();
  return new Promise<StoredOrder | undefined>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredOrder | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function listLocalOrders() {
  const db = await openLocalDb();
  return new Promise<StoredOrder[]>((resolve, reject) => {
    const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredOrder[]);
    request.onerror = () => reject(request.error);
  });
}

export async function putLocalOrder(meta: SavedOrder, blob: Blob, synced = false) {
  const db = await openLocalDb();
  return new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put({ meta, blob, synced, syncedAt: synced ? new Date().toISOString() : undefined }, meta.id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function uploadSharedOrder(record: StoredOrder) {
  record.meta.createdBy ||= getWorkstationLabel();
  const body = new FormData();
  body.append("meta", JSON.stringify(record.meta));
  body.append("pdf", record.blob, record.meta.fileName);
  const response = await fetch("/api/orders", { method: "POST", body });
  if (!response.ok) throw new Error("Shared archive is unavailable");
  const payload = (await response.json()) as { order: SavedOrder };
  return payload.order;
}

export async function listSharedOrders(params: Record<string, string | number | boolean | undefined> = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "" && value !== false) query.set(key, value === true ? "1" : String(value));
  });
  const today = new Date();
  const localDay = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  query.set("today", localDay);
  query.set("month", localDay.slice(0, 7));
  query.set("todayStart", todayStart.toISOString());
  query.set("todayEnd", tomorrowStart.toISOString());
  query.set("monthStart", monthStart.toISOString());
  query.set("monthEnd", nextMonthStart.toISOString());
  const response = await fetch(`/api/orders?${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Shared archive is unavailable");
  return response.json() as Promise<ArchivePage>;
}

async function sharedOrderExists(id: string) {
  const response = await fetch(`/api/orders?exists=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Shared archive is unavailable");
  const payload = (await response.json()) as { exists: boolean; order?: SavedOrder };
  return payload;
}

export async function archiveSharedOrder(id: string) {
  const response = await fetch("/api/orders", { method: "DELETE", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workstation: getWorkstationLabel() }) });
  if (!response.ok) throw new Error("Unable to archive order");
}

export async function restoreSharedOrder(id: string) {
  const response = await fetch("/api/orders", { method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, workstation: getWorkstationLabel() }) });
  if (!response.ok) throw new Error("Unable to restore order");
}

export async function reserveSharedOrderNumber(createdAt: string) {
  const response = await fetch("/api/orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ createdAt }),
  });
  if (!response.ok) throw new Error("Unable to reserve a shared bordero number");
  return response.json() as Promise<{
    sequence: number;
    fileName: string;
    number: string;
  }>;
}

export async function getSharedPdf(id: string) {
  const response = await fetch(`/api/orders/pdf?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (!response.ok) return undefined;
  return response.blob();
}

export async function getPendingLocalOrderCount() {
  return (await listLocalOrders()).filter(record => record.synced !== true).length;
}

let activeSync: Promise<SyncProgress> | undefined;

export function syncLocalOrders(onProgress?: (progress: SyncProgress) => void) {
  if (activeSync) return activeSync;
  activeSync = (async () => {
    const records = (await listLocalOrders()).filter(record => record.synced !== true);
    const progress: SyncProgress = { pending: records.length, completed: 0, failed: 0 };
    onProgress?.({ ...progress });
    for (const record of records) {
      try {
        const existing = await sharedOrderExists(record.meta.id);
        const sharedMeta = existing.exists && existing.order ? existing.order : await uploadSharedOrder(record);
        await putLocalOrder(sharedMeta, record.blob, true);
        progress.completed += 1;
      } catch {
        progress.failed += 1;
      }
      onProgress?.({ ...progress });
    }
    return progress;
  })().finally(() => { activeSync = undefined; });
  return activeSync;
}
