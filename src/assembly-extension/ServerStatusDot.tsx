import { apiUrl } from "../util/backendHost";
import type { ServerStatus } from "./useServerStatus";

const LOOK: Record<ServerStatus["state"], { color: string; label: string }> = {
  checking: { color: "#71717a", label: "Checking the server..." },
  slow: { color: "#f59e0b", label: "The server is slow to answer (probably waking up; up to a minute)" },
  ok: { color: "#22c55e", label: "Server and database online" },
  down: { color: "#ef4444", label: "Server not reachable" },
};

/** A small dot next to the title: green / amber / red. Click to check again. */
export default function ServerStatusDot({ status, onCheck }: { status: ServerStatus; onCheck: () => void }) {
  const look = LOOK[status.state];
  const checked = status.checkedAt ? ` · checked ${new Date(status.checkedAt).toLocaleTimeString()}` : "";
  const title = `${look.label}${status.detail ? `: ${status.detail}` : ""}${checked}\n${apiUrl("")}\nClick to check again.`;
  return (
    <button
      type="button"
      className="assembly-bom-server-dot"
      onClick={onCheck}
      title={title}
      aria-label={look.label}
      style={{
        width: 10,
        height: 10,
        borderRadius: "50%",
        background: look.color,
        border: "none",
        padding: 0,
        marginLeft: 8,
        verticalAlign: "middle",
        cursor: "pointer",
        flex: "none",
      }}
    />
  );
}
