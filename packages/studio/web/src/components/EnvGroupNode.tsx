import type { NodeProps } from "@xyflow/react";
import type { EnvGroupNodeType } from "../types";

// A purely visual container. pointer-events-none lets clicks and pane drags pass through to
// the services on top and the canvas behind; drag-to-reassign uses geometry, not pointers.
export function EnvGroupNode({ data }: NodeProps<EnvGroupNodeType>) {
  return (
    <div className="pointer-events-none size-full rounded-xl border border-dashed border-border-strong bg-surface/20">
      <div className="flex items-center gap-2 px-3 pt-2">
        <span className="text-[13px] font-medium text-text">{data.name}</span>
        <span className="text-[11px] text-faint">
          {data.count} {data.count === 1 ? "service" : "services"}
        </span>
      </div>
      {data.count === 0 && (
        <div className="px-3 pt-3 text-[11px] text-faint">empty — make it active, then drop a preset here</div>
      )}
    </div>
  );
}
