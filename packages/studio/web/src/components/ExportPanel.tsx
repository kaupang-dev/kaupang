import { useState } from "react";
import type { ExportFile } from "../lib/export";

function download(file: ExportFile) {
  const blob = new Blob([file.content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.path.split("/").pop() ?? "config.json";
  a.click();
  URL.revokeObjectURL(url);
}

function FileBlock({ file }: { file: ExportFile }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="font-mono text-[12px] text-text">{file.path}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(file.content).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
          className="ml-auto rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text"
        >
          {copied ? "copied" : "copy"}
        </button>
        <button
          onClick={() => download(file)}
          className="rounded border border-border px-2 py-0.5 text-[11px] text-muted hover:text-text"
        >
          download
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface-2 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-text">
        {file.content}
      </pre>
    </div>
  );
}

interface Props {
  files: ExportFile[];
  project: string;
  solution: string;
  onChangeProject: (v: string) => void;
  onChangeSolution: (v: string) => void;
  onClose: () => void;
}

export function ExportPanel({ files, project, solution, onChangeProject, onChangeSolution, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-[520px] max-w-full flex-col bg-bg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="text-[15px] font-medium">Export</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md border border-border px-2 py-1 text-[12px] text-muted hover:text-text"
          >
            close
          </button>
        </div>

        <div className="flex gap-3 border-b border-border px-4 py-3">
          <label className="flex-1 text-[11px] text-muted">
            project
            <input
              value={project}
              onChange={(e) => onChangeProject(e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-[12px] text-text outline-none focus:border-accent"
            />
          </label>
          <label className="flex-1 text-[11px] text-muted">
            solution
            <input
              value={solution}
              onChange={(e) => onChangeSolution(e.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-border bg-surface px-2 text-[12px] text-text outline-none focus:border-accent"
            />
          </label>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {files.length === 0 && (
            <p className="text-[12px] text-muted">Add services to the canvas, then come back to export.</p>
          )}
          {files.map((f) => (
            <FileBlock key={f.path} file={f} />
          ))}
        </div>
      </div>
    </div>
  );
}
