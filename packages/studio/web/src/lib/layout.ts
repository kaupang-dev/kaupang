import type { Edge, Node, XYPosition } from "@xyflow/react";
import type { ServiceNodeType } from "../types";

// Fallback node size before React Flow has measured a freshly-added node.
const EST_W = 180;
const EST_H = 64;
const PAD = 18;
const HEADER = 30;

// Placeholder size for an environment that has no services yet.
const EMPTY_W = 240;
const EMPTY_H = 130;

// Spacing for the explicit (button / import) wave layout.
const NODE_W = 180;
const NODE_H = 64;
const COL_GAP = 48;
const ROW_GAP = 28;
const ENV_GAP = 96;

function groupByEnv(services: ServiceNodeType[], envOrder: string[]): Map<string, ServiceNodeType[]> {
  const byEnv = new Map<string, ServiceNodeType[]>();
  for (const env of envOrder) byEnv.set(env, []);
  for (const s of services) {
    if (!byEnv.has(s.data.env)) byEnv.set(s.data.env, []);
    byEnv.get(s.data.env)!.push(s);
  }
  return byEnv;
}

const sizeOf = (s: ServiceNodeType): [number, number] => [s.measured?.width ?? EST_W, s.measured?.height ?? EST_H];

// Container ("env") nodes derived from where the services actually sit. Each box is sized
// to enclose its members (using their real measured dimensions, so a wide node never spills
// out) with a header strip on top. Empty environments get no box. These are non-interactive
// background nodes; they never move the services.
export function envBoxes(services: ServiceNodeType[], envOrder: string[]): Node[] {
  const box = (env: string, count: number, x: number, y: number, width: number, height: number): Node => ({
    id: `env:${env}`,
    type: "env",
    position: { x, y },
    data: { name: env, count },
    // Explicit dimensions so React Flow treats the box as measured and renders it
    // (a non-interactive node otherwise stays visibility:hidden awaiting measurement).
    width,
    height,
    style: { width, height },
    draggable: false,
    selectable: false,
    zIndex: -1,
  });

  const boxes: Node[] = [];
  const empty: string[] = [];
  let rightEdge = -Infinity;

  for (const [env, members] of groupByEnv(services, envOrder)) {
    if (!members.length) {
      empty.push(env);
      continue;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of members) {
      const [w, h] = sizeOf(s);
      minX = Math.min(minX, s.position.x);
      minY = Math.min(minY, s.position.y);
      maxX = Math.max(maxX, s.position.x + w);
      maxY = Math.max(maxY, s.position.y + h);
    }
    const x = minX - PAD;
    const width = maxX - minX + PAD * 2;
    boxes.push(box(env, members.length, x, minY - PAD - HEADER, width, maxY - minY + PAD * 2 + HEADER));
    rightEdge = Math.max(rightEdge, x + width);
  }

  // Empty environments still get a (placeholder) box, parked to the right of the populated
  // ones, so a freshly-created environment is visible and can be dropped into.
  let x = Number.isFinite(rightEdge) ? rightEdge + ENV_GAP : 40;
  for (const env of empty) {
    boxes.push(box(env, 0, x, 40, EMPTY_W, EMPTY_H));
    x += EMPTY_W + ENV_GAP;
  }
  return boxes;
}

// A free slot for a new service in an environment: below that env's current cluster, or a
// default corner when it's empty. Keeps a new node from landing on top of an existing one.
export function placeInEnv(services: ServiceNodeType[], env: string): XYPosition {
  const members = services.filter((s) => s.data.env === env);
  if (members.length) {
    let minX = Infinity;
    let maxBottom = -Infinity;
    for (const s of members) {
      minX = Math.min(minX, s.position.x);
      maxBottom = Math.max(maxBottom, s.position.y + sizeOf(s)[1]);
    }
    return { x: minX, y: maxBottom + ROW_GAP };
  }
  // First service of an (empty) environment: drop it to the right of everything else, near
  // where that env's placeholder box sits, rather than on top of another env at the origin.
  if (!services.length) return { x: 80, y: 80 };
  let maxRight = -Infinity;
  let minY = Infinity;
  for (const s of services) {
    maxRight = Math.max(maxRight, s.position.x + sizeOf(s)[0]);
    minY = Math.min(minY, s.position.y);
  }
  return { x: maxRight + ENV_GAP + PAD, y: Number.isFinite(minY) ? minY : 80 };
}

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

// Explicit arrange: services into per-environment columns, dependency-wave stacked. Used by
// the "Auto-layout" button and once on import — never automatically on edit.
export function autoLayout(services: ServiceNodeType[], edges: Edge[], envOrder: string[]): ServiceNodeType[] {
  const out: ServiceNodeType[] = [];
  let colX = 0;
  for (const [, members] of groupByEnv(services, envOrder)) {
    if (!members.length) continue;
    const rows = waves(members, edges);
    const rowWidth = (n: number) => n * (NODE_W + COL_GAP) - COL_GAP;
    const innerW = Math.max(NODE_W, ...rows.map((r) => rowWidth(r.length)));
    rows.forEach((ids, w) => {
      const startX = colX + (innerW - rowWidth(ids.length)) / 2;
      ids.forEach((id, i) => {
        const node = members.find((m) => m.id === id)!;
        out.push({ ...node, position: { x: startX + i * (NODE_W + COL_GAP), y: w * (NODE_H + ROW_GAP) } });
      });
    });
    colX += innerW + ENV_GAP;
  }
  return out;
}
