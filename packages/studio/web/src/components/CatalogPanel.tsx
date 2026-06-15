import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ServiceDef } from "../types";
import { kindFor } from "../lib/kind";

interface Props {
  services: Record<string, ServiceDef>;
  loading: boolean;
  error: string | null;
  onAdd: (name: string, def: ServiceDef) => void;
  onPreview: (name: string, def: ServiceDef) => void;
  onNewLocal: () => void;
}

type Filter = "all" | "infra" | "service";
const FILTERS: Filter[] = ["all", "infra", "service"];
const ROW = 46;

export function CatalogPanel({ services, loading, error, onAdd, onPreview, onNewLocal }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const parentRef = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () =>
      Object.entries(services)
        .map(([name, def]) => ({ name, def, kind: kindFor(def) }))
        .sort((a, b) => (a.name < b.name ? -1 : 1)),
    [services],
  );

  const term = query.trim().toLowerCase();
  const list = entries.filter(
    (e) => (filter === "all" || e.kind === filter) && (!term || e.name.toLowerCase().includes(term)),
  );

  const rows = useVirtualizer({
    count: list.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW,
    overscan: 12,
  });

  return (
    <aside className="flex w-72 min-h-0 shrink-0 flex-col border-r border-border">
      <div className="flex h-11 shrink-0 items-center gap-2 px-3">
        <span className="text-[13px] font-medium">Catalog</span>
        <span className="text-[11px] text-muted">
          {list.length}/{entries.length}
        </span>
        <button
          onClick={onNewLocal}
          title="New local service"
          className="ml-auto grid size-7 place-items-center rounded-md border border-border text-muted hover:border-border-strong hover:text-text"
        >
          +
        </button>
      </div>

      <div className="shrink-0 px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search presets…"
          className="h-8 w-full rounded-md border border-border bg-surface px-2.5 text-[12px] outline-none focus:border-accent"
        />
        <div className="mt-2 flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[11px] capitalize ${
                filter === f ? "border-accent text-accent" : "border-border text-muted"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="px-3 py-2 text-[12px] text-muted">Loading…</p>}
      {error && <p className="px-3 py-2 text-[12px] text-red-400">{error}</p>}
      {!loading && !error && list.length === 0 && (
        <p className="px-3 py-2 text-[12px] text-muted">No presets. Load a catalog above.</p>
      )}

      <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <div style={{ height: rows.getTotalSize(), position: "relative" }}>
          {rows.getVirtualItems().map((vi) => {
            const e = list[vi.index]!;
            return (
              <div
                key={e.name}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: vi.size, transform: `translateY(${vi.start}px)` }}
              >
                <div
                  draggable
                  onDragStart={(ev) => ev.dataTransfer.setData("application/kaupang-preset", e.name)}
                  onClick={() => onPreview(e.name, e.def)}
                  className="group flex h-full cursor-grab items-center gap-2 rounded-md px-2 hover:bg-surface"
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: e.kind === "infra" ? "var(--color-infra)" : "var(--color-service)" }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium">{e.name}</div>
                    <div className="truncate font-mono text-[11px] text-muted">{e.def.image ?? "build"}</div>
                  </div>
                  <button
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onAdd(e.name, e.def);
                    }}
                    title="Add to canvas"
                    className="ml-auto grid size-6 place-items-center rounded border border-border text-muted opacity-0 hover:text-text group-hover:opacity-100"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
