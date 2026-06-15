import { useCallback, useMemo, useState } from "react";
import type { DragEvent, MouseEvent } from "react";
import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import type { Connection, Edge, Node, OnEdgesChange, OnNodeDrag, OnNodesChange, XYPosition } from "@xyflow/react";
import type { EnvGroupData, PlacedNodeData } from "../types";
import { ServiceNode } from "./ServiceNode";
import { EnvGroupNode } from "./EnvGroupNode";

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onNodeClick: (event: MouseEvent, node: Node) => void;
  onNodeContextMenu: (event: MouseEvent, node: Node) => void;
  onDropPreset: (name: string, position: XYPosition) => void;
  /** Fired when a service is dropped; envName is the environment box under it (or null). */
  onNodeDropInEnv: (nodeId: string, envName: string | null) => void;
}

const SHORTCUTS: [string, string][] = [
  ["Drag preset → canvas", "add a service"],
  ["Drag node → env box", "move it there"],
  ["Drag handle → handle", "add a dependency"],
  ["Right-click node / env", "actions menu"],
  ["Delete / Backspace", "remove selected"],
  ["Scroll · drag pane", "zoom · pan"],
];

function Canvas(props: Props) {
  const { screenToFlowPosition, getIntersectingNodes } = useReactFlow();
  const nodeTypes = useMemo(() => ({ service: ServiceNode, env: EnvGroupNode }), []);
  const [help, setHelp] = useState(false);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const name = event.dataTransfer.getData("application/kaupang-preset");
      if (!name) return;
      props.onDropPreset(name, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [props, screenToFlowPosition],
  );

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onNodeDragStop = useCallback<OnNodeDrag<Node>>(
    (_event, node) => {
      if (node.type !== "service") return;
      const overEnv = getIntersectingNodes(node).find((n) => n.type === "env");
      props.onNodeDropInEnv(node.id, overEnv ? (overEnv.data as EnvGroupData).name : null);
    },
    [getIntersectingNodes, props],
  );

  return (
    <div className="relative size-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={props.nodes}
        edges={props.edges}
        onNodesChange={props.onNodesChange}
        onEdgesChange={props.onEdgesChange}
        onConnect={props.onConnect}
        onNodeClick={props.onNodeClick}
        onNodeContextMenu={props.onNodeContextMenu}
        onNodeDragStop={onNodeDragStop}
        nodeTypes={nodeTypes}
        colorMode="dark"
        fitView
        deleteKeyCode={["Backspace", "Delete"]}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ style: { stroke: "var(--color-border-strong)" } }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#22303d" />
        <MiniMap
          pannable
          zoomable
          maskColor="rgba(0,0,0,0.55)"
          nodeColor={(node) => {
            if (node.type !== "service") return "transparent";
            return (node.data as PlacedNodeData).kind === "infra" ? "#1d9e75" : "#7f77dd";
          }}
        />
        <Controls>
          <ControlButton onClick={() => setHelp((h) => !h)} title="Keyboard shortcuts" aria-label="Keyboard shortcuts">
            ?
          </ControlButton>
        </Controls>
      </ReactFlow>

      {help && (
        <div className="absolute bottom-4 left-14 z-10 w-64 rounded-lg border border-border bg-surface p-3 text-[11.5px] shadow-xl">
          <div className="mb-2 flex items-center">
            <span className="font-medium text-text">Shortcuts</span>
            <button onClick={() => setHelp(false)} className="ml-auto text-muted hover:text-text" aria-label="Close">
              ✕
            </button>
          </div>
          <ul className="space-y-1.5">
            {SHORTCUTS.map(([keys, what]) => (
              <li key={keys} className="flex items-baseline justify-between gap-3">
                <span className="text-muted">{keys}</span>
                <span className="text-right text-text">{what}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function FlowCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
