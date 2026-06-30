import type { ToolType } from "@graphite/protocol";

export interface ToolBarProps {
  effectiveTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  onSave: () => void;
}

const TOOLS = [
  { tool: "select" as const, label: "V", title: "Select (V)" },
  { tool: "pan" as const, label: "H", title: "Pan (H)" },
];

/**
 * Floating top-left toolbar: select/pan tool buttons plus a manual save
 * button. Pure presentational — selection state and the save action are
 * owned by the parent (`EngineCanvas`) and passed down as props.
 */
export function ToolBar({ effectiveTool, onSelectTool, onSave }: ToolBarProps) {
  return (
    <div
      aria-label="Toolbar"
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        display: "flex",
        gap: 4,
        background: "rgba(0,0,0,0.55)",
        borderRadius: 6,
        padding: "4px 6px",
      }}
    >
      {TOOLS.map(({ tool, label, title }) => (
        <button
          key={tool}
          title={title}
          onClick={() => {
            onSelectTool(tool);
          }}
          style={{
            background: effectiveTool === tool ? "rgba(22,119,255,0.85)" : "transparent",
            border: "none",
            borderRadius: 4,
            color: "rgba(255,255,255,0.85)",
            cursor: "pointer",
            fontFamily: "monospace",
            fontSize: 12,
            padding: "3px 8px",
            fontWeight: effectiveTool === tool ? 600 : 400,
          }}
        >
          {label}
        </button>
      ))}

      <button
        title="Save (Ctrl+S)"
        onClick={onSave}
        style={{
          background: "transparent",
          border: "none",
          borderRadius: 4,
          color: "rgba(255,255,255,0.6)",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 12,
          padding: "3px 8px",
          marginLeft: 4,
        }}
      >
        Save
      </button>
    </div>
  );
}
