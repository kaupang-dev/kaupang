import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import type { PlacedNodeData, ServiceNodeType } from "../types";

function summary(data: PlacedNodeData): string {
  if (data.def.image) return data.def.image;
  if (data.def.build) return "build";
  return data.local ? "local" : (data.preset ?? "");
}

export function ServiceNode({ data, selected }: NodeProps<ServiceNodeType>) {
  const accent = data.kind === "infra" ? "var(--color-infra)" : "var(--color-service)";
  return (
    <div
      className="min-w-[150px] max-w-[220px] rounded-lg bg-surface px-3 py-2"
      style={{
        border: `1.5px ${data.local ? "dashed" : "solid"} ${
          selected ? "var(--color-accent)" : "var(--color-border-strong)"
        }`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-faint" />
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="truncate text-[13px] font-medium">{data.label}</span>
        {data.def.runOnce && (
          <span className="rounded bg-surface-2 px-1.5 text-[10px] text-muted">runOnce</span>
        )}
      </div>
      <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{summary(data)}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-faint" />
    </div>
  );
}
