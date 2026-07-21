import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const destination = path.join(root, "public", "pdf.worker.min.mjs");

await mkdir(path.dirname(destination), { recursive: true });
await copyFile(source, destination);
