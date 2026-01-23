import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface TypewriterTextProps {
  text: string;
  speedMs?: number;
  startAutomatically?: boolean;
  onComplete?: () => void;
  showCaret?: boolean;
  caretClassName?: string;
  className?: string;
}

export default function TypewriterText({
  text,
  speedMs = 15,
  startAutomatically = true,
  onComplete,
  showCaret = true,
  caretClassName = "inline-block w-[0.35ch] bg-accent ml-1 align-middle animate-pulse h-[1em]",
  className,
}: TypewriterTextProps) {
  const [displayed, setDisplayed] = useState<string>("");
  const indexRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTextRef = useRef("");

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (text === lastTextRef.current) return;

    if (text.startsWith(lastTextRef.current)) {
      lastTextRef.current = text;
    } else {
      lastTextRef.current = text;
      setDisplayed("");
      indexRef.current = 0;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    startTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, startAutomatically]);

  const startTyping = () => {
    if (!startAutomatically) return;
    if (intervalRef.current) return;

    if (indexRef.current >= text.length) {
      setDisplayed(text);
      onComplete?.();
      return;
    }

    intervalRef.current = setInterval(() => {
      const currentLength = indexRef.current;
      const targetLength = lastTextRef.current.length;

      if (currentLength >= targetLength) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (currentLength >= text.length) {
          onComplete?.();
        }
        return;
      }

      indexRef.current = currentLength + 1;
      setDisplayed(lastTextRef.current.slice(0, indexRef.current));
    }, speedMs);
  };

  return (
    <div className={className}>
      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          // --- CHANGED: Added specific financial styling components ---
          // These match the styles in ChatMessage to ensure consistency during animation
          components={{
            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
            ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
            ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
            li: ({ children }) => <li className="mb-1">{children}</li>,
            // Styling for bold text (often used for keys like **Date:**)
            strong: ({ children }) => <strong className="font-semibold text-accent">{children}</strong>,
            // Styling for headers
            h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-4 text-accent">{children}</h1>,
            h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3 text-accent">{children}</h2>,
            h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 text-accent">{children}</h3>,
            // Styling for tables (Financial data tables)
            table: ({ children }) => (
              <div className="overflow-x-auto my-4 rounded-md border border-border/50">
                <table className="min-w-full border-collapse">{children}</table>
              </div>
            ),
            thead: ({ children }) => <thead className="bg-muted/50 text-muted-foreground">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-border/30 last:border-0 hover:bg-muted/10 transition-colors">{children}</tr>,
            th: ({ children }) => <th className="border border-border/50 px-3 py-2 text-left font-semibold text-xs uppercase tracking-wider">{children}</th>,
            td: ({ children }) => <td className="border border-border/30 px-3 py-2 text-xs">{children}</td>,
            blockquote: ({ children }) => <blockquote className="border-l-2 border-accent pl-4 italic my-2">{children}</blockquote>,
            code: ({ children }) => <code className="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono text-accent-foreground">{children}</code>,
            pre: ({ children }) => <pre className="bg-muted/50 p-3 rounded-lg overflow-x-auto my-2 text-xs font-mono">{children}</pre>
          }}
        >
          {displayed}
        </ReactMarkdown>
        {showCaret && indexRef.current < text.length && (
          <span className={caretClassName} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}






// import React, { useEffect, useRef, useState } from "react";
// import ReactMarkdown from "react-markdown";
// import remarkGfm from "remark-gfm";

// export interface TypewriterTextProps {
//   text: string;
//   speedMs?: number;
//   startAutomatically?: boolean;
//   onComplete?: () => void;
//   showCaret?: boolean;
//   caretClassName?: string;
//   className?: string;
// }

// export default function TypewriterText({
//   text,
//   speedMs = 15,
//   startAutomatically = true,
//   onComplete,
//   showCaret = true,
//   caretClassName = "inline-block w-[0.35ch] bg-accent ml-1 align-middle animate-pulse h-[1em]",
//   className,
// }: TypewriterTextProps) {
//   const [displayed, setDisplayed] = useState<string>("");
//   const indexRef = useRef(0);
//   const intervalRef = useRef<NodeJS.Timeout | null>(null);
//   const lastTextRef = useRef("");

//   // Clean up on unmount
//   useEffect(() => {
//     return () => {
//       if (intervalRef.current) clearInterval(intervalRef.current);
//     };
//   }, []);

//   // --- SMART UPDATE LOGIC ---
//   useEffect(() => {
//     // If text hasn't changed, do nothing
//     if (text === lastTextRef.current) return;

//     if (text.startsWith(lastTextRef.current)) {
//       // STREAMING DETECTED: The new text is just the old text + new content.
//       // We update the ref, but we DO NOT reset the index or displayed text.
//       // This allows the interval to just keep typing the new characters.
//       lastTextRef.current = text;
//     } else {
//       // REPLACEMENT DETECTED: The text is completely different.
//       // Reset everything to start typing from scratch.
//       lastTextRef.current = text;
//       setDisplayed("");
//       indexRef.current = 0;
//       if (intervalRef.current) {
//         clearInterval(intervalRef.current);
//         intervalRef.current = null;
//       }
//     }

//     // Ensure the typing loop is running
//     startTyping();
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [text, startAutomatically]);

//   const startTyping = () => {
//     if (!startAutomatically) return;
//     if (intervalRef.current) return; // Already running

//     // Edge case: If already fully typed, just sync and finish
//     if (indexRef.current >= text.length) {
//       setDisplayed(text);
//       onComplete?.();
//       return;
//     }

//     intervalRef.current = setInterval(() => {
//       const currentLength = indexRef.current;
//       const targetLength = lastTextRef.current.length;

//       if (currentLength >= targetLength) {
//         // We caught up to the current stream buffer.
//         // Stop the interval to save resources, but don't finish yet if we expect more.
//         if (intervalRef.current) {
//           clearInterval(intervalRef.current);
//           intervalRef.current = null;
//         }
//         // Only fire completion if we really hit the end of the prop provided
//         if (currentLength >= text.length) {
//           onComplete?.();
//         }
//         return;
//       }

//       // Type the next character
//       indexRef.current = currentLength + 1;
//       setDisplayed(lastTextRef.current.slice(0, indexRef.current));
//     }, speedMs);
//   };

//   return (
//     <div className={className}>
//       <div className="prose prose-sm dark:prose-invert max-w-none break-words">
//         <ReactMarkdown
//           remarkPlugins={[remarkGfm]}
//           components={{
//             p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
//             ul: ({ children }) => <ul className="list-disc list-inside mb-2">{children}</ul>,
//             ol: ({ children }) => <ol className="list-decimal list-inside mb-2">{children}</ol>,
//             li: ({ children }) => <li className="mb-1">{children}</li>,
//             table: ({ children }) => <div className="overflow-x-auto my-4"><table className="min-w-full border-collapse border border-border/50">{children}</table></div>,
//             thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
//             tbody: ({ children }) => <tbody>{children}</tbody>,
//             tr: ({ children }) => <tr className="border-b border-border/30">{children}</tr>,
//             th: ({ children }) => <th className="border border-border/50 px-3 py-2 text-left font-semibold text-xs">{children}</th>,
//             td: ({ children }) => <td className="border border-border/30 px-3 py-2 text-xs">{children}</td>,
//           }}
//         >
//           {displayed}
//         </ReactMarkdown>
//         {showCaret && indexRef.current < text.length && (
//           <span className={caretClassName} aria-hidden="true" />
//         )}
//       </div>
//     </div>
//   );
// }