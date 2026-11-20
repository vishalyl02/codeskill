"use client";

import { useState, useEffect, useMemo, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Trash2,
  ExternalLink,
  Save,
  CheckCircle2,
  HelpCircle,
  Code2,
  Clock,
  Layers,
  ChevronDown,
  ChevronUp,
  Edit2,
  FileText,
  AlertCircle,
  Database,
  Terminal,
  Lightbulb,
  Search,
  Filter,
  Sparkles,
  Library,
  Check,
  X,
} from "lucide-react";
import { adminLearningAPI } from "@/config/api";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CourseDetail {
  id: string;
  title: string;
  slug: string;
  description: string;
  difficulty: string;
  estimatedMinutes: number;
  status?: string;
  modules: Array<{
    id: string;
    title: string;
    description: string;
    order: number;
    requiredTimeMinutes?: number;
    requiredTimeSeconds?: number;
    isMandatory?: boolean;
    lessons: Array<{
      id: string;
      title: string;
      slug: string;
      type: "reading" | "quiz" | "coding" | "debugging";
      content?: string;
      order: number;
      isMandatory?: boolean;
      exercises: Array<{
        id: string;
        title: string;
        type: string;
        marks: number;
        isMandatory?: boolean;
        hints?: string[];
        starterCode?: Record<string, string>;
        quizConfig?: {
          questions: Array<{
            id: string;
            question: string;
            options: string[];
            correctAnswer: number;
            explanation?: string;
          }>;
        };
      }>;
    }>;
  }>;
}

interface BankQuestionItem {
  id: string;
  type: "quiz" | "coding" | "sql";
  title: string;
  topic: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  marks: number;
  // For Quiz
  quizQuestion?: string;
  options?: string[];
  correctAnswer?: number;
  explanation?: string;
  // For Coding & SQL
  starterCode?: Record<string, string>;
  testInput?: string;
  testExpected?: string;
  hints?: string[];
}

