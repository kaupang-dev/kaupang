import type { Edge, Node } from "@xyflow/react";
import type { ServiceNodeType } from "../types";

const NODE_W = 180;
const NODE_H = 60;
const COL_GAP = 48;
const ROW_GAP = 26;
const PAD = 18;
const HEADER = 34;
const ENV_GAP = 56;
const EMPTY_W = 220;
const EMPTY_H = 120;

const groupByEnv = (services: ServiceNodeType[], envOrder: string[]) => {
  const byEnv = new Map<string, ServiceNodeType[]>();
  for (const env of envOrder) byEnv.set(env, []);
  for (const s of services) {
    if (!byEnv.has(s.data.env)) byEnv.set(s.data.env, []);
    byEnv.get(s.data.env)!.push(s);
  }
  return byEnv;
};

// Dependency waves within one environment (edge A→B = A depends on B, so B floats up).
function waves(group: ServiceNodeType[], edges: Edge[]): string[][] {
  const ids = new Set(group.map((g) => g.id));
  const deps = new Map<string, Set<string>>(group.map((g) => [g.id, new Set<string>()]));
  for (const e of edges) if (ids.has(e.source) && ids.has(e.target)) deps.get(e.source)!.add(e.target);

  const waveOf = new Map<string, number>();
  const remaining = new Set(ids);
  let wave = 0;
  while (remaining.size) {
    const ready = [...remaining].filter((id) => [...deps.get(id)!].every((d) => !remaining.has(d)));
    const layer = ready.length ? ready : [...remaining];
    for (const id of layer) {
      waveOf.set(id, wave);
      remaining.delete(id);
    }
    wave++;
  }
  const out: string[][] = [];
  for (const g of group) (out[waveOf.get(g.id) ?? 0] ??= []).push(g.id);
  return out;
}

// Lay out services into per-environment container ("env") nodes. Each environment is a
// box positioned left-to-right; its services are children (parentId = env node) stacked
// in dependency waves. Returns the full node list with env boxes before their children.
export function layout(services: ServiceNodeType[], edges: Edge[], envOrder: string[]): Node[] {
  const byEnv = groupByEnv(services, envOrder);
  const result: Node[] = [];
  let colX = 0;

  for (const [env, group] of byEnv) {
    const id = `env:${env}`;
    const rows = waves(group, edges);
    const rowWidth = (n: number) => n * (NODE_W + COL_GAP) - COL_GAP;
    const innerW = group.length ? Math.max(NODE_W, ...rows.map((r) => rowWidth(r.length))) : EMPTY_W - PAD * 2;
    const innerH = group.length ? rows.length * (NODE_H + ROW_GAP) - ROW_GAP : EMPTY_H - HEADER - PAD;
    const width = innerW + PAD * 2;
    const height = HEADER + innerH + PAD;

    result.push({
      id,
      type: "env",
      position: { x: colX, y: 0 },
      data: { name: env, count: group.length },
      style: { width, height },
      draggable: false,
      selectable: false,
      zIndex: -1,
    });

    rows.forEach((ids, w) => {
      const startX = PAD + (innerW - rowWidth(ids.length)) / 2;
      ids.forEach((nodeId, i) => {
        const node = group.find((g) => g.id === nodeId)!;
        result.push({
          ...node,
          parentId: id,
          extent: undefined,
          position: { x: startX + i * (NODE_W + COL_GAP), y: HEADER + w * (NODE_H + ROW_GAP) },
        });
      });
    });

    colX += width + ENV_GAP;
  }

  return result;
}
