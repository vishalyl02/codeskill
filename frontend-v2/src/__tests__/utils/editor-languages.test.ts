import {
  canonicalEditorLanguage,
  editorLanguages,
  editorStarterCode,
  questionStarterCode,
} from "@/lib/editor-languages";
const options = [{ id: "javascript" }, { id: "python" }, { id: "cpp" }];
it("intersects problem permissions and enabled runtimes, including aliases", () => {
  expect(
    editorLanguages(
      options,
      ["python3", "c++"],
      [
        { language: "py", enabled: true },
        { language: "cpp", enabled: false },
        { language: "node", enabled: true },
      ],
    ),
  ).toEqual([{ id: "python" }]);
});
it("loads imported starter code using canonical language aliases", () => {
  expect(editorStarterCode({ python3: "print(input())" }, "python")).toBe("print(input())");
  expect(editorStarterCode({ "c++": "int main() {}" }, "cpp")).toBe("int main() {}");
  expect(editorStarterCode({ python3: [] }, "python")).toBeUndefined();
});
it("keeps unrestricted configurations working and returns no options for unsupported languages", () => {
  expect(editorLanguages(options, [])).toEqual(options);
  expect(editorLanguages(options, ["ruby"])).toEqual([]);
  expect(canonicalEditorLanguage("  JS ")).toBe("javascript");
});

describe("questionStarterCode", () => {
  it("resolves starter code from array with canonical alias matching", () => {
    const starterArray = [
      { language: "cpp", code: "// C++ Starter" },
      { language: "python3", code: "# Python Starter" },
    ];
    expect(questionStarterCode(starterArray, "cpp")).toBe("// C++ Starter");
    expect(questionStarterCode(starterArray, "python")).toBe("# Python Starter");
    expect(questionStarterCode(starterArray, "java")).toBeUndefined();
  });

  it("resolves starter code from object map with canonical alias matching", () => {
    const starterMap = {
      "c++": "// C++ Starter",
      python3: "# Python Starter",
      java: "// Java Starter",
    };
    expect(questionStarterCode(starterMap, "cpp")).toBe("// C++ Starter");
    expect(questionStarterCode(starterMap, "python")).toBe("# Python Starter");
    expect(questionStarterCode(starterMap, "java")).toBe("// Java Starter");
  });

  it("resolves starter code from raw string matching question language", () => {
    expect(questionStarterCode("print(1)", "python", "python3")).toBe("print(1)");
    expect(questionStarterCode("print(1)", "cpp", "python3")).toBeUndefined();
  });
});
