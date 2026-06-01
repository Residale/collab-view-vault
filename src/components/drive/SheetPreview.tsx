import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";

/**
 * Native preview for spreadsheets (xlsx, xls, csv, ods, tsv).
 * Loads the file, parses sheets in the browser and renders them as
 * an HTML table with a sheet switcher.
 */
export function SheetPreview({ url, className }: { url: string; className?: string }) {
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[] | null>(null);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSheets(null);
    (async () => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const parsed = wb.SheetNames.map((name) => {
          const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], {
            header: 1, raw: false, defval: "",
          });
          return { name, rows: rows.slice(0, 500) as string[][] };
        });
        if (!cancelled) setSheets(parsed);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Could not read spreadsheet");
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <div className="p-6 text-sm text-muted-foreground">{error}</div>;
  if (!sheets) return <div className="p-6 text-sm text-muted-foreground">Parsing spreadsheet…</div>;
  if (sheets.length === 0) return <div className="p-6 text-sm text-muted-foreground">Empty spreadsheet</div>;

  const sheet = sheets[active];
  const maxCols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <div className={cn("flex flex-col size-full bg-surface", className)}>
      {sheets.length > 1 && (
        <div className="flex gap-1 px-2 pt-2 border-b border-hairline overflow-x-auto thin-scroll">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActive(i)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium rounded-t-md whitespace-nowrap transition-colors",
                i === active
                  ? "bg-background text-foreground ring-1 ring-hairline ring-b-0"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto thin-scroll">
        <table className="text-xs border-collapse">
          <tbody>
            {sheet.rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? "bg-surface-2 font-medium" : ""}>
                <td className="sticky left-0 bg-surface-2 text-muted-foreground text-[10px] font-mono px-2 py-1 border border-hairline w-10 text-right">
                  {ri + 1}
                </td>
                {Array.from({ length: maxCols }).map((_, ci) => (
                  <td key={ci} className="px-2 py-1 border border-hairline whitespace-nowrap max-w-[240px] overflow-hidden text-ellipsis">
                    {row[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {sheet.rows.length >= 500 && (
          <div className="p-3 text-[11px] text-muted-foreground text-center border-t border-hairline">
            Showing first 500 rows. Download to view the full file.
          </div>
        )}
      </div>
    </div>
  );
}
