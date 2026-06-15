import type { NodeProps } from "@xyflow/react";
import type { EnvGroupNodeType } from "../types";

export function EnvGroupNode({ data }: NodeProps<EnvGroupNodeType>) {
  return (
    <div className="size-full rounded-xl border border-dashed border-border-strong bg-surface/30">
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="text-[13px] font-medium text-text">{data.name}</span>
        <span className="text-[11px] text-faint">
          {data.count} {data.count === 1 ? "service" : "services"}
        </span>
      </div>
      {data.count === 0 && (
        <div className="px-3 pt-3 text-[11px] text-faint">drag a preset here</div>
      )}
    </div>
  );
}
