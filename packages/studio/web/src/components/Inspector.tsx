import type { PlacedNodeData, Selection, ServiceDef } from "../types";

const toList = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
const toLines = (s: string) => s.split(/\n+/).map((x) => x.trim()).filter(Boolean);

const envToText = (env?: Record<string, unknown>) =>
  Object.entries(env ?? {})
    .map(([k, v]) => `${k}=${String(v)}`)
    .join("\n");
const parseEnv = (text: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of toLines(text)) {
    const i = line.indexOf("=");
    if (i < 0) out[line] = "";
    else out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
};

const buildToText = (build?: ServiceDef["build"]) =>
  typeof build === "string" ? build : build && typeof build === "object" ? (build.context ?? "") : "";

// networks: one per line — "name" for a plain attachment, or "name: alias1, alias2" to
// add aliases. Emit the array form when no line has aliases, else the map form (both are
// rendered by the compose/swarm backends).
const networksToText = (networks?: ServiceDef["networks"]): string => {
  if (!networks) return "";
  if (Array.isArray(networks)) return networks.join("\n");
  return Object.entries(networks)
    .map(([name, v]) => (v.aliases?.length ? `${name}: ${v.aliases.join(", ")}` : name))
    .join("\n");
};
const parseNetworks = (text: string): ServiceDef["networks"] | undefined => {
  const lines = toLines(text);
  if (!lines.length) return undefined;
  const map: Record<string, { aliases?: string[] }> = {};
  let hasAliases = false;
  for (const line of lines) {
    const i = line.indexOf(":");
    if (i < 0) {
      map[line] = {};
      continue;
    }
    const name = line.slice(0, i).trim();
    const aliases = line.slice(i + 1).split(",").map((a) => a.trim()).filter(Boolean);
    map[name] = aliases.length ? { aliases } : {};
    if (aliases.length) hasAliases = true;
  }
  return hasAliases ? map : Object.keys(map);
};

const fieldCls =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px] text-text outline-none focus:border-accent";

function Text({
  rid,
  label,
  value,
  placeholder,
  onCommit,
}: {
  rid: string;
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        key={rid}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => onCommit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={fieldCls}
      />
    </label>
  );
}

function Area({
  rid,
  label,
  value,
  placeholder,
  rows = 3,
  onCommit,
}: {
  rid: string;
  label: string;
  value: string;
  placeholder?: string;
  rows?: number;
  onCommit: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <textarea
        key={rid}
        rows={rows}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(e) => onCommit(e.target.value)}
        className={`${fieldCls} resize-none`}
      />
    </label>
  );
}

function NodeView({
  nodeId,
  data,
  environments,
  onReassign,
  onUpdate,
}: {
  nodeId: string;
  data: PlacedNodeData;
  environments: string[];
  onReassign: (env: string) => void;
  onUpdate: (mutate: (d: PlacedNodeData) => PlacedNodeData) => void;
}) {
  const def = data.def;
  const setDef = (patch: Partial<ServiceDef>) => onUpdate((d) => ({ ...d, def: { ...d.def, ...patch } }));

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: data.kind === "infra" ? "var(--color-infra)" : "var(--color-service)" }}
          />
          {data.local ? (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">local</span>
          ) : (
            <span className="text-[12px] text-muted">
              from preset <span className="font-mono text-text">{data.preset}</span>
            </span>
          )}
        </div>
        <input
          key={`${nodeId}-name`}
          defaultValue={data.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v) onUpdate((d) => ({ ...d, label: v }));
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-[14px] font-medium text-text outline-none focus:border-accent"
        />
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
          env:
          <select
            value={data.env}
            onChange={(e) => onReassign(e.target.value)}
            className="bg-transparent text-[11px] text-text outline-none"
          >
            {environments.map((env) => (
              <option key={env} value={env} className="bg-surface">
                {env}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" checked={!!def.runOnce} onChange={(e) => setDef({ runOnce: e.target.checked })} />
          runOnce
        </label>
      </div>

      <Text rid={`${nodeId}-image`} label="image" value={def.image ?? ""} placeholder="image:tag" onCommit={(v) => setDef({ image: v || undefined })} />
      <Text rid={`${nodeId}-build`} label="build context" value={buildToText(def.build)} placeholder="./services/app" onCommit={(v) => setDef({ build: v || undefined })} />
      <Text rid={`${nodeId}-ports`} label="ports" value={(def.ports ?? []).join(", ")} placeholder="8080:3000" onCommit={(v) => setDef({ ports: toList(v) })} />
      <Text rid={`${nodeId}-entry`} label="entrypoint" value={(def.entrypoint ?? []).join(" ")} placeholder="/bin/sh -c" onCommit={(v) => setDef({ entrypoint: toList(v) })} />
      <Text rid={`${nodeId}-cmd`} label="command" value={(def.command ?? []).join(" ")} placeholder="npm run worker" onCommit={(v) => setDef({ command: toList(v) })} />
      <Text rid={`${nodeId}-cwd`} label="working directory" value={def.workingDirectory ?? ""} placeholder="/app" onCommit={(v) => setDef({ workingDirectory: v || undefined })} />
      <Area rid={`${nodeId}-vol`} label="volumes (one per line)" value={(def.volumes ?? []).join("\n")} placeholder={"data:/var/lib/db\n./local:/app"} onCommit={(v) => setDef({ volumes: toLines(v) })} />
      <Area rid={`${nodeId}-net`} label="networks (name or name: alias1, alias2)" value={networksToText(def.networks)} placeholder={"frontend\nbackend: api.internal"} onCommit={(v) => setDef({ networks: parseNetworks(v) })} />
      <Area rid={`${nodeId}-env`} label="env (KEY=value per line)" value={envToText(def.env)} placeholder={"LOG_LEVEL=info"} onCommit={(v) => setDef({ env: parseEnv(v) })} />
    </div>
  );
}

function PresetView({ name, def }: { name: string; def: ServiceDef }) {
  const image = def.image ?? buildToText(def.build) ?? "—";
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-medium">{name}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">catalog preset</span>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">image / build</div>
        <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px]">{image}</div>
      </div>
      <div>
        <div className="mb-1 text-[11px] text-muted">ports</div>
        <div className="rounded-md border border-border bg-surface px-2.5 py-1.5 font-mono text-[12px]">
          {(def.ports ?? []).join(", ") || "—"}
        </div>
      </div>
      <p className="text-[12px] text-faint">Drag onto the canvas to add it as a catalog-linked service.</p>
    </div>
  );
}

export function Inspector({
  selection,
  environments,
  onReassign,
  onUpdate,
}: {
  selection: Selection;
  environments: string[];
  onReassign: (env: string) => void;
  onUpdate: (mutate: (d: PlacedNodeData) => PlacedNodeData) => void;
}) {
  return (
    <aside className="flex w-[360px] min-h-0 shrink-0 flex-col border-l border-border">
      <div className="flex h-11 shrink-0 items-center px-4">
        <span className="text-[13px] font-medium">Inspector</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {!selection && (
          <p className="text-[12px] text-muted">Select a node on the canvas, or a preset in the catalog.</p>
        )}
        {selection?.type === "preset" && <PresetView name={selection.name} def={selection.def} />}
        {selection?.type === "node" && (
          <NodeView
            nodeId={selection.node.id}
            data={selection.node.data}
            environments={environments}
            onReassign={onReassign}
            onUpdate={onUpdate}
          />
        )}
      </div>
    </aside>
  );
}
