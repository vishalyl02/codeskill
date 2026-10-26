"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActivityTimer } from "@/hooks/useActivityTimer";
import { ModuleCompletionModal, CompletionCriteria } from "@/components/learning/ModuleCompletionModal";
import {
  ArrowLeft,
  CheckCircle2,
  BookOpen,
  Check,
  ChevronRight,
  Code2,
  Sparkles,
  HelpCircle,
  Play,
  RotateCcw,
  Zap,
  Lightbulb,
  Award,
  AlertCircle,
  FileText,
  Copy,
  ChevronLeft,
  X,
  Clock,
  Timer,
  Terminal,
  Eye,
  EyeOff,
  Layers,
  Send,
} from "lucide-react";
import Editor from "@monaco-editor/react";
import { learningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";

interface LessonData {
  id: string;
  title: string;
  slug: string;
  content: string;
  learningObjectives: string[];
  order: number;
  type: "reading" | "quiz" | "coding" | "debugging";
  isCompleted: boolean;
  completedAt?: string;
  timeSpentSeconds?: number;
  requiredTimeSeconds?: number;
  moduleId?: string;
  module?: {
    id: string;
    title: string;
    requiredTimeMinutes?: number;
    requiredTimeSeconds?: number;
  };
  nextLessonId?: string | null;
  exercises: Array<{
    id: string;
    title: string;
    type: "coding" | "quiz" | "debugging";
    starterCode?: Record<string, string>;
    hints: string[];
    marks: number;
    quizConfig?: {
      questions: Array<{
        id: string;
        question: string;
        options: string[];
      }>;
    };
  }>;
}

interface CourseSidebarData {
  id: string;
  title: string;
  slug: string;
  modules: Array<{
    id: string;
    title: string;
    requiredTimeMinutes?: number;
    requiredTimeSeconds?: number;
    lessons: Array<{
      id: string;
      title: string;
      slug: string;
      type: string;
      isCompleted: boolean;
    }>;
  }>;
}

// Professional Markdown Content Renderer with high-contrast Light & Dark typography
function RichContentRenderer({ content }: { content: string }) {
  const renderedSections = useMemo(() => {
    if (!content) return [];
    const lines = content.split("\n");
    const sections: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = "";
    let codeLines: string[] = [];
    let tableLines: string[] = [];

    const flushTable = (key: string) => {
      if (tableLines.length === 0) return;
      const rows = tableLines.map((l) =>
        l
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      );
      if (rows.length >= 2) {
        const headers = rows[0];
        const dataRows = rows.slice(2);
        sections.push(
          <div
            key={key}
            className="my-5 overflow-x-auto border border-border rounded-xl bg-card shadow-xs"
          >
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead className="bg-muted/70 border-b border-border">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={hIdx}
                      className="px-4 py-3 font-bold text-foreground"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dataRows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-muted/40 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-4 py-3 text-foreground font-mono text-xs"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableLines = [];
    };

    lines.forEach((line, idx) => {
      // Code block start / end
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          const codeSnippet = codeLines.join("\n");
          sections.push(
            <div
              key={`code-${idx}`}
              className="my-5 rounded-xl border border-border bg-muted/60 p-4 font-mono text-xs overflow-x-auto text-foreground shadow-xs relative group"
            >
              {codeLanguage && (
                <span className="absolute top-2.5 right-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-background/80 px-2 py-0.5 rounded border border-border">
                  {codeLanguage}
                </span>
              )}
              <pre className="text-foreground">
                <code>{codeSnippet}</code>
              </pre>
            </div>
          );
          codeLines = [];
          codeLanguage = "";
          inCodeBlock = false;
        } else {
          flushTable(`table-before-code-${idx}`);
          inCodeBlock = true;
          codeLanguage = line.trim().replace(/^```/, "").trim();
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      // Table line
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        tableLines.push(line.trim());
        return;
      } else {
        flushTable(`table-${idx}`);
      }

      // Headers
      if (line.startsWith("### ")) {
        sections.push(
          <h3
            key={`h3-${idx}`}
            className="text-lg sm:text-xl font-bold tracking-tight text-foreground mt-7 mb-3"
          >
            {line.replace(/^### /, "")}
          </h3>
        );
      } else if (line.startsWith("#### ")) {
        sections.push(
          <h4
            key={`h4-${idx}`}
            className="text-base font-semibold text-foreground mt-5 mb-2"
          >
            {line.replace(/^#### /, "")}
          </h4>
        );
      } else if (line.startsWith("> ")) {
        // Blockquote callout
        sections.push(
          <div
            key={`quote-${idx}`}
            className="my-4 border-l-4 border-primary bg-primary/5 p-4 rounded-r-xl text-xs sm:text-sm text-foreground flex items-start gap-3 shadow-xs"
          >
            <Lightbulb className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">
              {line.replace(/^> /, "").replace(/\*\*(.*?)\*\*/g, "$1")}
            </div>
          </div>
        );
      } else if (line.trim().startsWith("- ")) {
        // Bullet list item
        sections.push(
          <div
            key={`li-${idx}`}
            className="flex items-start gap-2.5 my-1.5 text-xs sm:text-sm text-foreground"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
            <span className="leading-relaxed">
              {line.trim().replace(/^- /, "")}
            </span>
          </div>
        );
      } else if (line.trim().length > 0) {
        sections.push(
          <p
            key={`p-${idx}`}
            className="my-2.5 text-xs sm:text-sm text-foreground leading-relaxed font-normal"
          >
            {line}
          </p>
        );
      }
    });

    flushTable("table-end");
    return sections;
  }, [content]);

  return <div className="space-y-1">{renderedSections}</div>;
}

interface W3BlankItem {
  id: string;
  answer: string;
  placeholder?: string;
  caseSensitive?: boolean;
}

interface W3ExerciseItem {
  id: string;
  title: string;
  instruction: string;
  language: string;
  codeTemplate: string;
  blanks: W3BlankItem[];
  hint?: string;
  explanation: string;
}

const W3_EXERCISES_DATABASE: Record<string, W3ExerciseItem[]> = {
  dbms: [
    {
      id: "w3-sql-1",
      title: "SQL SELECT All Statement",
      instruction: "Insert the missing keyword to select all columns from the 'Customers' table.",
      language: "sql",
      codeTemplate: "[b1] * FROM Customers;",
      blanks: [{ id: "b1", answer: "SELECT", placeholder: "keyword", caseSensitive: false }],
      hint: "The command starts with the standard query retrieval keyword.",
      explanation: "The SELECT statement is used to query and extract records from a database table."
    },
    {
      id: "w3-sql-2",
      title: "SQL Filter with WHERE",
      instruction: "Complete the SQL statement to select all records where the City column equals 'Berlin'.",
      language: "sql",
      codeTemplate: "SELECT * FROM Customers\n[b1] City = 'Berlin';",
      blanks: [{ id: "b1", answer: "WHERE", placeholder: "clause", caseSensitive: false }],
      hint: "Use the conditional filtering clause.",
      explanation: "The WHERE clause filters records based on specified predicate conditions."
    },
    {
      id: "w3-sql-3",
      title: "SQL Sorting with ORDER BY",
      instruction: "Complete the query to sort records alphabetically by City in descending order.",
      language: "sql",
      codeTemplate: "SELECT * FROM Customers\nORDER BY City [b1];",
      blanks: [{ id: "b1", answer: "DESC", placeholder: "direction", caseSensitive: false }],
      hint: "Opposite of ASC.",
      explanation: "DESC specifies descending order (Z to A, or largest to smallest numbers)."
    },
    {
      id: "w3-sql-4",
      title: "SQL Relational INNER JOIN",
      instruction: "Complete the join statement linking Orders and Customers on the CustomerID column.",
      language: "sql",
      codeTemplate: "SELECT Orders.OrderID, Customers.CustomerName\nFROM Orders\n[b1] JOIN Customers\nON Orders.CustomerID = Customers.[b2];",
      blanks: [
        { id: "b1", answer: "INNER", placeholder: "join type", caseSensitive: false },
        { id: "b2", answer: "CustomerID", placeholder: "key column", caseSensitive: false }
      ],
      hint: "Default relational join type that matches foreign and primary keys.",
      explanation: "INNER JOIN selects records that have matching keys in both participating tables."
    },
    {
      id: "w3-sql-5",
      title: "SQL PRIMARY KEY Constraint",
      instruction: "Insert the constraint keyword to declare the 'ID' column as the unique primary key.",
      language: "sql",
      codeTemplate: "CREATE TABLE Students (\n  ID int NOT NULL,\n  FullName varchar(255) NOT NULL,\n  [b1] KEY (ID)\n);",
      blanks: [{ id: "b1", answer: "PRIMARY", placeholder: "constraint", caseSensitive: false }],
      hint: "The foundational entity integrity key.",
      explanation: "PRIMARY KEY uniquely identifies each table row and prevents NULLs or duplicate values."
    }
  ],
  java: [
    {
      id: "w3-java-1",
      title: "Java Console Output",
      instruction: "Insert the missing method to print 'Hello World' followed by a newline.",
      language: "java",
      codeTemplate: "public class Main {\n  public static void main(String[] args) {\n    System.out.[b1](\"Hello World\");\n  }\n}",
      blanks: [{ id: "b1", answer: "println", placeholder: "method", caseSensitive: true }],
      hint: "Standard output print line method.",
      explanation: "System.out.println() prints the text argument to standard out followed by a newline."
    },
    {
      id: "w3-java-2",
      title: "Java Variables & Data Types",
      instruction: "Declare an integer variable named 'score' and assign the value 95 to it.",
      language: "java",
      codeTemplate: "[b1] score = [b2];",
      blanks: [
        { id: "b1", answer: "int", placeholder: "type", caseSensitive: true },
        { id: "b2", answer: "95", placeholder: "value", caseSensitive: true }
      ],
      hint: "32-bit primitive integer keyword.",
      explanation: "In Java, 'int' is the standard primitive type used to store integer numbers."
    },
    {
      id: "w3-java-3",
      title: "Java OOP Inheritance",
      instruction: "Use the correct keyword to make the 'Car' class inherit from the 'Vehicle' class.",
      language: "java",
      codeTemplate: "class Vehicle {\n  protected String brand = \"Ford\";\n}\n\nclass Car [b1] Vehicle {\n  private String model = \"Mustang\";\n}",
      blanks: [{ id: "b1", answer: "extends", placeholder: "keyword", caseSensitive: true }],
      hint: "Class inheritance keyword.",
      explanation: "In Java, 'extends' allows a subclass to inherit attributes and methods from a superclass."
    },
    {
      id: "w3-java-4",
      title: "Java Interface Implementation",
      instruction: "Complete the class definition to implement the 'Printable' interface.",
      language: "java",
      codeTemplate: "interface Printable {\n  void printDocument();\n}\n\nclass Document [b1] Printable {\n  public void printDocument() {\n    System.out.println(\"Printing...\");\n  }\n}",
      blanks: [{ id: "b1", answer: "implements", placeholder: "keyword", caseSensitive: true }],
      hint: "Keyword used to sign an interface contract.",
      explanation: "Classes use 'implements' to satisfy and execute methods declared in an interface."
    },
    {
      id: "w3-java-5",
      title: "Java Generic Collections",
      instruction: "Instantiate a generic ArrayList holding String elements.",
      language: "java",
      codeTemplate: "ArrayList<[b1]> list = new ArrayList<[b2]>();",
      blanks: [
        { id: "b1", answer: "String", placeholder: "type", caseSensitive: true },
        { id: "b2", answer: "String", placeholder: "type", caseSensitive: true }
      ],
      hint: "The Java String class wrapper.",
      explanation: "Generics enforce compile-time type-safety for Java collection hierarchies."
    }
  ],
  os: [
    {
      id: "w3-os-1",
      title: "Unix Process Creation",
      instruction: "Insert the system call used to duplicate the current process and create a child.",
      language: "c",
      codeTemplate: "pid_t pid = [b1]();\nif (pid == 0) {\n  printf(\"Child process running\\n\");\n}",
      blanks: [{ id: "b1", answer: "fork", placeholder: "syscall", caseSensitive: true }],
      hint: "Standard POSIX process creation call.",
      explanation: "fork() creates a new child process with an isolated copy of the parent address space."
    },
    {
      id: "w3-os-2",
      title: "Operating System Mode Switch",
      instruction: "Fill in the CPU privilege modes: System calls switch execution from User Mode to Kernel Mode.",
      language: "text",
      codeTemplate: "CPU Hardware Mode Bit:\nNormal Application Execution: [b1] Mode\nOS Privileged System Call: [b2] Mode",
      blanks: [
        { id: "b1", answer: "User", placeholder: "mode", caseSensitive: false },
        { id: "b2", answer: "Kernel", placeholder: "mode", caseSensitive: false }
      ],
      hint: "Unprivileged user space vs privileged ring 0.",
      explanation: "User Mode protects physical hardware; Kernel Mode provides full system resource control to the OS."
    },
    {
      id: "w3-os-3",
      title: "Banker Algorithm Resource Need",
      instruction: "Complete the formula for the Need matrix in Dijkstra's Banker Algorithm.",
      language: "text",
      codeTemplate: "Need[i][j] = Max[i][j] [b1] Allocation[i][j];",
      blanks: [{ id: "b1", answer: "-", placeholder: "op", caseSensitive: true }],
      hint: "Subtraction operator.",
      explanation: "The Need matrix represents remaining resources: Need = Max - Allocation."
    },
    {
      id: "w3-os-4",
      title: "POSIX Semaphore Synchronization",
      instruction: "Fill in the semaphore operation to wait/decrement before entering a critical section.",
      language: "c",
      codeTemplate: "sem_[b1](&mutex); // Decrement and lock\n// Critical Section\nsem_[b2](&mutex); // Increment and release",
      blanks: [
        { id: "b1", answer: "wait", placeholder: "op", caseSensitive: true },
        { id: "b2", answer: "post", placeholder: "op", caseSensitive: true }
      ],
      hint: "wait and post operations.",
      explanation: "sem_wait() decrements the semaphore (blocks if zero); sem_post() increments and wakes waiters."
    }
  ],
  cf: [
    {
      id: "w3-cf-1",
      title: "Two's Complement Arithmetic",
      instruction: "Convert +1 (00000001) to -1: Invert all bits (11111110), then add what number?",
      language: "text",
      codeTemplate: "Step 1: +1 = 00000001\nStep 2: Invert bits = 11111110\nStep 3: Add [b1] = 11111111 (-1 in Two's Complement)",
      blanks: [{ id: "b1", answer: "1", placeholder: "number", caseSensitive: true }],
      hint: "Binary one.",
      explanation: "Two's complement is formed by taking 1's complement (inverting bits) and adding 1."
    },
    {
      id: "w3-cf-2",
      title: "Universal Logic Gates",
      instruction: "Identify the universal logic gate whose output is 0 ONLY when both inputs are 1.",
      language: "text",
      codeTemplate: "// Universal logic gate: (1, 1) -> 0, (0, 0) -> 1, (0, 1) -> 1\nconst gate = \"[b1]\";",
      blanks: [{ id: "b1", answer: "NAND", placeholder: "gate", caseSensitive: false }],
      hint: "NOT AND.",
      explanation: "NAND is a universal gate capable of synthesizing any arbitrary boolean circuit."
    },
    {
      id: "w3-cf-3",
      title: "OSI Transport Protocol",
      instruction: "Which Transport Layer protocol guarantees in-order delivery using a 3-Way Handshake?",
      language: "text",
      codeTemplate: "// Reliable Connection-Oriented Protocol:\nconst protocol = \"[b1]\";",
      blanks: [{ id: "b1", answer: "TCP", placeholder: "protocol", caseSensitive: false }],
      hint: "Transmission Control Protocol.",
      explanation: "TCP provides connection-oriented, sequenced, error-checked packet streaming."
    }
  ],
  ai: [
    {
      id: "w3-ai-1",
      title: "Zero-Shot Chain of Thought",
      instruction: "Insert the directive that prompts Large Language Models to reason step by step.",
      language: "text",
      codeTemplate: "\"\"\"\nQuestion: If 3 workers take 6 days to paint a house, how many days will 6 workers take?\nLet's think [b1] by [b2]:\n\"\"\"",
      blanks: [
        { id: "b1", answer: "step", placeholder: "word", caseSensitive: false },
        { id: "b2", answer: "step", placeholder: "word", caseSensitive: false }
      ],
      hint: "think step by...",
      explanation: "'Let's think step by step:' causes autoregressive transformers to compute intermediate reasoning tokens."
    },
    {
      id: "w3-ai-2",
      title: "Prompt Delimiters",
      instruction: "Close the XML delimiter tag to isolate untrusted user data from system instructions.",
      language: "python",
      codeTemplate: "prompt = f\"\"\"\nSummarize the text found inside <user_input> tags.\n<user_input>\n{untrusted_data}\n[b1]\n\"\"\"",
      blanks: [{ id: "b1", answer: "</user_input>", placeholder: "closing tag", caseSensitive: false }],
      hint: "Standard XML closing tag.",
      explanation: "XML tags clearly delineate untrusted input to defend against prompt injection attacks."
    },
    {
      id: "w3-ai-3",
      title: "LLM Determinism Temperature",
      instruction: "Set the sampling temperature parameter to maximum determinism (zero randomness) for structured JSON output.",
      language: "python",
      codeTemplate: "response = client.chat.completions.create(\n  model=\"gpt-4o\",\n  messages=messages,\n  temperature=[b1]\n)",
      blanks: [{ id: "b1", answer: "0", placeholder: "float", caseSensitive: true }],
      hint: "Zero temperature.",
      explanation: "temperature: 0.0 forces argmax greedy token sampling for deterministic and consistent formatting."
    }
  ]
};

function getW3ExercisesForCourse(courseSlug: string, pathSlug: string): W3ExerciseItem[] {
  const slug = `${courseSlug || ""} ${pathSlug || ""}`.toLowerCase();
  if (slug.includes("dbms") || slug.includes("database") || slug.includes("sql")) {
    return W3_EXERCISES_DATABASE.dbms;
  }
  if (slug.includes("java")) {
    return W3_EXERCISES_DATABASE.java;
  }
  if (slug.includes("os") || slug.includes("operating-systems")) {
    return W3_EXERCISES_DATABASE.os;
  }
  if (slug.includes("cf") || slug.includes("computer-fundamentals") || slug.includes("architecture")) {
    return W3_EXERCISES_DATABASE.cf;
  }
  if (slug.includes("ai") || slug.includes("prompt") || slug.includes("genai")) {
    return W3_EXERCISES_DATABASE.ai;
  }
  return W3_EXERCISES_DATABASE.dbms;
}

const DEFAULT_STARTER_CODES: Record<string, string> = {
  javascript: `// CodeSkill Real-Time JavaScript Sandbox
console.log("Hello from CodeSkill Real-Time Sandbox!");

function calculate(x, y) {
  return x * y + 42;
}

console.log("Result:", calculate(10, 5));
`,
  python: `# CodeSkill Real-Time Python 3 Runner
def calculate(a, b):
    return a * b + 42

print("Hello from CodeSkill Python 3!")
print("Result:", calculate(10, 5))
`,
  java: `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from CodeSkill Java 21!");
        int result = calculate(10, 5);
        System.out.println("Result: " + result);
    }

    public static int calculate(int a, int b) {
        return a * b + 42;
    }
}
`,
  cpp: `#include <iostream>
using namespace std;

int calculate(int a, int b) {
    return a * b + 42;
}

int main() {
    cout << "Hello from CodeSkill C++ 20!" << endl;
    cout << "Result: " << calculate(10, 5) << endl;
    return 0;
}
`,
};

export default function CourseWorkspacePage({
  params,
}: {
  params: Promise<{ pathSlug: string; courseSlug: string }>;
}) {
  const { pathSlug, courseSlug } = use(params);
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [course, setCourse] = useState<CourseSidebarData | null>(null);
  const [pathTitle, setPathTitle] = useState<string>("");
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Modal Dialog popup state (Replaces ancient window.alert())
  const [popupModal, setPopupModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type?: "warning" | "success" | "info";
  } | null>(null);

  // Exercise & Quiz states
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [quizResults, setQuizResults] = useState<any>(null);
  const [code, setCode] = useState<string>("");
  const [language, setLanguage] = useState<string>("javascript");
  const [executionFeedback, setExecutionFeedback] = useState<any>(null);
  const [submittingExercise, setSubmittingExercise] = useState(false);
  const [xpCelebration, setXpCelebration] = useState<number | null>(null);

  // Real-Time Compiler Terminal state
  const [terminalLogs, setTerminalLogs] = useState<
    Array<{ type: "stdout" | "stderr" | "system" | "return"; text: string; time: string }>
  >([
    {
      type: "system",
      text: "> CodeSkill Live Compiler Ready. Select a language and click 'Run Code'.",
      time: "--:--:--",
    },
  ]);
  const [terminalTab, setTerminalTab] = useState<"output" | "tests">("output");
  const [isExecutingRealtime, setIsExecutingRealtime] = useState(false);

  // Chandigarh University Practice Exercises state
  const [w3Index, setW3Index] = useState<number>(0);
  const [w3BlankValues, setW3BlankValues] = useState<Record<string, Record<string, string>>>({});
  const [w3Feedback, setW3Feedback] = useState<
    Record<string, { isCorrect: boolean; showAnswer: boolean; message?: string }>
  >({});
  const [w3ShowAnswer, setW3ShowAnswer] = useState<Record<string, boolean>>({});
  const [activeTabMode, setActiveTabMode] = useState<"content" | "coding" | "w3" | "quiz">("coding");

  // Completion Reason Modal State
  const [completionModal, setCompletionModal] = useState<{
    isOpen: boolean;
    title?: string;
    reasons: string[];
    criteria?: CompletionCriteria;
  }>({
    isOpen: false,
    reasons: [],
  });

  // Stopwatch & Minimum Time Spent Tracker
  const [requiredTime, setRequiredTime] = useState<number>(30); // 30s standardized default
  const [initialSpent, setInitialSpent] = useState<number>(0);
  const [celebrationGlow, setCelebrationGlow] = useState<boolean>(false);
  const activeExecutionIdRef = useRef<string | null>(null);

  // High-precision, drift-free timer
  const activityTimer = useActivityTimer({
    id: activeLessonId || undefined,
    durationSeconds: requiredTime,
    initialTimeSpent: initialSpent,
    mode: "stopwatch",
    checkpointIntervalSeconds: 15,
    onCheckpoint: async (spent) => {
      if (activeLessonId) {
        await learningAPI.trackTimeSpent(activeLessonId, spent).catch(() => {});
      }
    },
  });

  const timeSpent = activityTimer.timeSpentSeconds;

  // Trigger celebration glow when requirement is reached
  useEffect(() => {
    if (activityTimer.hasMetRequirement && requiredTime > 0) {
      setCelebrationGlow(true);
      const timer = setTimeout(() => setCelebrationGlow(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [activityTimer.hasMetRequirement, requiredTime]);

  useEffect(() => {
    loadCourse();
  }, [pathSlug, courseSlug]);

  useEffect(() => {
    if (activeLessonId) {
      loadLesson(activeLessonId);
    }
  }, [activeLessonId]);

  const loadCourse = async () => {
    try {
      setLoading(true);
      const pathRes = await learningAPI.getPathBySlug(pathSlug);
      const pathData = pathRes.data?.data || pathRes.data;
      setPathTitle(pathData?.title || "Learning Path");

      const foundCourse = (pathData?.courses || []).find(
        (c: any) => c.slug === courseSlug,
      );
      if (!foundCourse) return;

      const courseRes = await learningAPI.getCourse(foundCourse.id);
      const courseData = courseRes.data?.data || courseRes.data;
      setCourse(courseData);

      const firstLesson = courseData?.modules?.[0]?.lessons?.[0];
      if (firstLesson) {
        setActiveLessonId(firstLesson.id);
      }
    } catch (err) {
      console.error("Failed to load course workspace", err);
    } finally {
      setLoading(false);
    }
  };

  const loadLesson = async (id: string) => {
    try {
      setLessonLoading(true);
      setQuizResults(null);
      setExecutionFeedback(null);
      setXpCelebration(null);
      setSelectedAnswers({});
      const res = await learningAPI.getLesson(id);
      const lessonData = res.data?.data || res.data;
      setLesson(lessonData);

      // Initialize live stopwatch tracking
      const initialTime = lessonData?.timeSpentSeconds || 0;
      const targetTime =
        lessonData?.module?.requiredTimeSeconds ||
        lessonData?.requiredTimeSeconds ||
        30;
      setInitialSpent(initialTime);
      setRequiredTime(targetTime);
      activityTimer.reset(targetTime, initialTime);

      const codingEx = lessonData?.exercises?.find(
        (e: any) => e.type === "coding" || e.type === "debugging",
      );
      if (codingEx?.starterCode?.[language]) {
        setCode(codingEx.starterCode[language]);
      } else if (codingEx?.starterCode?.java && !codingEx?.starterCode?.[language]) {
        setLanguage("java");
        setCode(codingEx.starterCode.java);
      } else if (codingEx?.starterCode?.python && !codingEx?.starterCode?.[language]) {
        setLanguage("python");
        setCode(codingEx.starterCode.python);
      } else if (codingEx?.starterCode?.javascript) {
        setLanguage("javascript");
        setCode(codingEx.starterCode.javascript);
      } else if (codingEx?.starterCode) {
        const availableLang = Object.keys(codingEx.starterCode)[0];
        if (availableLang) {
          setLanguage(availableLang);
          setCode(codingEx.starterCode[availableLang]);
        } else {
          setCode(DEFAULT_STARTER_CODES[language] || "// Write your solution below\n");
        }
      } else {
        setCode(DEFAULT_STARTER_CODES[language] || "// Write your solution below\n");
      }
    } catch (err) {
      console.error("Failed to load lesson content", err);
    } finally {
      setLessonLoading(false);
    }
  };

  const handleQuizSubmit = async (exerciseId: string) => {
    try {
      setSubmittingExercise(true);
      const res = await learningAPI.submitExercise(exerciseId, {
        answers: selectedAnswers,
      });
      const submissionData = res.data?.data || res.data;
      setQuizResults(submissionData?.feedback || submissionData);
      if (submissionData?.xpAwarded > 0) {
        setXpCelebration(submissionData.xpAwarded);
      }
      if (submissionData?.passed) {
        loadLesson(activeLessonId!);
        loadCourse();
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        "Quiz evaluation failed. Please make sure you selected an option.";
      setPopupModal({
        isOpen: true,
        title: "Submission Notice",
        message: Array.isArray(errorMsg) ? errorMsg.join(", ") : errorMsg,
        type: "warning",
      });
    } finally {
      setSubmittingExercise(false);
    }
  };

  const handleCodeSubmit = async (exerciseId: string) => {
    try {
      setSubmittingExercise(true);
      const res = await learningAPI.submitExercise(exerciseId, {
        code,
        language,
      });
      const submissionData = res.data?.data || res.data;
      setExecutionFeedback(submissionData?.feedback || submissionData);
      if (submissionData?.xpAwarded > 0) {
        setXpCelebration(submissionData.xpAwarded);
      }
      if (submissionData?.passed) {
        loadLesson(activeLessonId!);
        loadCourse();
      }
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.message ||
        "Code execution failed. Please check your syntax and run again.";
      setPopupModal({
        isOpen: true,
        title: "Execution Error",
        message: Array.isArray(errorMsg) ? errorMsg.join(", ") : errorMsg,
        type: "warning",
      });
    } finally {
      setSubmittingExercise(false);
    }
  };

  // Run Code in Real-Time (instant sandbox execution with output terminal)
  const handleRunCodeRealtime = async () => {
    const executionId = crypto.randomUUID();
    activeExecutionIdRef.current = executionId;
    setIsExecutingRealtime(true);
    setTerminalTab("output");
    const startTime = performance.now();
    const timestamp = new Date().toLocaleTimeString();
    const newLogs: Array<{
      type: "stdout" | "stderr" | "system" | "return";
      text: string;
      time: string;
    }> = [
      {
        type: "system",
        text: `> [Run ID: ${executionId.slice(0, 8)}] Compiling & Executing ${language.toUpperCase()} in live sandbox...`,
        time: timestamp,
      },
    ];
    setTerminalLogs(newLogs);

    if (language === "javascript") {
      try {
        const capturedLogs: string[] = [];
        const sandboxConsole = {
          log: (...args: any[]) =>
            capturedLogs.push(
              args
                .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
                .join(" ")
            ),
          info: (...args: any[]) =>
            capturedLogs.push(
              "[INFO] " +
                args
                  .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
                  .join(" ")
            ),
          warn: (...args: any[]) =>
            capturedLogs.push(
              "[WARN] " +
                args
                  .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
                  .join(" ")
            ),
          error: (...args: any[]) =>
            capturedLogs.push(
              "[ERROR] " +
                args
                  .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
                  .join(" ")
            ),
        };

        const executor = new Function("console", code);
        const returned = executor(sandboxConsole);
        const elapsed = Math.round(performance.now() - startTime);

        if (activeExecutionIdRef.current !== executionId) return;

        if (capturedLogs.length > 0) {
          capturedLogs.forEach((msg) => {
            newLogs.push({ type: "stdout", text: msg, time: new Date().toLocaleTimeString() });
          });
        } else if (returned === undefined) {
          newLogs.push({
            type: "stdout",
            text: "(Program executed with no console output. Use console.log() to print values)",
            time: new Date().toLocaleTimeString(),
          });
        }

        if (returned !== undefined) {
          newLogs.push({
            type: "return",
            text: `[Return Value]: ${
              typeof returned === "object" ? JSON.stringify(returned, null, 2) : String(returned)
            }`,
            time: new Date().toLocaleTimeString(),
          });
        }

        newLogs.push({
          type: "system",
          text: `✓ Execution finished successfully in ${elapsed}ms (Exit Code: 0)`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs(newLogs);
      } catch (err: any) {
        if (activeExecutionIdRef.current !== executionId) return;
        const elapsed = Math.round(performance.now() - startTime);
        newLogs.push({
          type: "stderr",
          text: `${err?.name || "Runtime Error"}: ${err?.message || String(err)}`,
          time: new Date().toLocaleTimeString(),
        });
        newLogs.push({
          type: "system",
          text: `✗ Execution failed with error in ${elapsed}ms`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs(newLogs);
      } finally {
        if (activeExecutionIdRef.current === executionId) {
          setIsExecutingRealtime(false);
        }
      }
    } else {
      // Server-side real-time execution runner for Python/Java/C++
      try {
        const res = await learningAPI.runPlayground({ code, language });
        if (activeExecutionIdRef.current !== executionId) return;
        const resultData = (res.data as any)?.data || res.data;
        const elapsed = resultData?.durationMs ?? Math.round(performance.now() - startTime);

        if (resultData?.output) {
          const lines = String(resultData.output).split("\n");
          lines.forEach((l: string) => {
            if (l.trim().length > 0) {
              newLogs.push({
                type: "stdout",
                text: l,
                time: new Date().toLocaleTimeString(),
              });
            }
          });
        }
        if (resultData?.error) {
          const lines = String(resultData.error).split("\n");
          lines.forEach((l: string) => {
            if (l.trim().length > 0) {
              newLogs.push({
                type: "stderr",
                text: l,
                time: new Date().toLocaleTimeString(),
              });
            }
          });
        }
        if (!resultData?.output && !resultData?.error) {
          newLogs.push({
            type: "stdout",
            text: "(Program executed successfully with no console output)",
            time: new Date().toLocaleTimeString(),
          });
        }

        newLogs.push({
          type: "system",
          text: `✓ Execution completed in ${elapsed}ms (Status: ${resultData?.status || "SUCCESS"})`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs(newLogs);
      } catch (err: any) {
        if (activeExecutionIdRef.current !== executionId) return;
        const elapsed = Math.round(performance.now() - startTime);
        newLogs.push({
          type: "stderr",
          text: `Execution notice: ${
            err?.response?.data?.message || err?.message || "Execution completed"
          }`,
          time: new Date().toLocaleTimeString(),
        });
        newLogs.push({
          type: "system",
          text: `✓ Finished with response in ${elapsed}ms`,
          time: new Date().toLocaleTimeString(),
        });
        setTerminalLogs(newLogs);
      } finally {
        if (activeExecutionIdRef.current === executionId) {
          setIsExecutingRealtime(false);
        }
      }
    }
  };

  // Chandigarh University Fill in the Blank answer evaluation
  const handleCheckW3Blank = (exercise: W3ExerciseItem) => {
    const userAnswers = w3BlankValues[exercise.id] || {};
    let allCorrect = true;

    for (const blank of exercise.blanks) {
      const typed = (userAnswers[blank.id] || "").trim();
      const expected = blank.answer.trim();
      const match =
        blank.caseSensitive !== true
          ? typed.toLowerCase() === expected.toLowerCase()
          : typed === expected;

      if (!match) {
        allCorrect = false;
        break;
      }
    }

    setW3Feedback({
      ...w3Feedback,
      [exercise.id]: {
        isCorrect: allCorrect,
        showAnswer: false,
        message: allCorrect
          ? "✓ Correct! Excellent work."
          : "✗ Not quite correct. Review your syntax or check the hint!",
      },
    });

    if (allCorrect) {
      setXpCelebration(10);
    }
  };

  const handleToggleW3Answer = (exercise: W3ExerciseItem) => {
    const isCurrentlyShowing = w3ShowAnswer[exercise.id] || false;
    const nextShowing = !isCurrentlyShowing;
    setW3ShowAnswer({
      ...w3ShowAnswer,
      [exercise.id]: nextShowing,
    });

    if (nextShowing) {
      const currentFilled = { ...(w3BlankValues[exercise.id] || {}) };
      exercise.blanks.forEach((b) => {
        currentFilled[b.id] = b.answer;
      });
      setW3BlankValues({
        ...w3BlankValues,
        [exercise.id]: currentFilled,
      });
      setW3Feedback({
        ...w3Feedback,
        [exercise.id]: {
          isCorrect: true,
          showAnswer: true,
          message: "💡 Answer revealed! Study the correct syntax and try again.",
        },
      });
    }
  };

  const handleResetW3 = (exerciseId: string) => {
    const updatedValues = { ...w3BlankValues };
    delete updatedValues[exerciseId];
    setW3BlankValues(updatedValues);

    const updatedFeedback = { ...w3Feedback };
    delete updatedFeedback[exerciseId];
    setW3Feedback(updatedFeedback);

    const updatedShow = { ...w3ShowAnswer };
    delete updatedShow[exerciseId];
    setW3ShowAnswer(updatedShow);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const hasMetTimeRequirement = timeSpent >= requiredTime;
  const remainingSeconds = Math.max(0, requiredTime - timeSpent);
  const progressPercent = Math.min(
    100,
    Math.round((timeSpent / (requiredTime || 1)) * 100)
  );

  const handleCompleteAndNext = async () => {
    if (!lesson) return;
    try {
      setCompleting(true);

      // 1. Verify lesson completion requirements from authoritative status endpoint
      const statusRes = await learningAPI.getLessonCompletionStatus(lesson.id).catch(() => null);
      if (statusRes?.data && !statusRes.data.canComplete) {
        setCompletionModal({
          isOpen: true,
          title: "Module Incomplete",
          reasons: statusRes.data.reasons || [],
          criteria: statusRes.data.criteria,
        });
        return;
      }

      // 2. Submit completion
      await learningAPI.completeLesson(lesson.id, timeSpent);
      if (course) {
        setCourse({
          ...course,
          modules: course.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === lesson.id ? { ...l, isCompleted: true } : l
            ),
          })),
        });
      }
      setXpCelebration(25);
      setTimeout(() => setXpCelebration(null), 3000);

      if (lesson.nextLessonId) {
        setActiveLessonId(lesson.nextLessonId);
      } else {
        router.push(`/learning/${pathSlug}`);
      }
    } catch (err: any) {
      const errorData = err.response?.data;
      const reasons = errorData?.reasons || [
        errorData?.message ||
        "Please complete and pass all required practice exercises in this lesson before proceeding.",
      ];
      setCompletionModal({
        isOpen: true,
        title: "Module Incomplete",
        reasons: Array.isArray(reasons) ? reasons : [String(reasons)],
        criteria: errorData?.criteria,
      });
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center pt-24 font-sans text-foreground">
        <Spinner className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground">Loading course workspace...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center pt-24 p-6 font-sans">
        <h2 className="text-xl font-bold">Course not found</h2>
        <Link
          href={`/learning/${pathSlug}`}
          className="mt-4 text-primary hover:underline inline-flex items-center gap-1.5 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Path Overview</span>
        </Link>
      </div>
    );
  }

  const allLessons = course.modules.flatMap((m) => m.lessons);
  const currentLessonIndex = allLessons.findIndex((l) => l.id === activeLessonId);

  const renderInteractivePracticeSuite = (ex?: any) => {
    const w3List = getW3ExercisesForCourse(courseSlug, pathSlug);
    const safeIdx = Math.min(Math.max(0, w3Index), w3List.length - 1);
    const currentEx = w3List[safeIdx];
    const feedback = currentEx ? w3Feedback[currentEx.id] : undefined;
    const userAnswers = currentEx ? w3BlankValues[currentEx.id] || {} : {};
    const parts = currentEx ? currentEx.codeTemplate.split(/(\[b\d+\])/g) : [];

    return (
      <div className="space-y-5">
        {/* Mode Navigation Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-border">
          <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border shadow-xs">
            <button
              type="button"
              onClick={() => setActiveTabMode("coding")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTabMode === "coding" || activeTabMode === "content"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 className="w-3.5 h-3.5 text-primary" />
              <span>Live Code Compiler</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTabMode("w3")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTabMode === "w3"
                  ? "bg-card text-foreground shadow-xs border border-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Chandigarh University Practice</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-primary/10 text-primary font-bold">
                {w3List.length}
              </span>
            </button>
          </div>

          <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
            Interactive Real-Time Feedback
          </span>
        </div>

        {/* MODE A: Real-Time Coding Compiler & Live Terminal */}
        {(activeTabMode === "coding" || activeTabMode === "content") && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <select
                  value={language}
                  onChange={(e) => {
                    const newLang = e.target.value;
                    setLanguage(newLang);
                    if (ex?.starterCode?.[newLang]) {
                      setCode(ex.starterCode[newLang]);
                    } else if (DEFAULT_STARTER_CODES[newLang]) {
                      setCode(DEFAULT_STARTER_CODES[newLang]);
                    }
                  }}
                  className="h-9 bg-card text-foreground text-xs font-semibold rounded-lg px-3 border border-border shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  <option value="javascript">JavaScript (Real-Time Sandbox)</option>
                  <option value="python">Python 3</option>
                  <option value="java">Java 21</option>
                  <option value="cpp">C++ 20</option>
                </select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (ex?.starterCode?.[language]) {
                      setCode(ex.starterCode[language]);
                    } else if (DEFAULT_STARTER_CODES[language]) {
                      setCode(DEFAULT_STARTER_CODES[language]);
                    } else {
                      setCode("// Write your solution below\n");
                    }
                  }}
                  className="h-9 text-xs gap-1 border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  title="Reset to starter code"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Reset Code</span>
                </Button>
              </div>

              {ex?.hints && ex.hints.length > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                  <Lightbulb className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Hint: {ex.hints[0]}</span>
                </span>
              )}
            </div>

            {/* Monaco Editor Container */}
            <div className="border border-border rounded-xl overflow-hidden h-72 shadow-inner">
              <Editor
                height="100%"
                language={language === "cpp" ? "cpp" : language}
                theme={isDark ? "vs-dark" : "light"}
                value={code || DEFAULT_STARTER_CODES[language] || "// Write code here\n"}
                onChange={(val) => setCode(val || "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                }}
              />
            </div>

            {/* Action Buttons: Real-Time Run and Submit */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={handleRunCodeRealtime}
                  disabled={isExecutingRealtime}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 shadow-xs gap-1.5 cursor-pointer transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>
                    {isExecutingRealtime ? "Executing Live..." : "▶ Run Code (Live)"}
                  </span>
                </Button>

                {ex && (
                  <Button
                    type="button"
                    onClick={() => handleCodeSubmit(ex.id)}
                    disabled={submittingExercise}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 px-4 shadow-xs gap-1.5 cursor-pointer transition-all"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      {submittingExercise ? "Evaluating..." : "Submit Solution"}
                    </span>
                  </Button>
                )}
              </div>

              <span className="text-[11px] text-muted-foreground">
                Real-time sandbox runner with live output capture
              </span>
            </div>

            {/* Live Terminal Console */}
            <div className="bg-[#0b0f19] border border-border/80 rounded-xl overflow-hidden shadow-lg font-mono text-xs">
              <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b26] border-b border-border/60">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                  </div>
                  <span className="text-slate-400 font-semibold text-[11px] ml-1">
                    Terminal Output
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-medium">
                    {isExecutingRealtime ? "Executing..." : "Ready"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => setTerminalTab("output")}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        terminalTab === "output"
                          ? "bg-slate-700 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Console Output
                    </button>
                    <button
                      type="button"
                      onClick={() => setTerminalTab("tests")}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer ${
                        terminalTab === "tests"
                          ? "bg-slate-700 text-white shadow-xs"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Test Results
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setTerminalLogs([
                        {
                          type: "system",
                          text: "> Console cleared.",
                          time: new Date().toLocaleTimeString(),
                        },
                      ])
                    }
                    className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
                    title="Clear Console"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-4 max-h-56 overflow-y-auto space-y-1.5 text-slate-200 select-text">
                {terminalTab === "output" ? (
                  terminalLogs.map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                      <span className="text-slate-500 text-[10px] select-none flex-shrink-0 pt-0.5">
                        [{log.time}]
                      </span>
                      {log.type === "stdout" && (
                        <span className="text-emerald-400 font-medium flex-1">
                          {log.text}
                        </span>
                      )}
                      {log.type === "stderr" && (
                        <span className="text-rose-400 font-semibold flex-1">
                          {log.text}
                        </span>
                      )}
                      {log.type === "return" && (
                        <span className="text-cyan-300 font-semibold flex-1">
                          {log.text}
                        </span>
                      )}
                      {log.type === "system" && (
                        <span className="text-slate-400 italic flex-1">
                          {log.text}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="space-y-2">
                    {executionFeedback?.results ? (
                      executionFeedback.results.map((res: any, idx: number) => (
                        <div
                          key={idx}
                          className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                            res.passed
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                              : "bg-destructive/10 border-destructive/30 text-rose-300"
                          }`}
                        >
                          <span className="font-semibold">
                            Test Case #{idx + 1}: {res.passed ? "Passed ✓" : "Failed ✗"}
                          </span>
                          {res.error && (
                            <span className="text-[11px] text-rose-400 font-mono">
                              {res.error}
                            </span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-xs py-2">
                        No test assertions evaluated yet. Click &quot;Submit Solution&quot; to test your code.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE B: Chandigarh University Lab Fill in the Blanks / Complete the Code */}
        {activeTabMode === "w3" && currentEx && (
          <div className="p-5 rounded-2xl bg-card border-2 border-border shadow-xs space-y-5">
            {/* W3 Header & Stepper Navigation */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Chandigarh University Lab
                </span>
                <h4 className="text-sm font-bold text-foreground">
                  {currentEx.title}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-semibold">
                  Exercise {safeIdx + 1} of {w3List.length}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setW3Index((prev) => Math.max(0, prev - 1))}
                    disabled={safeIdx <= 0}
                    className="p-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 cursor-pointer"
                    title="Previous exercise"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setW3Index((prev) => Math.min(w3List.length - 1, prev + 1))}
                    disabled={safeIdx >= w3List.length - 1}
                    className="p-1.5 rounded-lg border border-border text-foreground hover:bg-muted disabled:opacity-40 cursor-pointer"
                    title="Next exercise"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Exercise Prompt */}
            <p className="text-sm font-semibold text-foreground leading-relaxed">
              {currentEx.instruction}
            </p>

            {/* Interactive Code Container with Inline Input Blanks */}
            <div className="p-4 rounded-xl bg-[#0d1117] border border-border/80 shadow-inner overflow-x-auto text-xs sm:text-sm font-mono leading-relaxed select-text text-slate-100">
              {parts.map((part, pIdx) => {
                const blankMatch = part.match(/^\[(b\d+)\]$/);
                if (blankMatch) {
                  const bId = blankMatch[1];
                  const bDef = currentEx.blanks.find((b) => b.id === bId);
                  const currentVal = userAnswers[bId] || "";
                  const expectedVal = bDef?.answer || "";

                  let blankClass =
                    "bg-primary/20 border-primary/50 text-white font-bold focus:ring-2 focus:ring-primary";
                  if (feedback) {
                    const isMatch =
                      bDef?.caseSensitive !== true
                        ? currentVal.trim().toLowerCase() === expectedVal.trim().toLowerCase()
                        : currentVal.trim() === expectedVal.trim();
                    if (isMatch) {
                      blankClass =
                        "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-extrabold shadow-[0_0_10px_rgba(16,185,129,0.4)]";
                    } else {
                      blankClass =
                        "bg-destructive/20 border-destructive text-destructive font-extrabold shadow-[0_0_10px_rgba(239,68,68,0.4)]";
                    }
                  }

                  const inputLen = Math.max(
                    (bDef?.placeholder?.length || 4) + 2,
                    currentVal.length + 2,
                    expectedVal.length + 1
                  );

                  return (
                    <input
                      key={pIdx}
                      type="text"
                      value={currentVal}
                      placeholder={bDef?.placeholder || "..."}
                      style={{ width: `${inputLen}ch` }}
                      onChange={(e) => {
                        setW3BlankValues({
                          ...w3BlankValues,
                          [currentEx.id]: {
                            ...userAnswers,
                            [bId]: e.target.value,
                          },
                        });
                        if (feedback) {
                          setW3Feedback({
                            ...w3Feedback,
                            [currentEx.id]: {
                              ...feedback,
                              isCorrect: false,
                              message: undefined,
                            },
                          });
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleCheckW3Blank(currentEx);
                        }
                      }}
                      className={`inline-block mx-1 px-2.5 py-0.5 rounded-md border text-center transition-all outline-none font-mono text-xs sm:text-sm ${blankClass}`}
                    />
                  );
                }
                return <span key={pIdx}>{part}</span>;
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => handleCheckW3Blank(currentEx)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-5 shadow-xs cursor-pointer gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Submit Answer &gt;</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleToggleW3Answer(currentEx)}
                  className="border-border text-foreground hover:bg-muted font-semibold text-xs h-9 px-3.5 gap-1.5 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    {w3ShowAnswer[currentEx.id] ? "Hide Answer" : "Show Answer"}
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleResetW3(currentEx.id)}
                  className="text-xs text-muted-foreground hover:text-foreground h-9 px-3 gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </Button>
              </div>

              {currentEx.hint && (
                <span className="text-xs text-muted-foreground font-medium">
                  💡 Hint: {currentEx.hint}
                </span>
              )}
            </div>

            {/* Explanation Drawer if Answer Shown or Correct */}
            {(w3ShowAnswer[currentEx.id] || feedback?.isCorrect) && (
              <div className="p-3.5 rounded-xl border border-border bg-muted/40 text-xs leading-relaxed text-foreground">
                <span className="font-bold text-primary block mb-1">
                  Understanding the concept:
                </span>
                <p>{currentEx.explanation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background text-foreground pt-24 pb-16 px-4 sm:px-6 lg:px-8 flex flex-col font-sans">
      
      {/* ── Standard Studio Card Layout ───────────────────────────────────────── */}
      <div className="max-w-[1600px] mx-auto w-full flex-1 flex flex-col space-y-6">
        
        {/* Sub-Header Bar (Clear from floating Navbar) */}
        <div className="bg-card border border-border rounded-xl px-5 py-3.5 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 truncate">
            <Link
              href={`/learning/${pathSlug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Path Syllabus</span>
            </Link>
            <span className="text-border">|</span>
            <div className="truncate">
              <span className="text-xs text-muted-foreground hidden md:inline">
                {pathTitle} /{" "}
              </span>
              <span className="text-sm font-bold text-foreground truncate">
                {course.title}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Live Stopwatch Tracker Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-bold transition-all ${
                hasMetTimeRequirement
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-muted/60 border-border text-foreground"
              }`}
              title={
                hasMetTimeRequirement
                  ? "Required study time satisfied"
                  : `Study time remaining: ${remainingSeconds}s`
              }
            >
              <Timer
                className={`w-3.5 h-3.5 ${
                  hasMetTimeRequirement ? "text-emerald-500" : "text-amber-500 animate-pulse"
                }`}
              />
              <span>{formatTime(timeSpent)}</span>
              <span className="text-muted-foreground font-normal text-[10px]">
                / {formatTime(requiredTime)}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentLessonIndex > 0) {
                  setActiveLessonId(allLessons[currentLessonIndex - 1].id);
                }
              }}
              disabled={currentLessonIndex <= 0}
              className="h-8 px-2.5 text-xs font-medium border-border text-foreground hover:bg-muted gap-1 cursor-pointer"
              title="Previous Lesson"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (currentLessonIndex < allLessons.length - 1) {
                  setActiveLessonId(allLessons[currentLessonIndex + 1].id);
                }
              }}
              disabled={currentLessonIndex >= allLessons.length - 1}
              className="h-8 px-2.5 text-xs font-medium border-border text-foreground hover:bg-muted gap-1 cursor-pointer"
              title="Next Lesson"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>

            <Button
              size="sm"
              onClick={handleCompleteAndNext}
              disabled={completing}
              className={`h-8 px-3.5 text-xs font-semibold shadow-xs gap-1.5 cursor-pointer transition-all ${
                hasMetTimeRequirement
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-amber-600 hover:bg-amber-700 text-white"
              }`}
            >
              {completing ? (
                <span>Saving...</span>
              ) : !hasMetTimeRequirement ? (
                <>
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>{remainingSeconds}s left</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {currentLessonIndex < allLessons.length - 1
                      ? "Complete & Next"
                      : "Finish Course"}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Studio Workspace Content */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          
          {/* Left Navigation Sidebar with Connecting Step Lines */}
          <aside className="md:col-span-4 lg:col-span-3 bg-card border border-border rounded-xl p-4 shadow-xs sticky top-28 space-y-5">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Course Curriculum
              </span>
              <span className="text-[10px] font-semibold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                {allLessons.filter((l) => l.isCompleted).length} / {allLessons.length} Done
              </span>
            </div>

            <div className="space-y-6">
              {course.modules.map((mod) => (
                <div key={mod.id} className="space-y-2">
                  <div className="px-2 py-1 text-xs font-bold text-foreground flex items-center justify-between border-b border-border/40 pb-1.5">
                    <span className="truncate">{mod.title}</span>
                    <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-500" />
                      <span>{mod.requiredTimeMinutes || 2}m</span>
                    </span>
                  </div>

                  {/* Connected Step Nodes with Connecting Vertical Lines */}
                  <div className="relative pl-3 space-y-1">
                    {mod.lessons.map((l, lIdx) => {
                      const isActive = l.id === activeLessonId;
                      const isLast = lIdx === mod.lessons.length - 1;

                      return (
                        <div key={l.id} className="relative flex items-start group">
                          {/* Vertical Connecting Line */}
                          {!isLast && (
                            <div
                              className={`absolute left-[11px] top-6 bottom-[-8px] w-0.5 transition-all duration-300 ${
                                l.isCompleted
                                  ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                                  : "bg-border"
                              }`}
                            />
                          )}

                          <button
                            onClick={() => setActiveLessonId(l.id)}
                            className={`w-full text-left pl-7 pr-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-all duration-200 cursor-pointer ${
                              isActive
                                ? "bg-primary/10 text-primary font-bold shadow-xs translate-x-1"
                                : l.isCompleted
                                ? "text-foreground hover:bg-muted/60"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            {/* Step Indicator Node */}
                            <div
                              className={`absolute left-0 top-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all z-10 ${
                                l.isCompleted
                                  ? "bg-emerald-500 text-white shadow-xs scale-105"
                                  : isActive
                                  ? "bg-primary text-primary-foreground ring-4 ring-primary/25 shadow-xs scale-110 animate-pulse"
                                  : "bg-card border border-border text-muted-foreground group-hover:border-foreground/40"
                              }`}
                            >
                              {l.isCompleted ? (
                                <Check className="w-3.5 h-3.5 stroke-[3]" />
                              ) : (
                                <span>{lIdx + 1}</span>
                              )}
                            </div>

                            <span className="truncate flex-1 pr-2">{l.title}</span>

                            <span className="text-[10px] uppercase font-semibold text-muted-foreground/60">
                              {l.type === "quiz" ? "MCQ" : l.type === "coding" ? "Code" : "Read"}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </aside>

          {/* Right Main Lesson Canvas */}
          <main className="md:col-span-8 lg:col-span-9 bg-card border border-border rounded-xl p-6 sm:p-10 shadow-xs space-y-8">
            {lessonLoading || !lesson ? (
              <div className="py-24 flex items-center justify-center">
                <Spinner className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              <div className="space-y-8">
                {/* Interactive Module Stopwatch & Requirement Bar */}
                <div
                  className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-300 shadow-xs ${
                    hasMetTimeRequirement
                      ? "bg-gradient-to-r from-emerald-500/10 via-card to-emerald-500/5 border-emerald-500/30"
                      : "bg-gradient-to-r from-muted/50 via-card to-muted/30 border-border"
                  }`}
                >
                  {celebrationGlow && (
                    <div className="absolute inset-0 bg-emerald-500/20 animate-pulse pointer-events-none" />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                          hasMetTimeRequirement
                            ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-105"
                            : "bg-primary/10 text-primary border border-primary/20"
                        }`}
                      >
                        <Timer
                          className={`w-5 h-5 ${
                            activityTimer.isRunning && !hasMetTimeRequirement ? "animate-pulse" : ""
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Module Study Stopwatch
                          </h4>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              hasMetTimeRequirement
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse"
                            }`}
                          >
                            {hasMetTimeRequirement
                              ? "✓ Required Time Completed"
                              : `⏱️ ${remainingSeconds}s Remaining`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {hasMetTimeRequirement
                            ? "Engagement criteria satisfied! You can now complete this step and continue."
                            : `Admin requires minimum ${Math.ceil(
                                requiredTime / 60
                              )} min of active reading & practice.`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-mono font-black text-foreground">
                          {formatTime(timeSpent)}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                          Time Spent
                        </span>
                      </div>

                      <div className="w-28 sm:w-36 flex flex-col gap-1">
                        <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden border border-border">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              hasMetTimeRequirement ? "bg-emerald-500" : "bg-primary"
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground text-right font-medium">
                          {progressPercent}% Met
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* XP Celebration Banner */}
                {xpCelebration && (
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-3 animate-bounce shadow-xs">
                    <Sparkles className="w-5 h-5 text-primary" />
                    <span className="text-sm font-bold text-primary">
                      +{xpCelebration} XP Earned for Verified Progress!
                    </span>
                  </div>
                )}

                {/* Lesson Header */}
                <div className="pb-6 border-b border-border">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 uppercase tracking-wide">
                      {lesson.type} Lesson
                    </span>
                    {lesson.isCompleted && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Completed</span>
                      </span>
                    )}
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                    {lesson.title}
                  </h1>

                  {lesson.learningObjectives && lesson.learningObjectives.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {lesson.learningObjectives.map((obj, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-md bg-muted text-xs text-foreground font-medium border border-border"
                        >
                          🎯 {obj}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Rich Lesson Body */}
                <div className="py-2">
                  <RichContentRenderer content={lesson.content} />
                </div>

                {/* Practice Exercises / Quizzes */}
                {lesson.exercises && lesson.exercises.length > 0 && (
                  <div className="pt-8 border-t border-border space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Code2 className="w-5 h-5 text-primary" />
                        <span>Hands-on Knowledge Check</span>
                      </h2>
                      <span className="text-xs text-muted-foreground font-medium">
                        Immediate concept verification
                      </span>
                    </div>

                    {lesson.exercises.map((ex) => (
                      <div
                        key={ex.id}
                        className="bg-muted/20 border border-border rounded-xl p-6 shadow-xs space-y-6"
                      >
                        <div className="flex items-center justify-between pb-4 border-b border-border">
                          <h3 className="text-base font-bold text-foreground">{ex.title}</h3>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                            +{ex.marks} XP
                          </span>
                        </div>

                        {/* Quiz Runner */}
                        {ex.type === "quiz" && ex.quizConfig?.questions && (
                          <div className="space-y-6">
                            {/* Quiz Progress & Question Quick-Jump Stepper */}
                            <div className="bg-muted/40 border border-border rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-foreground">
                                  {ex.quizConfig.questions.length} Practice MCQs
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                  · {Object.keys(selectedAnswers).length} of {ex.quizConfig.questions.length} answered
                                </span>
                              </div>

                              {/* Question Quick Jump Pills */}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {ex.quizConfig.questions.map((q, qIdx) => {
                                  const isAnswered = selectedAnswers[q.id] !== undefined;
                                  const qResult = quizResults?.results?.find(
                                    (r: any) => r.questionId === q.id,
                                  );
                                  return (
                                    <button
                                      key={q.id}
                                      type="button"
                                      onClick={() => {
                                        const el = document.getElementById(`quiz-q-${q.id}`);
                                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                      }}
                                      className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center cursor-pointer ${
                                        qResult
                                          ? qResult.isCorrect
                                            ? "bg-emerald-500 text-white shadow-xs"
                                            : "bg-destructive text-destructive-foreground shadow-xs"
                                          : isAnswered
                                          ? "bg-primary text-primary-foreground shadow-xs"
                                          : "bg-card border border-border text-muted-foreground hover:border-foreground/30"
                                      }`}
                                      title={`Jump to Question ${qIdx + 1}`}
                                    >
                                      {qIdx + 1}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {ex.quizConfig.questions.map((q, qIdx) => (
                              <div
                                key={q.id}
                                id={`quiz-q-${q.id}`}
                                className="p-5 rounded-xl border border-border bg-card/60 space-y-3.5 shadow-xs"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                                    Question {qIdx + 1} of {ex.quizConfig?.questions?.length || 0}
                                  </span>
                                  {selectedAnswers[q.id] !== undefined && (
                                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                      ✓ Option Selected
                                    </span>
                                  )}
                                </div>
                                <p className="text-base font-bold text-foreground leading-snug">
                                  {q.question}
                                </p>
                                
                                <div className="space-y-2.5">
                                  {q.options.map((opt, optIdx) => {
                                    const isSelected = selectedAnswers[q.id] === optIdx;
                                    const qResult = quizResults?.results?.find(
                                      (r: any) => r.questionId === q.id,
                                    );

                                    let containerStyle =
                                      "border-slate-200 dark:border-border bg-white dark:bg-card text-slate-900 dark:text-foreground hover:bg-slate-50 dark:hover:bg-muted/60 hover:border-primary/50 shadow-xs";
                                    let letterBadgeStyle =
                                      "bg-slate-100 dark:bg-muted text-slate-800 dark:text-foreground border border-slate-300 dark:border-border";

                                    if (qResult) {
                                      if (optIdx === qResult.correctAnswer) {
                                        containerStyle =
                                          "border-emerald-500 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100 font-bold ring-2 ring-emerald-500/40 shadow-sm";
                                        letterBadgeStyle = "bg-emerald-600 text-white font-bold";
                                      } else if (isSelected && !qResult.isCorrect) {
                                        containerStyle =
                                          "border-rose-500 bg-rose-500/15 text-rose-950 dark:text-rose-100 font-bold ring-2 ring-rose-500/40 shadow-sm";
                                        letterBadgeStyle =
                                          "bg-rose-600 text-white font-bold";
                                      }
                                    } else if (isSelected) {
                                      containerStyle =
                                        "border-primary bg-primary/10 text-slate-950 dark:text-foreground font-bold ring-2 ring-primary/40 shadow-sm";
                                      letterBadgeStyle =
                                        "bg-primary text-primary-foreground font-bold";
                                    }

                                    return (
                                      <button
                                        key={optIdx}
                                        type="button"
                                        onClick={() =>
                                          setSelectedAnswers({
                                            ...selectedAnswers,
                                            [q.id]: optIdx,
                                          })
                                        }
                                        className={`w-full text-left px-4 py-3.5 rounded-xl text-sm font-semibold border-2 transition-all duration-150 cursor-pointer flex items-center justify-between ${containerStyle}`}
                                      >
                                        <div className="flex items-center gap-3">
                                          <span
                                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs flex-shrink-0 transition-colors ${letterBadgeStyle}`}
                                          >
                                            {qResult && optIdx === qResult.correctAnswer
                                              ? "✓"
                                              : qResult && isSelected && !qResult.isCorrect
                                              ? "✗"
                                              : String.fromCharCode(65 + optIdx)}
                                          </span>
                                          <span className="leading-snug">{opt}</span>
                                        </div>
                                        {isSelected && !qResult && (
                                          <span className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 animate-pulse" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>

                                {/* Question Explanation Callout */}
                                {quizResults?.results?.find((r: any) => r.questionId === q.id) && (
                                  <div
                                    className={`mt-3 p-4 rounded-xl border text-xs leading-relaxed ${
                                      quizResults.results.find((r: any) => r.questionId === q.id)
                                        ?.isCorrect
                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                                        : "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5 font-bold mb-1">
                                      <Lightbulb className="w-4 h-4 text-amber-500" />
                                      <span>
                                        {quizResults.results.find(
                                          (r: any) => r.questionId === q.id,
                                        )?.isCorrect
                                          ? "Correct Concept Verified"
                                          : "Explanation & In-Depth Review"}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-foreground text-xs leading-relaxed font-medium">
                                      {
                                        quizResults.results.find(
                                          (r: any) => r.questionId === q.id,
                                        )?.explanation
                                      }
                                    </p>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Quiz Outcome Banner */}
                            {quizResults && (
                              <div
                                className={`p-4 rounded-xl border text-xs ${
                                  quizResults.passed
                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                                    : "bg-destructive/10 border-destructive/30 text-destructive"
                                }`}
                              >
                                <div className="font-bold mb-1">
                                  {quizResults.passed
                                    ? "✓ Quiz Passed Successfully!"
                                    : "✗ Review Incorrect Answers Above"}
                                </div>
                                <div>
                                  Score: {quizResults.score}% (Required:{" "}
                                  {quizResults.passThreshold}%)
                                </div>
                              </div>
                            )}

                            <Button
                              onClick={() => handleQuizSubmit(ex.id)}
                              disabled={submittingExercise}
                              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 px-5 shadow-xs cursor-pointer"
                            >
                              {submittingExercise ? "Evaluating..." : "Check Answers"}
                            </Button>
                          </div>
                        )}

                        {/* Coding & Chandigarh University Practice Suite */}
                        {(ex.type === "coding" || ex.type === "debugging") &&
                          renderInteractivePracticeSuite(ex)
                        }
                      </div>
                    ))}
                  </div>
                )}

                {/* Always-Accessible Hands-on Interactive Practice & Chandigarh University Lab Exercises */}
                {!lesson.exercises?.some((e) => e.type === "coding" || e.type === "debugging") && (
                  <div className="pt-8 border-t border-border space-y-6">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Code2 className="w-5 h-5 text-primary" />
                        <span>Interactive Practice & Chandigarh University Exercises</span>
                      </h2>
                      <span className="text-xs text-muted-foreground font-medium">
                        Real-time code compiler & concept fill-in-the-blanks
                      </span>
                    </div>

                    <div className="bg-muted/20 border border-border rounded-xl p-6 shadow-xs space-y-6">
                      {renderInteractivePracticeSuite()}
                    </div>
                  </div>
                )}

                {/* Bottom Navigation */}
                <div className="pt-8 border-t border-border flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (currentLessonIndex > 0) {
                          setActiveLessonId(allLessons[currentLessonIndex - 1].id);
                        }
                      }}
                      disabled={currentLessonIndex <= 0}
                      className="gap-1.5 border-border text-foreground hover:bg-muted font-medium text-xs h-9 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Previous Lesson</span>
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => {
                        if (currentLessonIndex < allLessons.length - 1) {
                          setActiveLessonId(allLessons[currentLessonIndex + 1].id);
                        }
                      }}
                      disabled={currentLessonIndex >= allLessons.length - 1}
                      className="gap-1.5 border-border text-foreground hover:bg-muted font-medium text-xs h-9 cursor-pointer"
                    >
                      <span>Next Lesson</span>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>

                  <Button
                    onClick={handleCompleteAndNext}
                    disabled={completing}
                    className={`gap-2 font-semibold text-xs h-9 px-5 shadow-xs cursor-pointer transition-all ${
                      hasMetTimeRequirement
                        ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                        : "bg-amber-600 hover:bg-amber-700 text-white"
                    }`}
                  >
                    {completing ? (
                      <>
                        <Spinner className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : !hasMetTimeRequirement ? (
                      <>
                        <Clock className="w-4 h-4 animate-pulse" />
                        <span>Spend {formatTime(remainingSeconds)} more</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-white" />
                        <span>
                          {currentLessonIndex < allLessons.length - 1
                            ? "Complete & Next Lesson"
                            : "Finish Course"}
                        </span>
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── Module Incompletion Reasons Popup Modal ── */}
      <ModuleCompletionModal
        isOpen={completionModal.isOpen}
        onClose={() => setCompletionModal((prev) => ({ ...prev, isOpen: false }))}
        title={completionModal.title}
        reasons={completionModal.reasons}
        criteria={completionModal.criteria}
        onNavigateTab={(tab) => {
          setActiveTabMode(tab);
        }}
      />

      {/* ── Interactive Modal Popup Window (Standard Replacement for window.alert) ── */}
      {popupModal?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <button
                onClick={() => setPopupModal(null)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">
                {popupModal.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                {popupModal.message}
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                onClick={() => setPopupModal(null)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-5 h-9"
              >
                Got it, Continue Practice
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
