import type { Violation } from "@complylens/shared";

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function HighlightedEditor({
  draft,
  onSelectViolation,
  violations,
  mode = "full",
  onChange
}: {
  draft: string;
  onChange?: (draft: string) => void;
  onSelectViolation: (id: string) => void;
  violations: Violation[];
  mode?: "full" | "preview";
}) {
  return (
    <div className="document-content">
      {mode === "full" && onChange && (
        <label className="editor-pane editor-pane--input">
          <span>Draft</span>
          <textarea
            aria-label="Document draft"
            className="document-textarea"
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type a message, paste a document, or attach a file."
            value={draft}
          />
        </label>
      )}
      <div className="editor-pane">
        <span>{mode === "preview" ? "Original text with highlights" : "Comparison"}</span>
        <div className="highlight-preview">
          {draft.split(/\n\s*\n/).map((paragraph, index) => {
            const paragraphViolations = violations.filter((v) => 
              v.quote.trim() && paragraph.toLowerCase().includes(v.quote.toLowerCase())
            );

            if (!paragraphViolations.length) {
              return <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>;
            }

            const sortedViolations = [...paragraphViolations].sort((a, b) => b.quote.length - a.quote.length);
            
            type Chunk = { text: string; violation?: Violation };
            let chunks: Chunk[] = [{ text: paragraph }];

            for (const violation of sortedViolations) {
              const newChunks: Chunk[] = [];
              const regex = new RegExp(`(${escapeRegExp(violation.quote)})`, "gi");
              
              for (const chunk of chunks) {
                if (chunk.violation) {
                  newChunks.push(chunk);
                  continue;
                }
                
                const parts = chunk.text.split(regex);
                if (parts.length === 1) {
                  newChunks.push(chunk);
                } else {
                  parts.forEach((part, i) => {
                    if (i % 2 === 1) {
                      newChunks.push({ text: part, violation });
                    } else if (part) {
                      newChunks.push({ text: part });
                    }
                  });
                }
              }
              chunks = newChunks;
            }

            return (
              <p key={`${index}-${paragraph.slice(0, 20)}`}>
                {chunks.map((chunk, i) => 
                  chunk.violation ? (
                    <button
                      key={i}
                      className={`inline-flag inline-flag--${chunk.violation.severity}`}
                      onClick={() => onSelectViolation(chunk.violation!.id)}
                      type="button"
                    >
                      {chunk.text}
                    </button>
                  ) : (
                    <span key={i}>{chunk.text}</span>
                  )
                )}
              </p>
            );
          })}
        </div>
      </div>
    </div>
  );
}