const QUESTION_BANK_DATA: BankQuestionItem[] = [
  // ── C Programming ──
  {
    id: "bank-c-1",
    type: "quiz",
    title: "C sizeof(char) Specification",
    topic: "C Programming",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "What is the output of sizeof(char) according to the ISO C Standard across all hardware architectures?",
    options: ["Exactly 1 byte", "2 bytes", "4 bytes", "Implementation-defined"],
    correctAnswer: 0,
    explanation: "In standard C (ISO/IEC 9899), sizeof(char) is defined by definition to be exactly 1.",
  },
  {
    id: "bank-c-2",
    type: "quiz",
    title: "C Pointer Member Access Operator",
    topic: "C Programming",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "Which operator is used to access structure members through a pointer?",
    options: [". (dot)", "-> (arrow)", "* (dereference)", "& (address-of)"],
    correctAnswer: 1,
    explanation: "The arrow operator (->) dereferences the pointer and accesses the structure field in one step.",
  },
  {
    id: "bank-c-3",
    type: "coding",
    title: "In-Place Swap Using Pointers",
    topic: "C Programming",
    difficulty: "beginner",
    marks: 25,
    hints: ["Pass the addresses of variables (&a, &b) and dereference using *a and *b."],
    starterCode: {
      c: `#include <stdio.h>\n\nvoid swap(int *a, int *b) {\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}\n\nint main() {\n    int x = 10, y = 20;\n    swap(&x, &y);\n    printf("%d %d\\n", x, y);\n    return 0;\n}\n`,
      cpp: `#include <iostream>\n\nvoid swap(int &a, int &b) {\n    int temp = a;\n    a = b;\n    b = temp;\n}\n\nint main() {\n    int x = 10, y = 20;\n    swap(x, y);\n    std::cout << x << " " << y << "\\n";\n    return 0;\n}\n`,
    },
    testInput: "",
    testExpected: "20 10",
  },
  {
    id: "bank-c-4",
    type: "coding",
    title: "Dynamic Array Allocation with malloc & free",
    topic: "C Programming",
    difficulty: "intermediate",
    marks: 30,
    hints: ["Use malloc(n * sizeof(int)) and check for NULL return."],
    starterCode: {
      c: `#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    int n = 5;\n    int *arr = (int *)malloc(n * sizeof(int));\n    if (!arr) return 1;\n    int sum = 0;\n    for (int i = 0; i < n; i++) {\n        arr[i] = (i + 1) * 10;\n        sum += arr[i];\n    }\n    printf("Sum: %d\\n", sum);\n    free(arr);\n    return 0;\n}\n`,
    },
    testInput: "",
    testExpected: "Sum: 150",
  },

  // ── Data Structures & Algorithms ──
  {
    id: "bank-dsa-1",
    type: "quiz",
    title: "Balanced BST Search Complexity",
    topic: "Data Structures",
    difficulty: "intermediate",
    marks: 15,
    quizQuestion: "What is the worst-case time complexity of searching in a balanced Binary Search Tree (AVL/Red-Black)?",
    options: ["O(log n)", "O(n)", "O(1)", "O(n log n)"],
    correctAnswer: 0,
    explanation: "Because balanced BSTs maintain height proportional to log(n), searching takes at most O(log n) time.",
  },
  {
    id: "bank-dsa-2",
    type: "quiz",
    title: "Queue Data Structure Ordering",
    topic: "Data Structures",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "Which ordering discipline governs a standard Queue data structure?",
    options: ["FIFO (First In, First Out)", "LIFO (Last In, First Out)", "Priority Based", "Random Access"],
    correctAnswer: 0,
    explanation: "Queues process items in the order they arrive: First In, First Out (FIFO).",
  },
  {
    id: "bank-dsa-3",
    type: "coding",
    title: "Binary Search on a Sorted Array",
    topic: "Algorithms",
    difficulty: "intermediate",
    marks: 30,
    hints: ["Calculate mid as left + (right - left) / 2 to avoid integer overflow."],
    starterCode: {
      c: `#include <stdio.h>\n\nint binarySearch(int arr[], int n, int target) {\n    int l = 0, r = n - 1;\n    while (l <= r) {\n        int mid = l + (r - l) / 2;\n        if (arr[mid] == target) return mid;\n        if (arr[mid] < target) l = mid + 1;\n        else r = mid - 1;\n    }\n    return -1;\n}\n\nint main() {\n    int arr[] = {2, 5, 8, 12, 16, 23, 38, 56, 72};\n    int n = sizeof(arr)/sizeof(arr[0]);\n    printf("Index: %d\\n", binarySearch(arr, n, 23));\n    return 0;\n}\n`,
      python: `def binary_search(arr, target):\n    l, r = 0, len(arr) - 1\n    while l <= r:\n        mid = (l + r) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            l = mid + 1\n        else:\n            r = mid - 1\n    return -1\n\nprint("Index:", binary_search([2, 5, 8, 12, 16, 23, 38, 56, 72], 23))\n`,
    },
    testInput: "",
    testExpected: "Index: 5",
  },
  {
    id: "bank-dsa-4",
    type: "coding",
    title: "Check for Balanced Parentheses",
    topic: "Data Structures",
    difficulty: "intermediate",
    marks: 30,
    hints: ["Use a character stack to push opening brackets and pop upon matching closing brackets."],
    starterCode: {
      c: `#include <stdio.h>\n#include <stdbool.h>\n#include <string.h>\n\nbool isBalanced(const char *s) {\n    char stack[100];\n    int top = -1;\n    for (int i = 0; s[i]; i++) {\n        char c = s[i];\n        if (c == '(' || c == '[' || c == '{') stack[++top] = c;\n        else {\n            if (top < 0) return false;\n            char open = stack[top--];\n            if (c == ')' && open != '(') return false;\n            if (c == ']' && open != '[') return false;\n            if (c == '}' && open != '{') return false;\n        }\n    }\n    return top == -1;\n}\n\nint main() {\n    printf("%s\\n", isBalanced("{[()]}") ? "BALANCED" : "UNBALANCED");\n    printf("%s\\n", isBalanced("{[(])}") ? "BALANCED" : "UNBALANCED");\n    return 0;\n}\n`,
    },
    testInput: "",
    testExpected: "BALANCED\nUNBALANCED",
  },

  // ── SQL & Databases ──
  {
    id: "bank-sql-1",
    type: "quiz",
    title: "SQL Aggregate Filtering with HAVING",
    topic: "SQL & Databases",
    difficulty: "intermediate",
    marks: 15,
    quizQuestion: "Which SQL clause is used to filter records AFTER an aggregation operation with GROUP BY?",
    options: ["HAVING", "WHERE", "FILTER", "ORDER BY"],
    correctAnswer: 0,
    explanation: "WHERE filters rows before grouping; HAVING filters aggregated groups after GROUP BY.",
  },
  {
    id: "bank-sql-2",
    type: "sql",
    title: "Retrieve Completed High-Value Orders",
    topic: "SQL & Databases",
    difficulty: "beginner",
    marks: 25,
    hints: ["Filter using WHERE status = 'completed' AND amount > 100."],
    starterCode: {
      sql: `SELECT id, customer_id, amount FROM orders WHERE status = 'completed' AND amount > 100.00 ORDER BY amount DESC;`,
    },
  },
  {
    id: "bank-sql-3",
    type: "sql",
    title: "Customer Total Spend with INNER JOIN",
    topic: "SQL & Databases",
    difficulty: "intermediate",
    marks: 30,
    hints: ["Join customers and orders on customer_id, then aggregate with SUM()."],
    starterCode: {
      sql: `SELECT c.name, SUM(o.amount) as total_spent FROM customers c INNER JOIN orders o ON c.id = o.customer_id GROUP BY c.name ORDER BY total_spent DESC;`,
    },
  },

  // ── Operating Systems ──
  {
    id: "bank-os-1",
    type: "quiz",
    title: "Unix Process Creation System Call",
    topic: "Operating Systems",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "Which system call is used in Unix-like operating systems to duplicate the current process?",
    options: ["fork()", "exec()", "spawn()", "clone()"],
    correctAnswer: 0,
    explanation: "fork() duplicates the calling process, returning 0 to the child and the child PID to the parent.",
  },
  {
    id: "bank-os-2",
    type: "quiz",
    title: "Deadlock Necessary Conditions",
    topic: "Operating Systems",
    difficulty: "intermediate",
    marks: 15,
    quizQuestion: "Which of the following is NOT one of Coffman's 4 necessary conditions for Deadlock?",
    options: ["Preemption allowed", "Mutual Exclusion", "Hold and Wait", "Circular Wait"],
    correctAnswer: 0,
    explanation: "NO preemption (resources cannot be forcibly taken) is a necessary condition; if preemption is allowed, deadlock cannot occur.",
  },
  {
    id: "bank-os-3",
    type: "coding",
    title: "Process Branching and Reaping with wait()",
    topic: "Operating Systems",
    difficulty: "intermediate",
    marks: 35,
    hints: ["Check pid == 0 for the child process branch, pid > 0 for the parent."],
    starterCode: {
      c: `#include <stdio.h>\n#include <unistd.h>\n#include <sys/wait.h>\n\nint main() {\n    pid_t pid = fork();\n    if (pid == 0) {\n        printf("Child Executed\\n");\n    } else if (pid > 0) {\n        wait(NULL);\n        printf("Parent Reaped Child\\n");\n    }\n    return 0;\n}\n`,
    },
    testInput: "",
    testExpected: "Child Executed\nParent Reaped Child",
  },

  // ── Java OOP ──
  {
    id: "bank-java-1",
    type: "quiz",
    title: "Java Final Keyword on Classes",
    topic: "Java OOP",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "What is the consequence of declaring a Java class with the 'final' keyword?",
    options: [
      "The class cannot be subclassed or inherited",
      "The class cannot have any methods",
      "The class cannot be instantiated",
      "All methods in the class become private",
    ],
    correctAnswer: 0,
    explanation: "A final class in Java cannot be extended by any other class (preventing inheritance).",
  },
  {
    id: "bank-java-2",
    type: "coding",
    title: "Encapsulated BankAccount Class in Java",
    topic: "Java OOP",
    difficulty: "beginner",
    marks: 25,
    hints: ["Keep balance private and provide public getter and deposit methods."],
    starterCode: {
      java: `public class Main {\n    static class BankAccount {\n        private double balance;\n        public BankAccount(double initial) { this.balance = initial; }\n        public void deposit(double amount) { this.balance += amount; }\n        public double getBalance() { return this.balance; }\n    }\n    public static void main(String[] args) {\n        BankAccount acc = new BankAccount(100.0);\n        acc.deposit(50.0);\n        System.out.println("Balance: " + (int)acc.getBalance());\n    }\n}\n`,
    },
    testInput: "",
    testExpected: "Balance: 150",
  },

  // ── Python Programming ──
  {
    id: "bank-py-1",
    type: "quiz",
    title: "Python Dictionary Lookup Complexity",
    topic: "Python",
    difficulty: "beginner",
    marks: 15,
    quizQuestion: "What is the average time complexity of key lookup in a Python dictionary (hash table)?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n^2)"],
    correctAnswer: 0,
    explanation: "Python dictionaries are implemented as hash tables with open addressing, giving O(1) average lookup time.",
  },
  {
    id: "bank-py-2",
    type: "coding",
    title: "Fibonacci Series Generator",
    topic: "Python",
    difficulty: "beginner",
    marks: 25,
    hints: ["Use iterative unpacking a, b = b, a + b."],
    starterCode: {
      python: `def fib(n):\n    res = []\n    a, b = 0, 1\n    for _ in range(n):\n        res.append(a)\n        a, b = b, a + b\n    return res\n\nprint("Fibonacci:", " ".join(map(str, fib(7))))\n`,
    },
    testInput: "",
    testExpected: "Fibonacci: 0 1 1 2 3 5 8",
  },
];

