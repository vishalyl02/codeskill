"use client";

import { memo, useMemo, type ReactNode } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-java";
import "prismjs/components/prism-python";
import "prismjs/components/prism-go";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-json";

const aliases: Record<string, string> = {
  "c++": "cpp", "c#": "clike", js: "javascript", ts: "typescript",
  py: "python", python3: "python", golang: "go",
};
const bracketColors = ["#f9d66c", "#c4a7ff", "#66d9ef", "#f5a9c6", "#8fe3b0", "#ffba82"];

export const CodeSnippet = memo(function CodeSnippet({ code, language = "text" }: { code: string; language?: string }) {
  const highlighted = useMemo(() => {
    const key = language.toLowerCase().trim();
    const grammar = Prism.languages[aliases[key] || key];
    if (!grammar) return code;
    const stack: { character: string; color: string }[] = [];
    const closing: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
    let nextKey = 0;
    const render = (tokens: (string | Prism.Token)[]): ReactNode[] => tokens.map(token => {
      const id = nextKey++;
      if (typeof token === "string") return token;
      if (token.type === "punctuation" && typeof token.content === "string") {
        return Array.from(token.content).map(character => {
          let color: string | undefined;
          if (["(", "[", "{"].includes(character)) {
            color = bracketColors[stack.length % bracketColors.length];
            stack.push({ character, color });
          } else if (closing[character] && stack.at(-1)?.character === closing[character]) {
            color = stack.pop()?.color;
          }
          return <span key={nextKey++} className="token punctuation" style={color ? { color, fontWeight: 600 } : undefined}>{character}</span>;
        });
      }
      const content = typeof token.content === "string"
        ? token.content
        : render(Array.isArray(token.content) ? token.content : [token.content]);
      return <span key={id} className={`token ${token.type}`}>{content}</span>;
    });
    return render(Prism.tokenize(code, grammar));
  }, [code, language]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-[#111722] text-slate-200">
      <div className="border-b border-slate-700/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{language}</div>
      <pre tabIndex={0} aria-label="Question code snippet" className="assessment-scroll assessment-code flex max-h-[45vh] overflow-auto p-4 font-mono text-[13px] leading-6 whitespace-pre">
        <span aria-hidden="true" className="sticky left-0 mr-4 select-none bg-[#111722] pr-3 text-right text-slate-500">{code.split("\n").map((_, i) => i + 1).join("\n")}</span>
        <code>{highlighted}</code>
      </pre>
    </div>
  );
});
