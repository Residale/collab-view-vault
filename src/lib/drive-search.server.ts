// Server-only text extraction helpers. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TEXT_EXTS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "log", "xml", "yml", "yaml",
  "js", "ts", "tsx", "jsx", "py", "html", "css", "go", "rs", "java", "c", "cpp", "rb", "php", "sh",
]);

const MAX_TEXT_BYTES = 5 * 1024 * 1024; // cap raw bytes we read
const MAX_OUTPUT_CHARS = 200_000; // cap stored text per file

function ext(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export async function extractTextFromStorage(
  storagePath: string,
  name: string,
  mime: string | null,
): Promise<string | null> {
  const { data: blob, error } = await supabaseAdmin.storage.from("drive").download(storagePath);
  if (error || !blob) return null;
  if (blob.size > MAX_TEXT_BYTES * 4) return null; // skip huge files

  const buf = new Uint8Array(await blob.arrayBuffer());
  const e = ext(name);
  const m = mime ?? "";

  try {
    if (m === "application/pdf" || e === "pdf") {
      return await extractPdf(buf);
    }
    if (
      e === "docx" ||
      m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      return await extractDocx(buf);
    }
    if (m.startsWith("text/") || TEXT_EXTS.has(e)) {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, MAX_TEXT_BYTES));
      return text.slice(0, MAX_OUTPUT_CHARS);
    }
  } catch (err) {
    console.error("extractText failed", storagePath, err);
    return null;
  }
  return null;
}

async function extractPdf(buf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Disable worker (run on main thread) – fine for server-side extraction.
  (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
  const loadingTask = (pdfjs as any).getDocument({
    data: buf,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  const maxPages = Math.min(doc.numPages, 50);
  let out = "";
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    out += strings + "\n";
    if (out.length > MAX_OUTPUT_CHARS) break;
  }
  return out.slice(0, MAX_OUTPUT_CHARS);
}

async function extractDocx(buf: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  // mammoth wants a Buffer-like object
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return (result.value ?? "").slice(0, MAX_OUTPUT_CHARS);
}
