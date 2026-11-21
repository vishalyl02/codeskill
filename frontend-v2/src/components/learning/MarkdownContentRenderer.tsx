"use client";

import React, { useMemo, useState } from "react";
import { marked, Token, Tokens } from "marked";
import Prism from "prismjs";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import { Check, Copy, Lightbulb, ExternalLink } from "lucide-react";

/**
 * Escapes raw HTML characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Highlights code using PrismJS with language fallback.
 */
function highlightCode(code: string, lang: string): string {
  const normalizedLang = (lang || "").toLowerCase().trim();
  const grammar =
    Prism.languages[normalizedLang] ||
    (normalizedLang === "c" || normalizedLang === "h" ? Prism.languages.c : null) ||
    (normalizedLang === "cpp" || normalizedLang === "c++" ? Prism.languages.cpp : null) ||
    (normalizedLang === "js" || normalizedLang === "javascript" ? Prism.languages.javascript : null) ||
    (normalizedLang === "ts" || normalizedLang === "typescript" ? Prism.languages.typescript : null) ||
    (normalizedLang === "py" || normalizedLang === "python" ? Prism.languages.python : null) ||
    (normalizedLang === "sh" || normalizedLang === "bash" || normalizedLang === "shell" ? Prism.languages.bash : null) ||
    (normalizedLang === "sql" ? Prism.languages.sql : null) ||
    (normalizedLang === "json" ? Prism.languages.json : null) ||
    Prism.languages.c; // Standardize on C for CodeSkill C certification

  if (grammar) {
    try {
      return Prism.highlight(code, grammar, normalizedLang || "c");
    } catch {
      return escapeHtml(code);
    }
  }
  return escapeHtml(code);
}

/**
 * Interactive Code Block with Prism Syntax Highlighting and Copy Button
 */
function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => highlightCode(code, language), [code, language]);

  const handleCopy = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="my-5 rounded-xl border border-border bg-card shadow-xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/60 text-xs text-muted-foreground font-mono">
        <span className="font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          {language || "c"}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-border text-foreground hover:bg-muted text-xs font-sans transition-colors cursor-pointer"
          title="Copy code snippet"
          aria-label="Copy code snippet"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500 font-medium text-[11px]">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[11px]">Copy Code</span>
            </>
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed assessment-scroll markdown-code bg-muted/20">
        <pre className="m-0 p-0 font-mono">
          <code
            dangerouslySetInnerHTML={{ __html: highlighted }}
            className={`language-${language || "c"}`}
          />
        </pre>
      </div>
    </div>
  );
}

/**
 * Render inline tokens (bold, italic, code, links, text)
 */
