import type { Kind, ServiceDef } from "../types";

// Best-effort classification for node coloring. The catalog doesn't carry an explicit
// kind, so we infer "infra" from well-known images; anything built or unrecognized is a
// "service". Purely cosmetic — it never affects the exported config.
const INFRA =
  /(^|\/)(postgres|mysql|mariadb|redis|valkey|mongo|rabbitmq|nats|kafka|zookeeper|minio|memcached|elasticsearch|opensearch|clickhouse|nginx|traefik|haproxy|caddy|vault|consul|etcd|prometheus|grafana|mailhog)\b/i;

export function kindFor(def: ServiceDef): Kind {
  if (def.build) return "service";
  return INFRA.test(def.image ?? "") ? "infra" : "service";
}
