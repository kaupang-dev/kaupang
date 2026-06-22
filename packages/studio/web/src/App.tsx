import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { addEdge, useEdgesState, useNodesState } from "@xyflow/react";
<<<<<<< HEAD
import type { Connection, Edge, Node, OnNodesChange, XYPosition } from "@xyflow/react";
import { fetchCatalog, fetchDefaults } from "./api";
import type { CatalogResponse, PlacedNodeData, Selection, ServiceDef, ServiceNodeType } from "./types";
import { kindFor } from "./lib/kind";
import { autoLayout, envBoxes, placeInEnv } from "./lib/layout";
=======
import type { Connection, Edge, Node, OnNodesChange } from "@xyflow/react";
import { fetchCatalog, fetchDefaults } from "./api";
import type { CatalogResponse, PlacedNodeData, Selection, ServiceDef, ServiceNodeType } from "./types";
import { kindFor } from "./lib/kind";
import { layout } from "./lib/layout";
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
import { buildExport } from "./lib/export";
import { buildImport, findConfig, sourceOf } from "./lib/import";
import { CatalogPanel } from "./components/CatalogPanel";
import { FlowCanvas } from "./components/FlowCanvas";
import { Inspector } from "./components/Inspector";
import { ExportPanel } from "./components/ExportPanel";
import { ContextMenu } from "./components/ContextMenu";
import type { MenuItem, MenuState } from "./components/ContextMenu";

let seq = 0;
const nextId = (name: string) => `${name}-${++seq}`;
const servicesOf = (nodes: Node[]) => nodes.filter((n) => n.type === "service") as ServiceNodeType[];
<<<<<<< HEAD
const withEnv = (n: Node, env: string) =>
  ({ ...n, data: { ...(n.data as PlacedNodeData), env } }) as ServiceNodeType;
=======
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d