function renderInlineTokens(tokens?: Token[], keyPrefix = ""): React.ReactNode {
  if (!tokens || tokens.length === 0) return null;

  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-inline-${idx}`;

    switch (token.type) {
      case "strong": {
        const strongToken = token as Tokens.Strong;
        return (
          <strong key={key} className="font-bold text-foreground">
            {renderInlineTokens(strongToken.tokens, key)}
          </strong>
        );
      }
      case "em": {
        const emToken = token as Tokens.Em;
        return (
          <em key={key} className="italic text-foreground/95">
            {renderInlineTokens(emToken.tokens, key)}
          </em>
        );
      }
      case "codespan": {
        const codeToken = token as Tokens.Codespan;
        return (
          <code
            key={key}
            className="px-1.5 py-0.5 rounded-md bg-muted text-foreground font-mono text-xs border border-border font-semibold mx-0.5"
          >
            {codeToken.text}
          </code>
        );
      }
      case "del": {
        const delToken = token as Tokens.Del;
        return (
          <del key={key} className="line-through text-muted-foreground">
            {renderInlineTokens(delToken.tokens, key)}
          </del>
        );
      }
      case "link": {
        const linkToken = token as Tokens.Link;
        return (
          <a
            key={key}
            href={linkToken.href}
            title={linkToken.title || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline font-medium hover:text-primary/80 inline-flex items-center gap-0.5 transition-colors"
          >
            {renderInlineTokens(linkToken.tokens, key)}
            <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-70 ml-0.5" />
          </a>
        );
      }
      case "image": {
        const imgToken = token as Tokens.Image;
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={key}
            src={imgToken.href}
            alt={imgToken.text || "Lesson illustration"}
            title={imgToken.title || undefined}
            className="my-3 rounded-lg border border-border max-w-full h-auto shadow-xs"
          />
        );
      }
      case "br":
        return <br key={key} />;
      case "escape":
        return <React.Fragment key={key}>{(token as Tokens.Escape).text}</React.Fragment>;
      case "text": {
        const textToken = token as Tokens.Text;
        if (textToken.tokens && textToken.tokens.length > 0) {
          return (
            <React.Fragment key={key}>
              {renderInlineTokens(textToken.tokens, key)}
            </React.Fragment>
          );
        }
        return <React.Fragment key={key}>{textToken.text}</React.Fragment>;
      }
      default:
        return <React.Fragment key={key}>{(token as any).text || (token as any).raw}</React.Fragment>;
    }
  });
}

/**
 * Render top-level block tokens
 */
function renderBlockToken(token: Token, idx: number): React.ReactNode {
  const key = `block-${idx}-${token.type}`;

  switch (token.type) {
    case "heading": {
      const heading = token as Tokens.Heading;
      const content = renderInlineTokens(heading.tokens, key);
      switch (heading.depth) {
        case 1:
          return (
            <h1
              key={key}
              className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mt-8 mb-4 border-b border-border/60 pb-3"
            >
              {content}
            </h1>
          );
        case 2:
          return (
            <h2
              key={key}
              className="text-xl sm:text-2xl font-bold tracking-tight text-foreground mt-7 mb-3 border-b border-border/40 pb-2 flex items-center gap-2"
            >
              {content}
            </h2>
          );
        case 3:
          return (
            <h3
              key={key}
              className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-6 mb-2.5"
            >
              {content}
            </h3>
          );
        case 4:
          return (
            <h4
              key={key}
              className="text-base sm:text-lg font-semibold text-foreground mt-5 mb-2"
            >
              {content}
            </h4>
          );
        case 5:
        case 6:
        default:
          return (
            <h5
              key={key}
              className="text-sm sm:text-base font-semibold text-foreground mt-4 mb-1.5 uppercase tracking-wide text-muted-foreground"
            >
              {content}
            </h5>
          );
      }
    }

    case "paragraph": {
      const p = token as Tokens.Paragraph;
      return (
        <p
          key={key}
          className="my-3 text-xs sm:text-sm text-foreground/90 leading-relaxed font-normal"
        >
          {renderInlineTokens(p.tokens, key)}
        </p>
      );
    }

    case "code": {
      const codeToken = token as Tokens.Code;
      return (
        <CodeBlock
          key={key}
          code={codeToken.text}
          language={codeToken.lang || "c"}
        />
      );
    }

    case "list": {
      const listToken = token as Tokens.List;
      const Tag = listToken.ordered ? "ol" : "ul";
      return (
        <Tag
          key={key}
          className={`my-3.5 pl-6 space-y-1.5 text-xs sm:text-sm text-foreground leading-relaxed ${
            listToken.ordered ? "list-decimal" : "list-disc"
          }`}
          start={listToken.ordered && typeof listToken.start === "number" ? listToken.start : undefined}
        >
          {listToken.items.map((item, itemIdx) => {
            const itemKey = `${key}-item-${itemIdx}`;
            // If item has block tokens, render them recursively; else render inline tokens
            const hasBlockTokens = item.tokens && item.tokens.some((t) => t.type !== "text");
            return (
              <li key={itemKey} className="pl-1">
                {hasBlockTokens ? (
                  item.tokens.map((t, subIdx) => {
                    if (t.type === "text") {
                      const textToken = t as Tokens.Text;
                      return (
                        <span key={`${itemKey}-text-${subIdx}`}>
                          {textToken.tokens ? renderInlineTokens(textToken.tokens, itemKey) : textToken.text}
                        </span>
                      );
                    }
                    return renderBlockToken(t, subIdx);
                  })
                ) : (
                  <span>{item.text}</span>
                )}
              </li>
            );
          })}
        </Tag>
      );
    }

    case "table": {
      const tableToken = token as Tokens.Table;
      return (
        <div
          key={key}
          className="my-5 overflow-x-auto rounded-xl border border-border bg-card shadow-xs"
        >
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead className="bg-muted/70 border-b border-border">
              <tr>
                {tableToken.header.map((col, colIdx) => (
                  <th
                    key={`${key}-th-${colIdx}`}
                    style={{ textAlign: tableToken.align[colIdx] || "left" }}
                    className="px-4 py-3 font-bold text-foreground uppercase text-[11px] tracking-wider"
                  >
                    {renderInlineTokens(col.tokens, `${key}-th-${colIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tableToken.rows.map((row, rowIdx) => (
                <tr
                  key={`${key}-tr-${rowIdx}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={`${key}-td-${rowIdx}-${cellIdx}`}
                      style={{ textAlign: tableToken.align[cellIdx] || "left" }}
                      className="px-4 py-3 text-foreground font-mono text-xs"
                    >
                      {renderInlineTokens(cell.tokens, `${key}-td-${rowIdx}-${cellIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case "blockquote": {
      const quoteToken = token as Tokens.Blockquote;
      return (
        <blockquote
          key={key}
          className="my-4 border-l-4 border-primary bg-primary/5 dark:bg-primary/10 px-4 py-3 rounded-r-xl text-xs sm:text-sm text-foreground shadow-xs flex items-start gap-3"
        >
          <Lightbulb className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="leading-relaxed font-medium space-y-1.5 flex-1">
            {quoteToken.tokens.map((t, qIdx) => renderBlockToken(t, qIdx))}
          </div>
        </blockquote>
      );
    }

    case "hr":
      return <hr key={key} className="my-8 border-border" />;

    case "space":
      return null;

    default:
      return (
        <div key={key} className="my-2 text-xs sm:text-sm text-foreground leading-relaxed">
          {(token as any).raw || (token as any).text}
        </div>
      );
  }
}

/**
 * Universal High-Fidelity Markdown Content Renderer
 * Supports H1-H6, bold/italic/del/inline-code, Prism-highlighted code blocks with Copy button,
 * responsive tables, blockquotes, ordered/unordered/nested lists, and horizontal dividers.
 */
export function MarkdownContentRenderer({ content }: { content: string }) {
  const elements = useMemo(() => {
    if (!content || typeof content !== "string") return null;

    try {
      const tokens = marked.lexer(content);
      return tokens.map((token, idx) => renderBlockToken(token, idx));
    } catch (err) {
      console.error("Markdown parsing notice:", err);
      return <div className="text-xs sm:text-sm text-foreground whitespace-pre-wrap">{content}</div>;
    }
  }, [content]);

  if (!elements) return null;

  return <div className="space-y-1 text-foreground font-sans">{elements}</div>;
}

export default MarkdownContentRenderer;
