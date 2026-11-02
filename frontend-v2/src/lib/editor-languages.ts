export function canonicalEditorLanguage(value: string): string {
  const language = value.trim().toLowerCase();
  return (
    (
      {
        "c++": "cpp",
        python3: "python",
        py: "python",
        js: "javascript",
        node: "javascript",
        ts: "typescript",
      } as Record<string, string>
    )[language] || language
  );
}

export function questionStarterCode(
  source: string | Array<{ language?: string; lang?: string; code?: string; sourceCode?: string; starterCode?: string }> | Record<string, unknown> | undefined,
  language: string,
  questionLanguage?: string,
): string | undefined {
  if (typeof source === "string") {
    return !questionLanguage || canonicalEditorLanguage(questionLanguage) === canonicalEditorLanguage(language)
      ? source
      : undefined;
  }
  if (Array.isArray(source)) {
    const entry = source.find((item: any) =>
      canonicalEditorLanguage(item.language || item.lang || "") === canonicalEditorLanguage(language)
    );
    return entry ? (entry.code ?? (entry as any).sourceCode ?? (entry as any).starterCode) : undefined;
  }
  const entry = Object.entries(source ?? {}).find(
    ([key]) => canonicalEditorLanguage(key) === canonicalEditorLanguage(language),
  );
  if (!entry) return undefined;
  const val = entry[1];
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    return (val as any).code ?? (val as any).sourceCode ?? (val as any).starterCode;
  }
  return undefined;
}

/** Imported Python templates use python3; Monaco uses python. */
export function editorStarterCode(value: Record<string, unknown> | undefined, language: string): string | undefined {
  const entry = Object.entries(value ?? {}).find(
    ([key, code]) => canonicalEditorLanguage(key) === canonicalEditorLanguage(language) && typeof code === "string",
  );
  return entry?.[1] as string | undefined;
}

export function editorLanguages<T extends { id: string }>(
  choices: T[],
  supported?: string[],
  runtimes: Array<{ language: string; enabled: boolean }> = [],
): T[] {
  return choices.filter(
    (choice) =>
      (!supported?.length ||
        supported.some(
          (value) => canonicalEditorLanguage(value) === choice.id,
        )) &&
      (!runtimes.length ||
        runtimes.some(
          (runtime) =>
            canonicalEditorLanguage(runtime.language) === choice.id &&
            runtime.enabled,
        )),
  );
}