export function App() {
  const [source, setSource] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<Selection>(null);

  const [environments, setEnvironments] = useState<string[]>(["market"]);
  const [activeEnv, setActiveEnv] = useState("market");
  const [envDeps, setEnvDeps] = useState<Record<string, string[]>>({});
  const importRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState("app");
  const [solution, setSolution] = useState("solution");
  const [exporting, setExporting] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const load = useCallback(async (src: string) => {
    if (!src) return;
    setLoading(true);
    setError(null);
    try {
      setCatalog(await fetchCatalog(src));
    } catch (err) {
      setError((err as Error).message);
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDefaults()
      .then((d) => {
        if (d.catalog) {
          setSource(d.catalog);
          void load(d.catalog);
        }
      })
      .catch(() => {});
  }, [load]);

<<<<<<< HEAD
  // Service nodes + the derived environment boxes behind them. Boxes recompute from where
  // the services sit, so nothing is ever auto-arranged — positions are only ever set by the
  // user (drag), by dropping, or by the explicit Auto-layout / Import actions.
  const displayNodes = useMemo(
    () => [...envBoxes(servicesOf(nodes), environments), ...nodes],
    [nodes, environments],
  );

  const place = useCallback(
    (node: ServiceNodeType, newEdges: Edge[]) => {
      if (newEdges.length) setEdges((prev) => [...prev, ...newEdges]);
      setNodes((prev) => [...prev, node]);
      setSelection({ type: "node", node });
    },
    [setEdges, setNodes],
  );

  const addPreset = useCallback(
    (name: string, def: ServiceDef, position?: XYPosition, env?: string) => {
      const targetEnv = env ?? activeEnv;
=======
  const rebuild = useCallback(
    (mutate: (s: ServiceNodeType[]) => ServiceNodeType[], envs: string[] = environments, nextEdges: Edge[] = edges) =>
      setNodes((prev) => layout(mutate(servicesOf(prev)), nextEdges, envs)),
    [edges, environments, setNodes],
  );

  // Add a service plus any new edges, then re-run the layout in one shot.
  const place = useCallback(
    (node: ServiceNodeType, newEdges: Edge[] = []) => {
      setEdges((prevE) => {
        const allE = newEdges.length ? [...prevE, ...newEdges] : prevE;
        setNodes((prevN) => layout([...servicesOf(prevN), node], allE, environments));
        return allE;
      });
      setSelection({ type: "node", node });
    },
    [environments, setEdges, setNodes],
  );

  const addPreset = useCallback(
    (name: string, def: ServiceDef) => {
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      const id = nextId(name);
      const node: ServiceNodeType = {
        id,
        type: "service",
<<<<<<< HEAD
        position: position ?? placeInEnv(servicesOf(nodes), targetEnv),
        data: { label: name, kind: kindFor(def), local: false, preset: name, env: targetEnv, def },
      };
      // Auto-wire the preset's own dependsOn to matching services already in the same env.
      const existing = servicesOf(nodes).filter((s) => s.data.env === targetEnv);
=======
        position: { x: 0, y: 0 },
        data: { label: name, kind: kindFor(def), local: false, preset: name, env: activeEnv, def },
      };
      // Auto-wire: the preset's own dependsOn → edges to matching services already in the
      // same environment (an edge new→existing means the new service depends on it).
      const existing = servicesOf(nodes).filter((s) => s.data.env === activeEnv);
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      const deps = Array.isArray(def.dependsOn) ? def.dependsOn : [];
      const newEdges: Edge[] = deps
        .map((dep) => existing.find((s) => s.data.label === dep))
        .filter((s): s is ServiceNodeType => Boolean(s))
        .map((t) => ({ id: `e-${id}-${t.id}`, source: id, target: t.id }));
      place(node, newEdges);
    },
    [activeEnv, nodes, place],
  );

  const addLocal = useCallback(() => {
    const id = nextId("new-service");
<<<<<<< HEAD
    place(
      {
        id,
        type: "service",
        position: placeInEnv(servicesOf(nodes), activeEnv),
        data: { label: "new-service", kind: "service", local: true, env: activeEnv, def: { build: "./services/new-service" } },
      },
      [],
    );
  }, [activeEnv, nodes, place]);
=======
    place({
      id,
      type: "service",
      position: { x: 0, y: 0 },
      data: { label: "new-service", kind: "service", local: true, env: activeEnv, def: { build: "./services/new-service" } },
    });
  }, [activeEnv, place]);
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d

  const updateNode = useCallback(
    (id: string, mutate: (d: PlacedNodeData) => PlacedNodeData) => {
      setNodes((prev) =>
        prev.map((n) => (n.id === id && n.type === "service" ? { ...n, data: mutate(n.data as PlacedNodeData) } : n)),
      );
      setSelection((sel) =>
        sel?.type === "node" && sel.node.id === id
          ? { type: "node", node: { ...sel.node, data: mutate(sel.node.data) } }
          : sel,
      );
    },
    [setNodes],
  );

<<<<<<< HEAD
  // Move a node to another environment. `relocate` drops it into the target env's cluster
  // (inspector dropdown); a drag-reassign keeps the position where it was dropped.
  const reassignEnv = useCallback(
    (id: string, env: string, relocate: boolean) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== id) return n;
          const moved = withEnv(n, env);
          if (relocate) moved.position = placeInEnv(servicesOf(prev).filter((s) => s.id !== id), env);
          return moved;
        }),
      );
