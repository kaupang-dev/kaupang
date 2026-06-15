import type { Node } from "@xyflow/react";

/** A resolved catalog entry — a kaupang ServiceDefinition, kept loose on the client. */
export interface ServiceDef {
  image?: string;
  build?: string | { context?: string };
  ports?: string[];
  command?: string[];
  entrypoint?: string[];
  workingDirectory?: string;
  volumes?: string[];
  networks?: string[] | Record<string, { aliases?: string[] }>;
  dependsOn?: string[];
  env?: Record<string, unknown>;
  runOnce?: boolean;
  [key: string]: unknown;
}

/** Shape returned by GET /api/catalog. */
export interface CatalogResponse {
  services: Record<string, ServiceDef>;
  solutions: string[];
}

export type Kind = "infra" | "service";

/** Data carried by a service node on the canvas. */
export interface PlacedNodeData extends Record<string, unknown> {
  label: string;
  kind: Kind;
  /** true = authored inline (not from the catalog). */
  local: boolean;
  /** catalog preset name, when not local. */
  preset?: string;
  env: string;
  def: ServiceDef;
}

export type ServiceNodeType = Node<PlacedNodeData, "service">;

/** A container node that groups an environment's services into a labeled box. */
export interface EnvGroupData extends Record<string, unknown> {
  name: string;
  count: number;
}

export type EnvGroupNodeType = Node<EnvGroupData, "env">;

export type Selection =
  | { type: "node"; node: ServiceNodeType }
  | { type: "preset"; name: string; def: ServiceDef }
  | null;