export default function CourseCurriculumEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Course metadata form fields
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("beginner");
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);

  // Expanded state for modules
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});

  // Modals state
  const [showAddModuleModal, setShowAddModuleModal] = useState(false);
  const [newModTitle, setNewModTitle] = useState("");
  const [newModDesc, setNewModDesc] = useState("");
  const [newModMinutes, setNewModMinutes] = useState(2);

  const [editingModule, setEditingModule] = useState<{ id: string; title: string; description: string; requiredTimeMinutes: number } | null>(null);

  const [showAddLessonModal, setShowAddLessonModal] = useState<string | null>(null); // moduleId
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonType, setNewLessonType] = useState<"reading" | "quiz" | "coding" | "debugging">("reading");
  const [newLessonContent, setNewLessonContent] = useState("# Lesson Title\n\nExplain key concepts here...");

  const [editingLesson, setEditingLesson] = useState<{ id: string; title: string; type: string; content: string } | null>(null);

  // Exercise builder modal (Quiz MCQ or Coding/SQL)
  const [showAddExerciseModal, setShowAddExerciseModal] = useState<string | null>(null); // lessonId
  const [exerciseType, setExerciseType] = useState<"quiz" | "coding" | "sql" | "debugging">("quiz");
  const [exerciseTitle, setExerciseTitle] = useState("");
  const [exerciseMarks, setExerciseMarks] = useState(15);
  // Quiz fields
  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptA, setQuizOptA] = useState("");
  const [quizOptB, setQuizOptB] = useState("");
  const [quizOptC, setQuizOptC] = useState("");
  const [quizOptD, setQuizOptD] = useState("");
  const [quizCorrect, setQuizCorrect] = useState(0);
  const [quizExplanation, setQuizExplanation] = useState("");
  // Coding / SQL fields
  const [starterCode, setStarterCode] = useState("");
  const [exerciseHint, setExerciseHint] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testExpected, setTestExpected] = useState("");

  // Edit existing exercise state
  const [editingExercise, setEditingExercise] = useState<{
    id: string;
    lessonId: string;
    type: string;
    title: string;
    marks: number;
    quizQuestion?: string;
    quizOptA?: string;
    quizOptB?: string;
    quizOptC?: string;
    quizOptD?: string;
    quizCorrect?: number;
    quizExplanation?: string;
    starterCode?: string;
    testInput?: string;
    testExpected?: string;
    exerciseHint?: string;
  } | null>(null);

  const loadSampleQuestion = (type: string) => {
    if (type === "quiz") {
      setQuizQuestion("What is the time complexity of searching in a balanced Binary Search Tree?");
      setQuizOptA("O(log n)");
      setQuizOptB("O(n)");
      setQuizOptC("O(1)");
      setQuizOptD("O(n log n)");
      setQuizCorrect(0);
      setQuizExplanation("A balanced BST halves the search space at each node, giving logarithmic O(log n) time.");
    } else if (type === "sql") {
      setExerciseTitle("Retrieve Completed High-Value Orders");
      setStarterCode("SELECT id, customer_id, amount FROM orders WHERE status = 'completed' AND amount > 100.00 ORDER BY amount DESC;");
      setExerciseHint("Filter by status = 'completed' and amount > 100.");
    } else {
      setExerciseTitle("Reverse Array Elements in C");
      setStarterCode("#include <stdio.h>\n\nint main() {\n    int arr[] = {1, 2, 3, 4, 5};\n    int n = 5;\n    for (int i = n - 1; i >= 0; i--) {\n        printf(\"%d \", arr[i]);\n    }\n    printf(\"\\n\");\n    return 0;\n}\n");
      setTestInput("");
      setTestExpected("5 4 3 2 1");
      setExerciseHint("Iterate backwards starting from index n - 1 down to 0.");
    }
  };

  // Question Bank Integration state
  const [addExerciseMode, setAddExerciseMode] = useState<"new" | "bank">("new");
  const [bankSearchTerm, setBankSearchTerm] = useState("");
  const [bankTypeFilter, setBankTypeFilter] = useState<string>("all");
  const [bankTopicFilter, setBankTopicFilter] = useState<string>("all");
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<string>("all");
  const [previewingBankItemId, setPreviewingBankItemId] = useState<string | null>(null);

  const filteredQuestionBank = useMemo(() => {
    const query = bankSearchTerm.trim().toLowerCase();
    return QUESTION_BANK_DATA.filter((item) => {
      if (bankTypeFilter !== "all" && item.type !== bankTypeFilter) return false;
      if (bankTopicFilter !== "all" && item.topic !== bankTopicFilter) return false;
      if (bankDifficultyFilter !== "all" && item.difficulty !== bankDifficultyFilter) return false;
      if (query) {
        const matchTitle = item.title.toLowerCase().includes(query);
        const matchTopic = item.topic.toLowerCase().includes(query);
        const matchQuestion = item.quizQuestion?.toLowerCase().includes(query);
        const matchCode =
          item.starterCode &&
          Object.values(item.starterCode).some((c) => c.toLowerCase().includes(query));
        const matchHint = item.hints?.some((h) => h.toLowerCase().includes(query));
        if (!matchTitle && !matchTopic && !matchQuestion && !matchCode && !matchHint) return false;
      }
      return true;
    });
  }, [bankSearchTerm, bankTypeFilter, bankTopicFilter, bankDifficultyFilter]);

  const handleImportFromBank = async (item: BankQuestionItem) => {
    if (!showAddExerciseModal) return;
    try {
      setSaving(true);
      if (item.type === "quiz") {
        const quizConfig = {
          questions: [
            {
              id: `q-${Date.now()}`,
              question: item.quizQuestion || item.title,
              options: item.options || [],
              correctAnswer: item.correctAnswer || 0,
              explanation: item.explanation || "",
            },
          ],
        };
        await adminLearningAPI.createExercise(showAddExerciseModal, {
          title: item.title,
          type: "quiz",
          marks: item.marks || 15,
          quizConfig,
        });
      } else {
        const quizConfig = item.testExpected
          ? {
              testCases: [
                {
                  input: item.testInput || "",
                  expected: item.testExpected,
                },
              ],
            }
          : undefined;
        await adminLearningAPI.createExercise(showAddExerciseModal, {
          title: item.title,
          type: "coding",
          marks: item.marks || 25,
          starterCode: item.starterCode || {},
          quizConfig,
          hints: item.hints || [],
        });
      }
      showNotification("success", `Imported "${item.title}" into lesson`);
      setShowAddExerciseModal(null);
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to import question");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadCourse();
  }, [id]);

  const showNotification = (type: "success" | "error", text: string) => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const loadCourse = async () => {
    try {
      setLoading(true);
      const res = await adminLearningAPI.getCourseDetails(id);
      const data = res.data?.data || res.data;
      if (!data) throw new Error("Course not found");

      setCourse(data);
      setTitle(data.title || "");
      setSlug(data.slug || "");
      setDescription(data.description || "");
      setDifficulty(data.difficulty || "beginner");
      setEstimatedMinutes(data.estimatedMinutes || 60);

      const exp: Record<string, boolean> = {};
      (data.modules || []).forEach((m: any) => {
        exp[m.id] = true;
      });
      setExpandedModules(exp);
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to load course details");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMetadata = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!title.trim()) return;

    try {
      setSaving(true);
      await adminLearningAPI.updateCourse(id, {
        title: title.trim(),
        description: description.trim(),
        difficulty,
        estimatedMinutes: Number(estimatedMinutes) || 60,
      });
      showNotification("success", "Course metadata updated successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to save course metadata");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!confirm(`Are you sure you want to delete course "${course?.title}"? All associated modules, lessons, and exercises will be permanently removed.`)) {
      return;
    }
    try {
      setSaving(true);
      await adminLearningAPI.deleteCourse(id);
      router.push("/admin/learning");
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to delete course");
      setSaving(false);
    }
  };

  const handleToggleModuleMandatory = async (moduleId: string, current: boolean) => {
    try {
      const isMandatory = !current;
      await adminLearningAPI.updateModule(moduleId, { isMandatory });
      showNotification("success", `Module requirement set to ${isMandatory ? "REQUIRED" : "OPTIONAL"}`);
      await loadCourse();
    } catch {
      showNotification("error", "Failed to update module requirement");
    }
  };

  const handleToggleLessonMandatory = async (lessonId: string, current: boolean) => {
    try {
      const isMandatory = !current;
      await adminLearningAPI.updateLesson(lessonId, { isMandatory });
      showNotification("success", `Lesson requirement set to ${isMandatory ? "REQUIRED" : "OPTIONAL"}`);
      await loadCourse();
    } catch {
      showNotification("error", "Failed to update lesson requirement");
    }
  };

  const handleToggleExerciseMandatory = async (exerciseId: string, current: boolean) => {
    try {
      const isMandatory = !current;
      await adminLearningAPI.updateExercise(exerciseId, { isMandatory });
      showNotification("success", `Exercise requirement set to ${isMandatory ? "REQUIRED" : "OPTIONAL"}`);
      await loadCourse();
    } catch {
      showNotification("error", "Failed to update exercise requirement");
    }
  };

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModTitle.trim()) return;
    try {
      setSaving(true);
      await adminLearningAPI.createModule(id, {
        title: newModTitle.trim(),
        description: newModDesc.trim(),
        requiredTimeMinutes: Number(newModMinutes) || 2,
        requiredTimeSeconds: (Number(newModMinutes) || 2) * 60,
      });
      setShowAddModuleModal(false);
      setNewModTitle("");
      setNewModDesc("");
      setNewModMinutes(2);
      showNotification("success", "Module created successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to create module");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModule || !editingModule.title.trim()) return;
    try {
      setSaving(true);
      await adminLearningAPI.updateModule(editingModule.id, {
        title: editingModule.title.trim(),
        description: editingModule.description.trim(),
        requiredTimeMinutes: Number(editingModule.requiredTimeMinutes) || 2,
        requiredTimeSeconds: (Number(editingModule.requiredTimeMinutes) || 2) * 60,
      });
      setEditingModule(null);
      showNotification("success", "Module updated successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to update module");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm("Are you sure you want to delete this module and all its lessons?")) return;
    try {
      setSaving(true);
      await adminLearningAPI.deleteModule(moduleId);
      showNotification("success", "Module deleted");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to delete module");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddLessonModal || !newLessonTitle.trim()) return;
    try {
      setSaving(true);
      await adminLearningAPI.createLesson(showAddLessonModal, {
        title: newLessonTitle.trim(),
        content: newLessonContent,
        type: newLessonType,
      });
      setShowAddLessonModal(null);
      setNewLessonTitle("");
      setNewLessonContent("# Lesson Title\n\nExplain key concepts here...");
      showNotification("success", "Lesson created successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to create lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLessonContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    try {
      setSaving(true);
      await adminLearningAPI.updateLesson(editingLesson.id, {
        title: editingLesson.title,
        content: editingLesson.content,
        type: editingLesson.type as any,
      });
      setEditingLesson(null);
      showNotification("success", "Lesson content saved");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to save lesson content");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!confirm("Delete this lesson?")) return;
    try {
      setSaving(true);
      await adminLearningAPI.deleteLesson(lessonId);
      showNotification("success", "Lesson deleted");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to delete lesson");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showAddExerciseModal) return;

    try {
      setSaving(true);
      if (exerciseType === "quiz") {
        if (!quizQuestion || !quizOptA || !quizOptB) {
          alert("Please provide the question text and at least Options A and B.");
          setSaving(false);
          return;
        }

        const options = [quizOptA, quizOptB];
        if (quizOptC) options.push(quizOptC);
        if (quizOptD) options.push(quizOptD);

        const quizConfig = {
          questions: [
            {
              id: `q-${Date.now()}`,
              question: quizQuestion,
              options,
              correctAnswer: Number(quizCorrect),
              explanation: quizExplanation,
            },
          ],
        };

        await adminLearningAPI.createExercise(showAddExerciseModal, {
          title: quizQuestion.substring(0, 60),
          type: "quiz",
          marks: Number(exerciseMarks) || 15,
          quizConfig,
        });
      } else {
        // Coding or SQL exercise
        const isSql = exerciseType === "sql";
        const codeMap: Record<string, string> = {};
        if (isSql) {
          codeMap.sql = starterCode || "SELECT * FROM customers LIMIT 10;";
        } else {
          codeMap.c = starterCode || "#include <stdio.h>\n\nint main() {\n    return 0;\n}\n";
          codeMap.cpp = starterCode || "#include <iostream>\n\nint main() {\n    return 0;\n}\n";
          codeMap.javascript = starterCode || "// Write solution here\n";
          codeMap.python = starterCode || "# Write solution here\n";
        }

        const quizConfig = testExpected.trim()
          ? {
              testCases: [
                {
                  input: testInput || "",
                  expected: testExpected.trim(),
                },
              ],
            }
          : undefined;

        await adminLearningAPI.createExercise(showAddExerciseModal, {
          title: exerciseTitle.trim() || (isSql ? "SQL Query Practice" : "Hands-On Coding Challenge"),
          type: "coding",
          marks: Number(exerciseMarks) || 25,
          starterCode: codeMap,
          quizConfig,
          hints: exerciseHint ? [exerciseHint] : [],
        });
      }

      setShowAddExerciseModal(null);
      setExerciseTitle("");
      setQuizQuestion("");
      setQuizOptA("");
      setQuizOptB("");
      setQuizOptC("");
      setQuizOptD("");
      setQuizExplanation("");
      setStarterCode("");
      setTestInput("");
      setTestExpected("");
      setExerciseHint("");
      showNotification("success", "Exercise added successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to add exercise");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExercise = async (exerciseId: string) => {
    if (!confirm("Delete this practice exercise?")) return;
    try {
      setSaving(true);
      await adminLearningAPI.deleteExercise(exerciseId);
      showNotification("success", "Exercise deleted");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to delete exercise");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExercise) return;

    try {
      setSaving(true);
      if (editingExercise.type === "quiz") {
        const options = [editingExercise.quizOptA || "", editingExercise.quizOptB || ""];
        if (editingExercise.quizOptC) options.push(editingExercise.quizOptC);
        if (editingExercise.quizOptD) options.push(editingExercise.quizOptD);

        const quizConfig = {
          questions: [
            {
              id: `q-${Date.now()}`,
              question: editingExercise.quizQuestion || editingExercise.title,
              options,
              correctAnswer: Number(editingExercise.quizCorrect) || 0,
              explanation: editingExercise.quizExplanation || "",
            },
          ],
        };

        await adminLearningAPI.updateExercise(editingExercise.id, {
          title: (editingExercise.quizQuestion || editingExercise.title).substring(0, 60),
          marks: Number(editingExercise.marks) || 15,
          quizConfig,
        });
      } else {
        const codeMap: Record<string, string> = {};
        if (editingExercise.type === "sql") {
          codeMap.sql = editingExercise.starterCode || "SELECT * FROM customers LIMIT 10;";
        } else {
          codeMap.c = editingExercise.starterCode || "#include <stdio.h>\n\nint main() {\n    return 0;\n}";
          codeMap.cpp = editingExercise.starterCode || "#include <iostream>\n\nint main() {\n    return 0;\n}";
          codeMap.javascript = editingExercise.starterCode || "// Write solution here\n";
          codeMap.python = editingExercise.starterCode || "# Write solution here\n";
        }

        const quizConfig = editingExercise.testExpected?.trim()
          ? {
              testCases: [
                {
                  input: editingExercise.testInput || "",
                  expected: editingExercise.testExpected.trim(),
                },
              ],
            }
          : undefined;

        await adminLearningAPI.updateExercise(editingExercise.id, {
          title: editingExercise.title.trim(),
          marks: Number(editingExercise.marks) || 25,
          starterCode: codeMap,
          quizConfig,
          hints: editingExercise.exerciseHint ? [editingExercise.exerciseHint] : [],
        });
      }

      setEditingExercise(null);
      showNotification("success", "Exercise updated successfully");
      await loadCourse();
    } catch (err: any) {
      showNotification("error", err?.response?.data?.message || "Failed to update exercise");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Spinner className="w-8 h-8 text-primary mb-3 animate-spin" />
        <p className="text-muted-foreground text-sm">Loading course workspace...</p>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold text-foreground">Course Not Found</h2>
        <p className="text-muted-foreground text-sm mt-1">The requested course could not be retrieved.</p>
        <Link href="/admin/learning/paths" className="mt-4 inline-flex items-center gap-2 text-primary text-sm font-semibold">
          <ArrowLeft className="w-4 h-4" /> Back to Learning Paths
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-lg border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Link href="/admin/learning" className="hover:text-foreground transition-colors">Learning Studio</Link>
                <span>/</span>
                <Link href="/admin/learning/paths" className="hover:text-foreground transition-colors">Paths & Courses</Link>
                <span>/</span>
                <span className="text-foreground font-semibold">Course Editor</span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2 mt-0.5">
                <span>{course.title}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize font-medium">
                  {course.difficulty}
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {statusMsg && (
              <span className={`text-xs px-3 py-1 rounded-md border font-semibold ${
                statusMsg.type === "success"
                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
              }`}>
                {statusMsg.text}
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteCourse}
              disabled={saving}
              className="text-destructive hover:bg-destructive/10 border-destructive/30 text-xs gap-1.5 h-9"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Course</span>
            </Button>

            <Button
              onClick={handleSaveMetadata}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5 h-9 shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{saving ? "Saving..." : "Save Course"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Workspace Grid: Isolated Course Editor */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Course Metadata Configuration */}
          <div className="lg:col-span-4 bg-card border border-border rounded-xl p-6 shadow-sm sticky top-24 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                <span>Course Configuration</span>
              </h2>
              <span className="text-xs text-muted-foreground font-mono">{course.slug}</span>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1.5">Course Title</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="bg-background text-foreground border-border text-xs h-9"
                  placeholder="e.g. Relational Database Architecture & SQL"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1.5">URL Slug (Permanent Key)</label>
                <Input
                  value={slug}
                  disabled
                  className="bg-muted text-muted-foreground border-border text-xs h-9 font-mono"
                />
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1.5">Description & Syllabus Summary</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-background text-foreground border border-border rounded-md p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  placeholder="Detailed overview of competencies covered in this course..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1.5">Difficulty Tier</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full bg-background border border-border text-foreground text-xs rounded-md px-2.5 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1.5">Estimated Duration (Mins)</label>
                  <Input
                    type="number"
                    value={estimatedMinutes}
                    onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                    className="bg-background text-foreground border-border text-xs h-9"
                  />
                </div>
              </div>

              <Button
                onClick={handleSaveMetadata}
                disabled={saving}
                className="w-full bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-semibold h-9 mt-2"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                <span>Save Metadata</span>
              </Button>
            </div>
          </div>

          {/* Right Column: Course Modules & Curriculum Structure */}
          <div className="lg:col-span-8 space-y-6">
            <div className="flex items-center justify-between bg-card border border-border rounded-xl p-5 shadow-sm">
              <div>
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  <span>Curriculum Modules & Lessons ({course.modules?.length || 0})</span>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Organize structured modules, reading lessons, SQL queries, and hands-on MCQ quizzes.
                </p>
              </div>

              <Button
                onClick={() => setShowAddModuleModal(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold gap-1.5 h-9 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add Module</span>
              </Button>
            </div>

            {/* Modules List */}
            {(!course.modules || course.modules.length === 0) ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
                <BookOpen className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
                <h3 className="text-base font-bold text-foreground">No Modules Yet</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1 mb-5">
                  Begin structuring this course by adding your first module with lessons and exercises.
                </p>
                <Button
                  onClick={() => setShowAddModuleModal(true)}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  <Plus className="w-4 h-4 mr-1.5" />
                  <span>Create First Module</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {course.modules.map((mod, mIdx) => {
                  const isExpanded = expandedModules[mod.id] ?? true;
                  return (
                    <div
                      key={mod.id}
                      className="bg-card border border-border rounded-xl overflow-hidden shadow-sm transition-all"
                    >
                      {/* Module Header Bar */}
                      <div className="p-4 bg-muted/40 border-b border-border flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center flex-shrink-0">
                            {mIdx + 1}
                          </span>
                          <div>
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                              <span>{mod.title}</span>
                              <span className="text-[10px] text-muted-foreground font-normal">
                                (~{mod.requiredTimeMinutes || 2}m study gate)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleToggleModuleMandatory(mod.id, mod.isMandatory !== false)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all cursor-pointer ${
                                  mod.isMandatory !== false
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                                    : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                                }`}
                                title="Click to toggle Required vs Optional"
                              >
                                {mod.isMandatory !== false ? "★ Required Module" : "○ Optional Module"}
                              </button>
                            </h3>
                            {mod.description && (
                              <p className="text-xs text-muted-foreground line-clamp-1">{mod.description}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowAddLessonModal(mod.id)}
                            className="h-8 text-xs gap-1 border-border text-foreground hover:bg-muted"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Lesson</span>
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setEditingModule({
                                id: mod.id,
                                title: mod.title,
                                description: mod.description || "",
                                requiredTimeMinutes: mod.requiredTimeMinutes || 2,
                              })
                            }
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            title="Edit Module"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteModule(mod.id)}
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                            title="Delete Module"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>

                          <button
                            onClick={() =>
                              setExpandedModules({
                                ...expandedModules,
                                [mod.id]: !isExpanded,
                              })
                            }
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Lessons List inside Module */}
                      {isExpanded && (
                        <div className="p-4 space-y-3">
                          {(!mod.lessons || mod.lessons.length === 0) ? (
                            <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                              No lessons in this module. Click &quot;Add Lesson&quot; to author learning content.
                            </div>
                          ) : (
                            mod.lessons.map((lesson) => (
                              <div
                                key={lesson.id}
                                className="bg-background border border-border rounded-lg p-3.5 space-y-2.5 shadow-xs"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    {lesson.type === "reading" ? (
                                      <FileText className="w-4 h-4 text-blue-500" />
                                    ) : lesson.type === "quiz" ? (
                                      <HelpCircle className="w-4 h-4 text-amber-500" />
                                    ) : (
                                      <Terminal className="w-4 h-4 text-emerald-500" />
                                    )}
                                    <span className="text-xs font-bold text-foreground">{lesson.title}</span>
                                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                                      {lesson.type}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLessonMandatory(lesson.id, lesson.isMandatory !== false)}
                                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold uppercase transition-all cursor-pointer ${
                                        lesson.isMandatory !== false
                                          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25 hover:bg-blue-500/20"
                                          : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                                      }`}
                                      title="Toggle between Required and Optional"
                                    >
                                      {lesson.isMandatory !== false ? "Required" : "Optional"}
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowAddExerciseModal(lesson.id)}
                                      className="h-7 text-[11px] px-2 gap-1 border-border text-foreground hover:bg-muted"
                                    >
                                      <Plus className="w-3 h-3" />
                                      <span>Add Practice</span>
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        setEditingLesson({
                                          id: lesson.id,
                                          title: lesson.title,
                                          type: lesson.type,
                                          content: lesson.content || "",
                                        })
                                      }
                                      className="h-7 text-[11px] px-2 text-primary hover:bg-primary/10"
                                    >
                                      <Edit2 className="w-3 h-3 mr-1" />
                                      <span>Edit Content</span>
                                    </Button>

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteLesson(lesson.id)}
                                      className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Exercises / MCQs attached to Lesson */}
                                {lesson.exercises && lesson.exercises.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                                    {lesson.exercises.map((ex) => (
                                      <div
                                        key={ex.id}
                                        className="flex items-center justify-between text-xs bg-muted/30 border border-border/80 rounded px-3 py-1.5"
                                      >
                                        <div className="flex items-center gap-2">
                                          {ex.type === "quiz" ? (
                                            <span className="text-amber-500 font-bold">MCQ Quiz</span>
                                          ) : (
                                            <span className="text-emerald-500 font-bold">Coding Practice</span>
                                          )}
                                          <span className="text-foreground truncate max-w-sm">{ex.title}</span>
                                          <span className="text-muted-foreground text-[10px]">({ex.marks} XP)</span>
                                          <button
                                            type="button"
                                            onClick={() => handleToggleExerciseMandatory(ex.id, ex.isMandatory !== false)}
                                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase transition-all cursor-pointer ${
                                              ex.isMandatory !== false
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20"
                                                : "bg-muted text-muted-foreground border border-border hover:bg-muted/80"
                                            }`}
                                            title="Toggle between Required and Optional"
                                          >
                                            {ex.isMandatory !== false ? "Required" : "Optional"}
                                          </button>
                                        </div>

                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const q0 = ex.quizConfig?.questions?.[0];
                                              const tc0 = (ex.quizConfig as any)?.testCases?.[0];
                                              const starter =
                                                ex.starterCode?.c ||
                                                ex.starterCode?.cpp ||
                                                ex.starterCode?.sql ||
                                                ex.starterCode?.javascript ||
                                                ex.starterCode?.python ||
                                                "";
                                              setEditingExercise({
                                                id: ex.id,
                                                lessonId: lesson.id,
                                                type: ex.type,
                                                title: ex.title,
                                                marks: ex.marks || 15,
                                                quizQuestion: q0?.question || ex.title,
                                                quizOptA: q0?.options?.[0] || "",
                                                quizOptB: q0?.options?.[1] || "",
                                                quizOptC: q0?.options?.[2] || "",
                                                quizOptD: q0?.options?.[3] || "",
                                                quizCorrect: q0?.correctAnswer ?? 0,
                                                quizExplanation: q0?.explanation || "",
                                                starterCode: starter,
                                                testInput: tc0?.input || "",
                                                testExpected: tc0?.expected || tc0?.output || "",
                                                exerciseHint: ex.hints?.[0] || "",
                                              });
                                            }}
                                            className="text-muted-foreground hover:text-primary p-1 rounded transition-colors"
                                            title="Edit exercise / MCQ"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteExercise(ex.id)}
                                            className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors"
                                            title="Remove exercise"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL: Create Module */}
      {showAddModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Add New Curriculum Module</h3>
            <form onSubmit={handleCreateModule} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Module Title</label>
                <Input
                  required
                  value={newModTitle}
                  onChange={(e) => setNewModTitle(e.target.value)}
                  placeholder="e.g. Relational Data Modeling & Normalization"
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  value={newModDesc}
                  onChange={(e) => setNewModDesc(e.target.value)}
                  rows={2}
                  className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Brief summary of concepts..."
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Mandatory Study Time Gate (Minutes)</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={newModMinutes}
                  onChange={(e) => setNewModMinutes(Number(e.target.value))}
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddModuleModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Create Module
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Module */}
      {editingModule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Edit Module Details</h3>
            <form onSubmit={handleUpdateModule} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Module Title</label>
                <Input
                  required
                  value={editingModule.title}
                  onChange={(e) => setEditingModule({ ...editingModule, title: e.target.value })}
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Description</label>
                <textarea
                  value={editingModule.description}
                  onChange={(e) => setEditingModule({ ...editingModule, description: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Mandatory Study Time Gate (Minutes)</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={editingModule.requiredTimeMinutes}
                  onChange={(e) =>
                    setEditingModule({
                      ...editingModule,
                      requiredTimeMinutes: Number(e.target.value),
                    })
                  }
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingModule(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Lesson */}
      {showAddLessonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-xl w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-foreground">Add Lesson to Module</h3>
            <form onSubmit={handleCreateLesson} className="space-y-3.5 text-xs">
              <div>
                <label className="font-semibold block mb-1">Lesson Title</label>
                <Input
                  required
                  value={newLessonTitle}
                  onChange={(e) => setNewLessonTitle(e.target.value)}
                  placeholder="e.g. SQL JOIN Operations & Query Plan Analysis"
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Lesson Type</label>
                <select
                  value={newLessonType}
                  onChange={(e) => setNewLessonType(e.target.value as any)}
                  className="w-full bg-background border border-border text-foreground text-xs rounded-md px-2.5 py-2 font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer shadow-xs"
                >
                  <option value="reading">Reading & Conceptual Guide</option>
                  <option value="coding">Hands-on Coding Practice</option>
                  <option value="quiz">Interactive MCQ Assessment</option>
                  <option value="debugging">Code Debugging Lab</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Content (Markdown Supported)</label>
                <textarea
                  rows={8}
                  value={newLessonContent}
                  onChange={(e) => setNewLessonContent(e.target.value)}
                  className="w-full bg-background border border-border rounded p-3 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddLessonModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Create Lesson
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Edit Lesson Content */}
      {editingLesson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-3xl w-full shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-base font-bold text-foreground">Edit Lesson Content: {editingLesson.title}</h3>
              <span className="text-xs uppercase font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                {editingLesson.type}
              </span>
            </div>

            <form onSubmit={handleSaveLessonContent} className="space-y-4 text-xs flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="font-semibold block mb-1">Lesson Title</label>
                <Input
                  value={editingLesson.title}
                  onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div className="flex-1 flex flex-col min-h-0">
                <label className="font-semibold block mb-1">Markdown Lesson Content</label>
                <textarea
                  value={editingLesson.content}
                  onChange={(e) => setEditingLesson({ ...editingLesson, content: e.target.value })}
                  className="w-full flex-1 bg-background border border-border rounded p-3 text-xs text-foreground font-mono resize-none focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingLesson(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Save Lesson Content
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Add Practice Exercise (MCQ or Coding/SQL) */}
      {showAddExerciseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div
            className={`bg-card border border-border rounded-xl p-6 w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto transition-all ${
              addExerciseMode === "bank" ? "max-w-3xl" : "max-w-xl"
            }`}
          >
            {/* Top Switcher: Create New vs Question Bank */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/80">
              <div>
                <h3 className="text-base font-bold text-foreground">Attach Practice to Lesson</h3>
                <p className="text-xs text-muted-foreground">
                  Author a new exercise or import instantly from the verified Question Bank.
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setAddExerciseMode("new")}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                    addExerciseMode === "new"
                      ? "bg-background text-foreground shadow-xs border border-border/60"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create New
                </button>
                <button
                  type="button"
                  onClick={() => setAddExerciseMode("bank")}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    addExerciseMode === "bank"
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Library className="w-3.5 h-3.5" />
                  <span>Question Bank</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 dark:bg-white/20 font-mono">
                    {QUESTION_BANK_DATA.length}
                  </span>
                </button>
              </div>
            </div>

            {addExerciseMode === "bank" ? (
              <div className="space-y-4 text-xs">
                {/* Search & Fast Filters */}
                <div className="space-y-2.5 bg-muted/40 p-3 rounded-lg border border-border">
                  <div className="relative">
                    <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5 pointer-events-none" />
                    <Input
                      value={bankSearchTerm}
                      onChange={(e) => setBankSearchTerm(e.target.value)}
                      placeholder="Fast search by keyword, concept, language, or question text..."
                      className="pl-9 pr-8 bg-background text-foreground text-xs h-9"
                    />
                    {bankSearchTerm && (
                      <button
                        type="button"
                        onClick={() => setBankSearchTerm("")}
                        className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Type Filter */}
                    <select
                      value={bankTypeFilter}
                      onChange={(e) => setBankTypeFilter(e.target.value)}
                      className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1.5 font-medium cursor-pointer"
                    >
                      <option value="all">All Types (Quiz & Coding)</option>
                      <option value="quiz">MCQ Quizzes</option>
                      <option value="coding">Coding Problems</option>
                      <option value="sql">SQL Sandboxes</option>
                    </select>

                    {/* Topic Filter */}
                    <select
                      value={bankTopicFilter}
                      onChange={(e) => setBankTopicFilter(e.target.value)}
                      className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1.5 font-medium cursor-pointer"
                    >
                      <option value="all">All Topics</option>
                      <option value="C Programming">C Programming</option>
                      <option value="Data Structures">Data Structures</option>
                      <option value="Algorithms">Algorithms</option>
                      <option value="SQL & Databases">SQL & Databases</option>
                      <option value="Operating Systems">Operating Systems</option>
                      <option value="Java OOP">Java OOP</option>
                      <option value="Python">Python</option>
                    </select>

                    {/* Difficulty Filter */}
                    <select
                      value={bankDifficultyFilter}
                      onChange={(e) => setBankDifficultyFilter(e.target.value)}
                      className="bg-background border border-border text-foreground text-xs rounded-md px-2 py-1.5 font-medium cursor-pointer"
                    >
                      <option value="all">All Difficulties</option>
                      <option value="beginner">Beginner</option>
                      <option value="intermediate">Intermediate</option>
                      <option value="advanced">Advanced</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
                  <span>
                    Found <strong className="text-foreground">{filteredQuestionBank.length}</strong> questions in bank
                  </span>
                  {(bankSearchTerm || bankTypeFilter !== "all" || bankTopicFilter !== "all" || bankDifficultyFilter !== "all") && (
                    <button
                      type="button"
                      onClick={() => {
                        setBankSearchTerm("");
                        setBankTypeFilter("all");
                        setBankTopicFilter("all");
                        setBankDifficultyFilter("all");
                      }}
                      className="text-primary hover:underline text-[11px] cursor-pointer"
                    >
                      Reset filters
                    </button>
                  )}
                </div>

                {/* Cards List */}
                <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                  {filteredQuestionBank.length === 0 ? (
                    <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground">
                      No questions matched your search criteria. Try adjusting filters.
                    </div>
                  ) : (
                    filteredQuestionBank.map((item) => {
                      const isPreviewing = previewingBankItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className="p-3.5 rounded-lg border border-border bg-background hover:border-primary/40 transition-all shadow-xs space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {item.type === "quiz" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                  MCQ
                                </span>
                              ) : item.type === "sql" ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                  SQL
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  Coding
                                </span>
                              )}
                              <h4 className="text-xs font-bold text-foreground">{item.title}</h4>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                {item.topic}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                                +{item.marks} XP
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                disabled={saving}
                                onClick={() => handleImportFromBank(item)}
                                className="h-7 text-[11px] px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Import</span>
                              </Button>
                            </div>
                          </div>

                          {/* Preview Question Text / Details */}
                          <div className="text-[11.5px] text-muted-foreground leading-relaxed">
                            {item.type === "quiz" ? (
                              <p className="line-clamp-2">{item.quizQuestion}</p>
                            ) : item.hints?.[0] ? (
                              <p className="line-clamp-2">{item.hints[0]}</p>
                            ) : (
                              <p>Includes pre-configured starter code and verification assertions.</p>
                            )}
                          </div>

                          {/* Expandable Preview Drawer */}
                          <div>
                            <button
                              type="button"
                              onClick={() => setPreviewingBankItemId(isPreviewing ? null : item.id)}
                              className="text-[10.5px] text-primary hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              {isPreviewing ? (
                                <>
                                  <ChevronUp className="w-3 h-3" />
                                  <span>Hide details</span>
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" />
                                  <span>Preview question & options / code</span>
                                </>
                              )}
                            </button>

                            {isPreviewing && (
                              <div className="mt-2 p-3 rounded bg-muted/60 border border-border text-xs space-y-2 font-mono">
                                {item.type === "quiz" ? (
                                  <div className="space-y-1 text-foreground">
                                    <p className="font-bold">{item.quizQuestion}</p>
                                    <div className="space-y-0.5 pt-1">
                                      {item.options?.map((opt, oIdx) => (
                                        <div
                                          key={oIdx}
                                          className={`px-2 py-1 rounded text-[11px] ${
                                            oIdx === item.correctAnswer
                                              ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                                              : "text-muted-foreground"
                                          }`}
                                        >
                                          {String.fromCharCode(65 + oIdx)}. {opt}{" "}
                                          {oIdx === item.correctAnswer && "✓ (Correct)"}
                                        </div>
                                      ))}
                                    </div>
                                    {item.explanation && (
                                      <p className="text-[10px] text-muted-foreground pt-1 italic font-sans">
                                        Explanation: {item.explanation}
                                      </p>
                                    )}
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 text-foreground text-[11px]">
                                    <div className="bg-slate-950 p-2 rounded text-emerald-300 overflow-x-auto max-h-32 text-[10px]">
                                      <pre>
                                        {item.starterCode?.c ||
                                          item.starterCode?.sql ||
                                          item.starterCode?.python ||
                                          item.starterCode?.java ||
                                          "// Starter code template"}
                                      </pre>
                                    </div>
                                    {item.testExpected && (
                                      <div className="text-[10.5px] text-slate-400">
                                        Expected Output: <span className="text-emerald-400">{item.testExpected}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="flex items-center justify-end pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddExerciseModal(null)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateExercise} className="space-y-4 text-xs">
                <div className="flex items-center justify-between pb-1 border-b border-border/60">
                  <span className="font-semibold text-foreground">Exercise Authoring Mode</span>
                  <button
                    type="button"
                    onClick={() => loadSampleQuestion(exerciseType)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold text-primary hover:bg-primary/10 border border-primary/30 flex items-center gap-1 cursor-pointer transition-colors"
                    title="Fill in a sample problem/question automatically"
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Pre-fill Sample</span>
                  </button>
                </div>
              <div>
                <label className="font-semibold block mb-1.5">Exercise Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setExerciseType("quiz")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      exerciseType === "quiz"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    MCQ Quiz
                  </button>
                  <button
                    type="button"
                    onClick={() => setExerciseType("sql")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      exerciseType === "sql"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    SQL Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setExerciseType("coding")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      exerciseType === "coding"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Code Practice
                  </button>
                </div>
              </div>

              {exerciseType === "quiz" ? (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Question Text</label>
                    <textarea
                      required
                      value={quizQuestion}
                      onChange={(e) => setQuizQuestion(e.target.value)}
                      rows={2}
                      placeholder="e.g. Which normal form addresses multi-valued dependencies?"
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-semibold block">Answer Options & Correct Key</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={quizCorrect === 0}
                        onChange={() => setQuizCorrect(0)}
                      />
                      <Input
                        required
                        value={quizOptA}
                        onChange={(e) => setQuizOptA(e.target.value)}
                        placeholder="Option A"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={quizCorrect === 1}
                        onChange={() => setQuizCorrect(1)}
                      />
                      <Input
                        required
                        value={quizOptB}
                        onChange={(e) => setQuizOptB(e.target.value)}
                        placeholder="Option B"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={quizCorrect === 2}
                        onChange={() => setQuizCorrect(2)}
                      />
                      <Input
                        value={quizOptC}
                        onChange={(e) => setQuizOptC(e.target.value)}
                        placeholder="Option C (Optional)"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="correct"
                        checked={quizCorrect === 3}
                        onChange={() => setQuizCorrect(3)}
                      />
                      <Input
                        value={quizOptD}
                        onChange={(e) => setQuizOptD(e.target.value)}
                        placeholder="Option D (Optional)"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Answer Explanation</label>
                    <textarea
                      value={quizExplanation}
                      onChange={(e) => setQuizExplanation(e.target.value)}
                      rows={2}
                      placeholder="Explain why the selected option is correct..."
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Challenge Title</label>
                    <Input
                      value={exerciseTitle}
                      onChange={(e) => setExerciseTitle(e.target.value)}
                      placeholder={exerciseType === "sql" ? "e.g. Query Highest Grossing Orders" : "e.g. Implement Binary Search"}
                      className="bg-background text-foreground text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Starter Code / Query Template</label>
                    <textarea
                      rows={4}
                      value={starterCode}
                      onChange={(e) => setStarterCode(e.target.value)}
                      placeholder={exerciseType === "sql" ? "SELECT * FROM customers LIMIT 10;" : "// Write function signature here"}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {exerciseType !== "sql" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold block mb-1">Test Input (stdin - Optional)</label>
                        <Input
                          value={testInput}
                          onChange={(e) => setTestInput(e.target.value)}
                          placeholder="e.g. 5"
                          className="bg-background text-foreground text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="font-semibold block mb-1">Expected Output (stdout)</label>
                        <Input
                          value={testExpected}
                          onChange={(e) => setTestExpected(e.target.value)}
                          placeholder="e.g. 15"
                          className="bg-background text-foreground text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="font-semibold block mb-1">Hint for Students</label>
                    <Input
                      value={exerciseHint}
                      onChange={(e) => setExerciseHint(e.target.value)}
                      placeholder="Optional hint to assist students..."
                      className="bg-background text-foreground text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold block mb-1">Gamification XP Award</label>
                <Input
                  type="number"
                  value={exerciseMarks}
                  onChange={(e) => setExerciseMarks(Number(e.target.value))}
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddExerciseModal(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Add Exercise
                </Button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
      {/* Modal: Edit Exercise / MCQ */}
      {editingExercise && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl max-w-lg w-full p-6 shadow-xl my-8">
            <h3 className="text-base font-bold text-foreground mb-1 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-primary" />
              <span>
                Edit {editingExercise.type === "quiz" ? "MCQ Assessment Question" : "Coding / SQL Challenge"}
              </span>
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Update challenge details, test options, starter code, or XP marks.
            </p>

            <form onSubmit={handleSaveExercise} className="space-y-4 text-xs">
              {editingExercise.type === "quiz" ? (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Question Text</label>
                    <textarea
                      required
                      value={editingExercise.quizQuestion || ""}
                      onChange={(e) =>
                        setEditingExercise({
                          ...editingExercise,
                          quizQuestion: e.target.value,
                          title: e.target.value.substring(0, 60),
                        })
                      }
                      rows={2}
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-semibold block">Answer Options & Correct Key</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCorrect"
                        checked={editingExercise.quizCorrect === 0}
                        onChange={() =>
                          setEditingExercise({ ...editingExercise, quizCorrect: 0 })
                        }
                      />
                      <Input
                        required
                        value={editingExercise.quizOptA || ""}
                        onChange={(e) =>
                          setEditingExercise({ ...editingExercise, quizOptA: e.target.value })
                        }
                        placeholder="Option A"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCorrect"
                        checked={editingExercise.quizCorrect === 1}
                        onChange={() =>
                          setEditingExercise({ ...editingExercise, quizCorrect: 1 })
                        }
                      />
                      <Input
                        required
                        value={editingExercise.quizOptB || ""}
                        onChange={(e) =>
                          setEditingExercise({ ...editingExercise, quizOptB: e.target.value })
                        }
                        placeholder="Option B"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCorrect"
                        checked={editingExercise.quizCorrect === 2}
                        onChange={() =>
                          setEditingExercise({ ...editingExercise, quizCorrect: 2 })
                        }
                      />
                      <Input
                        value={editingExercise.quizOptC || ""}
                        onChange={(e) =>
                          setEditingExercise({ ...editingExercise, quizOptC: e.target.value })
                        }
                        placeholder="Option C (Optional)"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="editCorrect"
                        checked={editingExercise.quizCorrect === 3}
                        onChange={() =>
                          setEditingExercise({ ...editingExercise, quizCorrect: 3 })
                        }
                      />
                      <Input
                        value={editingExercise.quizOptD || ""}
                        onChange={(e) =>
                          setEditingExercise({ ...editingExercise, quizOptD: e.target.value })
                        }
                        placeholder="Option D (Optional)"
                        className="bg-background text-foreground text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Answer Explanation</label>
                    <textarea
                      value={editingExercise.quizExplanation || ""}
                      onChange={(e) =>
                        setEditingExercise({
                          ...editingExercise,
                          quizExplanation: e.target.value,
                        })
                      }
                      rows={2}
                      placeholder="Explain why the selected option is correct..."
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="font-semibold block mb-1">Challenge Title</label>
                    <Input
                      value={editingExercise.title || ""}
                      onChange={(e) =>
                        setEditingExercise({ ...editingExercise, title: e.target.value })
                      }
                      className="bg-background text-foreground text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold block mb-1">Starter Code / Query Template</label>
                    <textarea
                      rows={5}
                      value={editingExercise.starterCode || ""}
                      onChange={(e) =>
                        setEditingExercise({
                          ...editingExercise,
                          starterCode: e.target.value,
                        })
                      }
                      className="w-full bg-background border border-border rounded p-2 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  {editingExercise.type !== "sql" && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-semibold block mb-1">Test Input (stdin - Optional)</label>
                        <Input
                          value={editingExercise.testInput || ""}
                          onChange={(e) =>
                            setEditingExercise({
                              ...editingExercise,
                              testInput: e.target.value,
                            })
                          }
                          placeholder="e.g. 5"
                          className="bg-background text-foreground text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="font-semibold block mb-1">Expected Output (stdout)</label>
                        <Input
                          value={editingExercise.testExpected || ""}
                          onChange={(e) =>
                            setEditingExercise({
                              ...editingExercise,
                              testExpected: e.target.value,
                            })
                          }
                          placeholder="e.g. 15"
                          className="bg-background text-foreground text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="font-semibold block mb-1">Hint for Students</label>
                    <Input
                      value={editingExercise.exerciseHint || ""}
                      onChange={(e) =>
                        setEditingExercise({
                          ...editingExercise,
                          exerciseHint: e.target.value,
                        })
                      }
                      placeholder="Optional hint..."
                      className="bg-background text-foreground text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold block mb-1">Gamification XP Award</label>
                <Input
                  type="number"
                  value={editingExercise.marks || 15}
                  onChange={(e) =>
                    setEditingExercise({
                      ...editingExercise,
                      marks: Number(e.target.value),
                    })
                  }
                  className="bg-background text-foreground text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingExercise(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold"
                >
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