=======
  const reassignEnv = useCallback(
    (id: string, env: string) => {
      rebuild((s) => s.map((n) => (n.id === id ? { ...n, data: { ...n.data, env } } : n)));
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setSelection((sel) =>
        sel?.type === "node" && sel.node.id === id
          ? { type: "node", node: { ...sel.node, data: { ...sel.node.data, env } } }
          : sel,
      );
    },
<<<<<<< HEAD
    [setNodes],
=======
    [rebuild],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const onNodeDropInEnv = useCallback(
    (id: string, envName: string | null) => {
      const cur = servicesOf(nodes).find((s) => s.id === id)?.data.env;
<<<<<<< HEAD
      if (envName && environments.includes(envName) && envName !== cur) reassignEnv(id, envName, false);
    },
    [environments, nodes, reassignEnv],
=======
      if (envName && environments.includes(envName) && envName !== cur) reassignEnv(id, envName);
      else rebuild((s) => s); // snap back into the wave layout
    },
    [environments, nodes, reassignEnv, rebuild],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const addEnvironment = useCallback(() => {
    const name = window.prompt("Environment name")?.trim();
    if (!name || environments.includes(name)) return;
<<<<<<< HEAD
    setEnvironments((prev) => [...prev, name]);
    setEnvDeps((d) => ({ ...d, [name]: [] }));
    setActiveEnv(name);
  }, [environments]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((prev) => addEdge(connection, prev)),
    [setEdges],
  );

  // Apply React Flow's changes; just clear the inspector if its node was deleted. Env boxes
  // recompute from the surviving nodes, so no relayout is needed.
=======
    const next = [...environments, name];
    setEnvironments(next);
    setEnvDeps((d) => ({ ...d, [name]: [] }));
    setActiveEnv(name);
    rebuild((s) => s, next);
  }, [environments, rebuild]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((prev) => {
        const next = addEdge(connection, prev);
        setNodes((ns) => layout(servicesOf(ns), next, environments));
        return next;
      }),
    [environments, setEdges, setNodes],
  );

  // Apply React Flow's changes, then re-run the layout whenever a node is removed so the
  // environment boxes (and their service counts) reflect the deletion.
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  const handleNodesChange = useCallback<OnNodesChange<Node>>(
    (changes) => {
      onNodesChange(changes);
      const removed = changes.flatMap((c) => (c.type === "remove" ? [c.id] : []));
      if (removed.length) {
        setSelection((sel) => (sel?.type === "node" && removed.includes(sel.node.id) ? null : sel));
<<<<<<< HEAD
      }
    },
    [onNodesChange],
=======
        setNodes((prev) => layout(servicesOf(prev), edges, environments));
      }
    },
    [onNodesChange, setNodes, edges, environments],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const onNodeClick = useCallback((_event: MouseEvent, node: Node) => {
    if (node.type === "service") setSelection({ type: "node", node: node as ServiceNodeType });
  }, []);

<<<<<<< HEAD
  // Which env box (if any) sits under a flow-space point — used to file a dropped preset.
  const envAt = useCallback(
    (point: XYPosition): string | undefined => {
      for (const b of envBoxes(servicesOf(nodes), environments)) {
        const w = (b.style?.width as number) ?? 0;
        const h = (b.style?.height as number) ?? 0;
        if (point.x >= b.position.x && point.x <= b.position.x + w && point.y >= b.position.y && point.y <= b.position.y + h) {
          return (b.data as { name: string }).name;
        }
      }
      return undefined;
    },
    [nodes, environments],
  );

  const onDropPreset = useCallback(
    (name: string, position: XYPosition) => {
      const def = catalog?.services[name];
      if (def) addPreset(name, def, position, envAt(position));
    },
    [catalog, addPreset, envAt],
  );

=======
  const onDropPreset = useCallback(
    (name: string) => {
      const def = catalog?.services[name];
      if (def) addPreset(name, def);
    },
    [catalog, addPreset],
  );

  // Import an exported project: pick kaupang.config.json + environments/*.json, rebuild the
  // canvas. Auto-loads the config's catalog so $catalog services resolve to their presets.
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  const onImportFiles = useCallback(
    async (fileList: FileList) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      if (nodes.length && !window.confirm("Replace the current canvas with the imported config?")) return;

      const parsed = (
        await Promise.all(
          files.map(async (f) => {
            try {
              return { name: f.name, json: JSON.parse(await f.text()) };
            } catch {
              return null;
            }
          }),
        )
      ).filter((p): p is { name: string; json: unknown } => p !== null);

      const src = sourceOf(findConfig(parsed));
      let presets = catalog?.services ?? {};
      if (src) {
        try {
          const c = await fetchCatalog(src);
          setCatalog(c);
          setSource(src);
          presets = c.services;
        } catch (err) {
          setError(`catalog “${src}” — ${(err as Error).message}`);
        }
      }

      const r = buildImport(parsed, presets);
      const envs = r.environments.length ? r.environments : ["market"];
      setEnvironments(envs);
      setActiveEnv(envs[0] ?? "market");
      setEnvDeps(r.envDeps);
      setEdges(r.edges);
<<<<<<< HEAD
      setNodes(autoLayout(r.nodes, r.edges, envs)); // one-time arrange for a fresh import
=======
      setNodes(layout(r.nodes, r.edges, envs));
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setProject(r.project);
      setSolution(r.solution);
      setSelection(null);
    },
    [catalog, nodes.length, setEdges, setNodes],
  );

  const removeNode = useCallback(
    (id: string) => {
<<<<<<< HEAD
      setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setSelection((sel) => (sel?.type === "node" && sel.node.id === id ? null : sel));
    },
    [setEdges, setNodes],
=======
      setEdges((prevE) => {
        const nextE = prevE.filter((e) => e.source !== id && e.target !== id);
        setNodes((prevN) => layout(servicesOf(prevN).filter((s) => s.id !== id), nextE, environments));
        return nextE;
      });
      setSelection((sel) => (sel?.type === "node" && sel.node.id === id ? null : sel));
    },
    [environments, setEdges, setNodes],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  // Detach a node from the graph: drop the edges into/out of it but keep the node.
  const unattachNode = useCallback(
<<<<<<< HEAD
    (id: string) => setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id)),
    [setEdges],
