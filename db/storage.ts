import "server-only";

import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getDataPaths } from ".";

function safePdfName(orderId: string) {
  return `${orderId.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
}

function pdfPath(fileName: string) {
  return path.join(getDataPaths().pdfDirectory, path.basename(fileName));
}

export async function writeOrderPdf(orderId: string, pdf: Blob) {
  const fileName = safePdfName(orderId);
  const destination = pdfPath(fileName);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, new Uint8Array(await pdf.arrayBuffer()), { flag: "wx" });
  await rename(temporary, destination);
  return fileName;
}

export async function readOrderPdf(fileName: string) {
  try {
    const filePath = pdfPath(fileName);
    const [body, info] = await Promise.all([readFile(filePath), stat(filePath)]);
    return { body, etag: `"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"` };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function deleteOrderPdf(fileName: string) {
  await rm(pdfPath(fileName), { force: true });
}
