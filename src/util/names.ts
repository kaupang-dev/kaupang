/** Lowercase, replace illegal chars; safe for compose projects + swarm stacks. */
export function sanitize(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "") || "default"
  );
}

/** RFC 1123 label, used for kubernetes namespaces and resource names. */
export function k8sName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^[-]+|[-]+$/g, "")
      .slice(0, 63) || "default"
  );
}

/** "project_env" stack/project identifier. */
export function stackName(project: string, env: string): string {
  return `${sanitize(project)}_${sanitize(env)}`;
}
