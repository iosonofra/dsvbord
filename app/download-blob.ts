type SaveHandle = {
  createWritable: () => Promise<{
    write: (data: Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type SavePicker = (options: {
  suggestedName: string;
  types: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveHandle>;

export type SaveBlobResult = "saved" | "cancelled" | "missing";

export async function saveBlobAs(
  loadBlob: () => Promise<Blob | undefined>,
  fileName: string,
): Promise<SaveBlobResult> {
  const picker = (window as Window & { showSaveFilePicker?: SavePicker })
    .showSaveFilePicker;
  let blobPromise: Promise<Blob | undefined> | undefined;
  const getBlob = () => (blobPromise ??= loadBlob());

  if (picker) {
    try {
      // Invoke the picker before any await so browsers keep the user activation.
      const handle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: "Documento PDF",
            accept: { "application/pdf": [".pdf"] },
          },
        ],
      });
      const blob = await getBlob();
      if (!blob) return "missing";
      const writer = await handle.createWritable();
      await writer.write(blob);
      await writer.close();
      return "saved";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return "cancelled";
      }
      // Unsupported or denied File System Access API: use the web-standard path.
    }
  }

  const blob = await getBlob();
  if (!blob) return "missing";

  // A generic binary MIME prevents Firefox from routing the click to its PDF
  // viewer while the filename keeps the correct .pdf extension.
  const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(downloadBlob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give Safari and Firefox time to start consuming the Blob URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  return "saved";
}