=======
    (id: string) => {
      setEdges((prevE) => {
        const nextE = prevE.filter((e) => e.source !== id && e.target !== id);
        setNodes((prevN) => layout(servicesOf(prevN), nextE, environments));
        return nextE;
      });
    },
    [environments, setEdges, setNodes],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node) => {
      if (node.type !== "service") return;
      event.preventDefault();
      const items: MenuItem[] = [];
      if (edges.some((e) => e.source === node.id || e.target === node.id)) {
        items.push({ label: "Unattach (remove links)", onClick: () => unattachNode(node.id) });
      }
      items.push({ label: "Remove", danger: true, onClick: () => removeNode(node.id) });
      setMenu({ x: event.clientX, y: event.clientY, items });
    },
    [edges, removeNode, unattachNode],
  );

  const renameEnv = useCallback(
    (env: string) => {
      const name = window.prompt("Rename environment", env)?.trim();
      if (!name || name === env || environments.includes(name)) return;
<<<<<<< HEAD
      setEnvironments((prev) => prev.map((e) => (e === env ? name : e)));
=======
      const next = environments.map((e) => (e === env ? name : e));
      setEnvironments(next);
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setEnvDeps((d) =>
        Object.fromEntries(
          Object.entries(d).map(([k, v]) => [k === env ? name : k, v.map((x) => (x === env ? name : x))]),
        ),
      );
      setActiveEnv((a) => (a === env ? name : a));
<<<<<<< HEAD
      setNodes((prev) => prev.map((n) => ((n.data as PlacedNodeData).env === env ? withEnv(n, name) : n)));
=======
      setNodes((prev) =>
        layout(
          servicesOf(prev).map((s) => (s.data.env === env ? { ...s, data: { ...s.data, env: name } } : s)),
          edges,
          next,
        ),
      );
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setSelection((sel) =>
        sel?.type === "node" && sel.node.data.env === env
          ? { type: "node", node: { ...sel.node, data: { ...sel.node.data, env: name } } }
          : sel,
      );
    },
<<<<<<< HEAD
    [environments, setNodes],
=======
    [environments, edges, setNodes],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const removeEnv = useCallback(
    (env: string) => {
      if (environments.length <= 1) {
        window.alert("Can't remove the only environment.");
        return;
      }
      const fallback = environments.find((e) => e !== env)!;
      const count = servicesOf(nodes).filter((s) => s.data.env === env).length;
      if (count > 0 && !window.confirm(`Move ${count} service${count === 1 ? "" : "s"} from “${env}” to “${fallback}”?`)) {
        return;
      }
<<<<<<< HEAD
      setEnvironments((prev) => prev.filter((e) => e !== env));
=======
      const next = environments.filter((e) => e !== env);
      setEnvironments(next);
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setEnvDeps((d) =>
        Object.fromEntries(
          Object.entries(d)
            .filter(([k]) => k !== env)
            .map(([k, v]) => [k, v.filter((x) => x !== env)]),
        ),
      );
      setActiveEnv((a) => (a === env ? fallback : a));
<<<<<<< HEAD
      setNodes((prev) => prev.map((n) => ((n.data as PlacedNodeData).env === env ? withEnv(n, fallback) : n)));
=======
      setNodes((prev) =>
        layout(
          servicesOf(prev).map((s) => (s.data.env === env ? { ...s, data: { ...s.data, env: fallback } } : s)),
          edges,
          next,
        ),
      );
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
      setSelection((sel) =>
        sel?.type === "node" && sel.node.data.env === env
          ? { type: "node", node: { ...sel.node, data: { ...sel.node.data, env: fallback } } }
          : sel,
      );
    },
<<<<<<< HEAD
    [environments, nodes, setNodes],
=======
    [environments, nodes, edges, setNodes],
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
  );

  const onEnvContextMenu = useCallback(
    (event: MouseEvent, env: string) => {
      event.preventDefault();
      setMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          { label: "Rename", onClick: () => renameEnv(env) },
          { label: "Remove", danger: true, onClick: () => removeEnv(env) },
        ],
      });
    },
    [renameEnv, removeEnv],
  );

  const placed = servicesOf(nodes);
  const files = useMemo(
    () =>
      exporting
        ? buildExport({
            services: placed,
            edges,
            environments,
            envDeps,
            presets: catalog?.services ?? {},
            source,
            project,
            solution,
          })
        : [],
    [exporting, placed, edges, environments, envDeps, catalog, source, project, solution],
  );

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <span className="size-2.5 rounded-full bg-accent" />
        <span className="text-[15px] font-medium">kaupang studio</span>
        <div className="ml-2 flex max-w-lg flex-1 items-center gap-2">
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void load(source);
            }}
            placeholder="catalog source — ./catalog.json, https://…, oci://…"
            className="h-9 flex-1 rounded-md border border-border bg-surface px-3 text-[13px] outline-none focus:border-accent"
          />
          <button
            onClick={() => void load(source)}
            className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] hover:border-border-strong"
          >
            Load
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          multiple
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void onImportFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <button
<<<<<<< HEAD
          onClick={() => setNodes((prev) => autoLayout(servicesOf(prev), edges, environments))}
