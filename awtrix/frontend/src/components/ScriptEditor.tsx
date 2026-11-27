import Editor from "@monaco-editor/react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: string;
}

export default function ScriptEditor({
  value,
  onChange,
  height = "500px",
}: Props) {
  return (
    <div className="overflow-hidden rounded-lg border border-[hsl(var(--border))]">
      <Editor
        height={height}
        defaultLanguage="python"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? "")}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          wordWrap: "on",
          tabSize: 2,
          renderWhitespace: "selection",
          bracketPairColorization: { enabled: true },
        }}
      />
    </div>
  );
}
