import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { CodeSnippet } from "@/components/assessment/CodeSnippet";

it("colors nested bracket pairs consistently without treating strings or comments as brackets", () => {
  const code = 'int main() {\n  // } ignored\n  const char* s = "}";\n  return (1 + 2);\n}';
  const { container } = render(<CodeSnippet code={code} language="cpp" />);
  expect(container.querySelector("code")?.textContent).toBe(code);
  expect(container.querySelector(".token.keyword")).not.toBeNull();
  expect(container.querySelector(".token.string")?.textContent).toBe('"}"');
  const braces = Array.from(container.querySelectorAll<HTMLElement>(".token.punctuation"));
  const opening = braces.find(node => node.textContent === "{")!;
  const closing = braces.find(node => node.textContent === "}")!;
  expect(opening.style.color).toBeTruthy();
  expect(closing.style.color).toBe(opening.style.color);
  const inner = braces.filter(node => node.textContent === "(").at(-1)!;
  expect(inner.style.color).not.toBe(opening.style.color);
  expect(screen.getByLabelText("Question code snippet")).toHaveAttribute("tabindex", "0");
});

it("preserves unknown languages and escapes HTML rather than interpreting it", () => {
  const code = '<script>alert("hello")</script>';
  const { container } = render(<CodeSnippet code={code} language="unknown" />);
  expect(container.querySelector("code")?.textContent).toBe(code);
  expect(container.querySelector("script")).toBeNull();
});