=======
          onClick={() => rebuild((s) => s)}
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
          className="ml-auto h-9 rounded-md border border-border bg-surface px-3 text-[13px] hover:border-border-strong"
        >
          Auto-layout
        </button>
        <button
          onClick={() => importRef.current?.click()}
          className="h-9 rounded-md border border-border bg-surface px-3 text-[13px] hover:border-border-strong"
        >
          Import
        </button>
        <button
          onClick={() => setExporting(true)}
          className="h-9 rounded-md border border-accent bg-surface px-3 text-[13px] text-accent hover:brightness-110"
        >
          Export
        </button>
      </header>

      <main className="flex min-h-0 flex-1">
        <CatalogPanel
          services={catalog?.services ?? {}}
          loading={loading}
          error={error}
<<<<<<< HEAD
          onAdd={(name, def) => addPreset(name, def)}
=======
          onAdd={addPreset}
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
          onPreview={(name, def) => setSelection({ type: "preset", name, def })}
          onNewLocal={addLocal}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <span className="text-[11px] text-muted">environments</span>
            {environments.map((env) => (
              <button
                key={env}
                onClick={() => setActiveEnv(env)}
                onContextMenu={(e) => onEnvContextMenu(e, env)}
                title="Right-click to rename or remove"
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  activeEnv === env ? "border-accent text-accent" : "border-border text-muted"
                }`}
              >
                {env}
              </button>
            ))}
            <button
              onClick={addEnvironment}
              title="New environment"
              className="grid size-6 place-items-center rounded-full border border-border text-muted hover:text-text"
            >
              +
            </button>
            <span className="ml-auto text-[11px] text-faint">new services land in “{activeEnv}”</span>
          </div>
          <div className="min-h-0 flex-1">
            <FlowCanvas
<<<<<<< HEAD
              nodes={displayNodes}
=======
              nodes={nodes}
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
              edges={edges}
              onNodesChange={handleNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              onDropPreset={onDropPreset}
              onNodeDropInEnv={onNodeDropInEnv}
            />
          </div>
        </div>

        <Inspector
          selection={selection}
          environments={environments}
<<<<<<< HEAD
          onReassign={(env) => selection?.type === "node" && reassignEnv(selection.node.id, env, true)}
=======
          onReassign={(env) => selection?.type === "node" && reassignEnv(selection.node.id, env)}
>>>>>>> 9c0f0ed0279ad752db2cf216f4a419930ef6503d
          onUpdate={(mutate) => selection?.type === "node" && updateNode(selection.node.id, mutate)}
        />
      </main>

      {exporting && (
        <ExportPanel
          files={files}
          project={project}
          solution={solution}
          onChangeProject={setProject}
          onChangeSolution={setSolution}
          onClose={() => setExporting(false)}
        />
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}
    </div>
  );
}
