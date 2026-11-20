import { Logger } from '@nestjs/common';
import { AdminLearningService } from './admin-learning.service';

export async function seedCProgrammingCurriculum(
  adminService: AdminLearningService,
  logger: Logger,
): Promise<void> {
  try {
    logger.log('📘 Starting C Programming Fundamentals course seeding...');

    // 1. Create or retrieve the C Programming Fundamentals Course
    const course = await adminService.createCourse({
      title: 'C Programming Fundamentals',
      slug: 'c-programming-fundamentals',
      description:
        'Official Chandigarh University curriculum covering procedural programming in C, pointers, memory allocation, structures, and systems development based on standard W3Schools academic learning sequence.',
      difficulty: 'beginner',
      estimatedMinutes: 720,
      status: 'published',
    });

    if (!course) {
      logger.error('Failed to create or retrieve C Programming Fundamentals course');
      return;
    }

    // ── Module 1: Introduction to C ───────────────────────────────────────────
    const mod1 = await adminService.createModule(course.id, {
      title: 'Module 1: Introduction to C',
      description:
        'Foundational history, applications, compilation pipeline (preprocessing, compilation, assembly, linking), and structure of C programs.',
      order: 1,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l1_1 = await adminService.createLesson(mod1.id, {
      title: '1.1 Introduction and Applications of C',
      slug: 'c-intro-and-applications',
      type: 'reading',
      order: 1,
      content: `# Introduction to C Programming

C is a general-purpose, procedural computer programming language developed in 1972 by **Dennis Ritchie** at Bell Laboratories. It was designed to build the UNIX operating system and remains one of the most widely used languages in systems engineering, embedded systems, OS kernels, and performance-critical computing.

---

### Key Attributes of C
- **Procedural Language:** Programs follow a step-by-step sequence of instructions structured into functions.
- **Mid-Level Abstraction:** Combines low-level memory control (pointers, byte manipulation) with high-level readability.
- **Portability:** C source code can be compiled across diverse hardware architectures with standard ANSI/ISO compliance.
- **Efficiency:** Produces highly optimized machine binaries with minimal runtime overhead.

---

### Modern Applications of C
1. **Operating Systems:** The core kernels of Linux, macOS (Darwin), and Windows are implemented predominantly in C.
2. **Embedded Systems:** Microcontrollers, automotive control units (ECU), IoT firmware, and robotics rely on C for direct hardware access.
3. **Database Engines:** PostgreSQL, MySQL, and SQLite are written in C for deterministic speed and caching predictability.
4. **Game Engines & Graphics:** 2D/3D graphics sub-pipelines and physics systems leverage C for zero-latency execution.
`,
      learningObjectives: [
        'Understand historical origins and design philosophy of C',
        'Identify practical industry domains where C is indispensable',
      ],
    });

    const l1_2 = await adminService.createLesson(mod1.id, {
      title: '1.2 Compiler & Execution Pipeline in C',
      slug: 'c-compiler-and-execution-pipeline',
      type: 'reading',
      order: 2,
      content: `# The C Compilation & Execution Pipeline

Unlike interpreted languages (such as Python or JavaScript), C is a purely compiled language. A standard compiler like \`gcc\` or \`clang\` translates human-readable source code (\`.c\`) into machine-executable binary (\`.out\` or \`.exe\`) through four distinct phases:

\`\`\`
Source (.c) ──> Preprocessor ──> Compiler ──> Assembler ──> Linker ──> Executable Binary
\`\`\`

---

### The 4 Compilation Stages
1. **Preprocessing (\`gcc -E\`):**
   - Strips comments.
   - Expands header files included with \`#include\`.
   - Replaces macro constants defined by \`#define\`.
2. **Compilation (\`gcc -S\`):**
   - Performs lexical analysis, parsing, and syntax verification.
   - Translates preprocessed C code into assembly instructions (\`.s\`).
3. **Assembly (\`gcc -c\`):**
   - Assembles mnemonic assembly instructions into machine object code (\`.o\`).
4. **Linking (\`gcc -o\`):**
   - Combines object files with system library code (e.g., \`libc.so\` for \`printf\`).
   - Resolves external symbols and generates the final runnable executable.
`,
      learningObjectives: [
        'Describe the 4 distinct stages of compiling a C program',
        'Differentiate between object code, assembly code, and linked binary',
      ],
    });

    const l1_3 = await adminService.createLesson(mod1.id, {
      title: '1.3 Structure of a C Program & "Hello World"',
      slug: 'structure-of-c-program-hello-world',
      type: 'coding',
      order: 3,
      content: `# Structure of a C Program

Every standard C program contains the following core structural components:

\`\`\`c
#include <stdio.h> // 1. Preprocessor directive

// 2. Main entrypoint function
int main() {
    // 3. Statement execution
    printf("Hello, World!\\n");

    // 4. Return exit status (0 indicates success)
    return 0;
}
\`\`\`

### Key Elements
- \`#include <stdio.h>\`: Provides declarations for standard I/O functions.
- \`int main()\`: The mandatory starting execution point for every C binary.
- \`printf()\`: Formatted output function writing to standard output (\`stdout\`).
- \`return 0;\`: Returns status code 0 to the calling host operating system.
`,
      learningObjectives: [
        'Construct a syntactically valid C program with #include and main()',
        'Use printf() to print formatted text to stdout',
      ],
    });

    await adminService.createExercise(l1_3.id, {
      title: 'Write Your First C Program: Print Chandigarh University',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int main() {
    // Print "Welcome to Chandigarh University!" followed by a newline
    printf("Welcome to Chandigarh University!\\n");
    return 0;
}
`,
      },
      hints: ['Make sure to include \\n at the end of the printed string.'],
    });

    const l1_4 = await adminService.createLesson(mod1.id, {
      title: '1.4 Module 1 Quiz: C Fundamentals',
      slug: 'module-1-quiz-c-fundamentals',
      type: 'quiz',
      order: 4,
      passingScore: 70,
      content: 'Test your understanding of the C compilation pipeline, preprocessors, and execution flow.',
    });

    await adminService.createExercise(l1_4.id, {
      title: 'Module 1 Assessment Quiz',
      type: 'quiz',
      marks: 20,
      quizConfig: {
        questions: [
          {
            id: 'c-m1-q1',
            question: 'Which tool translates preprocessed C code into assembly instructions?',
            options: ['Compiler', 'Assembler', 'Linker', 'Loader'],
            correctAnswer: 0,
            explanation: 'The compiler performs syntactic analysis and translates preprocessed code into assembly.',
          },
          {
            id: 'c-m1-q2',
            question: 'What is the return type of the standard main() function in ISO C?',
            options: ['void', 'int', 'float', 'char*'],
            correctAnswer: 1,
            explanation: 'ISO C standards specify int main() to return exit codes to the operating system.',
          },
          {
            id: 'c-m1-q3',
            question: 'Which preprocessor directive is used to include standard header files?',
            options: ['#import', '#require', '#include', '#link'],
            correctAnswer: 2,
            explanation: '#include is the standard C preprocessor directive for header file expansion.',
          },
        ],
      },
    });

    // ── Module 2: Variables and Data Types ────────────────────────────────────
    const mod2 = await adminService.createModule(course.id, {
      title: 'Module 2: Variables and Data Types',
      description: 'Variables, constants, data types (int, float, double, char), format specifiers, and type conversion.',
      order: 2,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l2_1 = await adminService.createLesson(mod2.id, {
      title: '2.1 Variables, Constants & Format Specifiers',
      slug: 'c-variables-constants-format-specifiers',
      type: 'reading',
      order: 1,
      content: `# Variables, Constants & Format Specifiers

A variable in C is a named memory location with a declared type that specifies how many bytes are allocated and how bit patterns are interpreted.

### Primitive C Data Types & Format Specifiers
| Type | Typical Size | Format Specifier | Range / Value Description |
|---|---|---|---|
| \`int\` | 4 bytes | \`%d\` or \`%i\` | Signed integers (-2,147,483,648 to 2,147,483,647) |
| \`unsigned int\` | 4 bytes | \`%u\` | Unsigned positive integers (0 to 4,294,967,295) |
| \`float\` | 4 bytes | \`%f\` | Single-precision floating point (6-7 decimal precision) |
| \`double\` | 8 bytes | \`%lf\` | Double-precision floating point (15 decimal precision) |
| \`char\` | 1 byte | \`%c\` | Single ASCII character (-128 to 127) |

### Declaring Constants
Constants can be defined using \`const\` keyword or \`#define\` macros:
\`\`\`c
const float PI = 3.14159f;
#define MAX_BUFFER 1024
\`\`\`
`,
      learningObjectives: ['Declare and initialize primitive variables', 'Use correct format specifiers for I/O'],
    });

    const l2_2 = await adminService.createLesson(mod2.id, {
      title: '2.2 Type Conversion & Input/Output with scanf',
      slug: 'c-type-conversion-scanf-io',
      type: 'coding',
      order: 2,
      content: `# Input and Output in C

The \`scanf()\` function reads formatted input from \`stdin\`. Notice the address-of operator (\`&\`) used to write directly into variable memory addresses.

\`\`\`c
int age;
float gpa;
scanf("%d %f", &age, &gpa);
printf("Age: %d, GPA: %.2f\\n", age, gpa);
\`\`\`
`,
      learningObjectives: ['Read console input with scanf using memory addresses', 'Perform explicit and implicit casting'],
    });

    await adminService.createExercise(l2_2.id, {
      title: 'Calculate Temperature Conversion: Celsius to Fahrenheit',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int main() {
    float celsius = 25.0f;
    // Formula: F = (C * 9.0 / 5.0) + 32.0
    float fahrenheit = (celsius * 9.0f / 5.0f) + 32.0f;
    printf("Celsius: %.1f -> Fahrenheit: %.1f\\n", celsius, fahrenheit);
    return 0;
}
`,
      },
      hints: ['Remember to use floating-point numbers like 9.0f / 5.0f to avoid integer division truncation.'],
    });

    // ── Module 3: Operators ───────────────────────────────────────────────────
    const mod3 = await adminService.createModule(course.id, {
      title: 'Module 3: Operators & Bitwise Computing',
      description: 'Arithmetic, relational, logical, assignment, increment/decrement, and systems-level bitwise operations.',
      order: 3,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l3_1 = await adminService.createLesson(mod3.id, {
      title: '3.1 Bitwise Operations in Systems Programming',
      slug: 'c-bitwise-operations-systems',
      type: 'coding',
      order: 1,
      content: `# Bitwise Operations in C

C provides low-level operators that manipulate individual bits inside integral types:
- \`&\` Bitwise AND
- \`|\` Bitwise OR
- \`^\` Bitwise XOR
- \`~\` Bitwise NOT (One's complement)
- \`<<\` Left shift (multiplies by 2^n)
- \`>>\` Right shift (divides by 2^n)
`,
      learningObjectives: ['Perform bitwise masking and shifting for flags and low-level protocols'],
    });

    await adminService.createExercise(l3_1.id, {
      title: 'Check Even/Odd using Bitwise AND Operator',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int isEven(int n) {
    // If the least significant bit is 0, number is even
    return (n & 1) == 0;
}

int main() {
    int testVal = 42;
    if (isEven(testVal)) {
        printf("%d is EVEN\\n", testVal);
    } else {
        printf("%d is ODD\\n", testVal);
    }
    return 0;
}
`,
      },
      hints: ['(n & 1) tests whether the lowest bit is set.'],
    });

    // ── Module 4: Conditional Statements ──────────────────────────────────────
    const mod4 = await adminService.createModule(course.id, {
      title: 'Module 4: Conditional Statements & Decision Making',
      description: 'if, if-else, nested if-else, switch-case branching, and conditional ternary operators.',
      order: 4,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l4_1 = await adminService.createLesson(mod4.id, {
      title: '4.1 Decision Logic with Switch-Case',
      slug: 'c-switch-case-decision-logic',
      type: 'coding',
      order: 1,
      content: `# Switch-Case Branching

\`switch\` evaluates integral expressions and transfers execution to matching \`case\` labels. Always remember \`break\` to prevent unintended fall-through.
`,
      learningObjectives: ['Implement multi-branch decision logic efficiently with switch-case'],
    });

    await adminService.createExercise(l4_1.id, {
      title: 'Arithmetic Calculator using Switch Case',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int main() {
    char op = '+';
    int a = 15, b = 27;
    int result = 0;

    switch (op) {
        case '+': result = a + b; break;
        case '-': result = a - b; break;
        case '*': result = a * b; break;
        case '/': result = b != 0 ? a / b : 0; break;
        default: printf("Unknown operator\\n"); return 1;
    }

    printf("%d %c %d = %d\\n", a, op, b, result);
    return 0;
}
`,
      },
      hints: ['Always include break; after every case to prevent fallthrough.'],
    });

    // ── Module 5: Loops ───────────────────────────────────────────────────────
    const mod5 = await adminService.createModule(course.id, {
      title: 'Module 5: Loops & Iterations',
      description: 'for loops, while loops, do-while loops, break/continue statements, and nested loop patterns.',
      order: 5,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l5_1 = await adminService.createLesson(mod5.id, {
      title: '5.1 Nested Loop Patterns',
      slug: 'c-nested-loop-patterns',
      type: 'coding',
      order: 1,
      content: `# Nested Loop Patterns in C

Nested loops allow iteration across rows and columns. They are foundational for matrix operations, graphics buffers, and combinatorial algorithms.
`,
      learningObjectives: ['Construct nested loops for 2D coordinate traversals'],
    });

    await adminService.createExercise(l5_1.id, {
      title: 'Print Half Pyramid Pattern of Stars',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int main() {
    int rows = 5;
    for (int i = 1; i <= rows; ++i) {
        for (int j = 1; j <= i; ++j) {
            printf("* ");
        }
        printf("\\n");
    }
    return 0;
}
`,
      },
      hints: ['Outer loop runs from 1 to rows; inner loop runs from 1 to current row index.'],
    });

    // ── Module 6: Arrays and Strings ──────────────────────────────────────────
    const mod6 = await adminService.createModule(course.id, {
      title: 'Module 6: Arrays and Strings',
      description: '1D arrays, multi-dimensional matrices, null-terminated strings, and string.h library functions.',
      order: 6,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l6_1 = await adminService.createLesson(mod6.id, {
      title: '6.1 Array Memory Layout & Linear Search',
      slug: 'c-array-memory-linear-search',
      type: 'coding',
      order: 1,
      content: `# Arrays in C

An array is a collection of elements of the same data type stored in contiguous memory locations. Indexing is zero-based: \`array[0]\` is at the base address.
`,
      learningObjectives: ['Traverse contiguous array elements in memory', 'Implement searching routines'],
    });

    await adminService.createExercise(l6_1.id, {
      title: 'Find Maximum Element in an Array',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int findMax(int arr[], int n) {
    int max = arr[0];
    for (int i = 1; i < n; ++i) {
        if (arr[i] > max) {
            max = arr[i];
        }
    }
    return max;
}

int main() {
    int data[] = {12, 45, 78, 23, 89, 56, 34};
    int size = sizeof(data) / sizeof(data[0]);
    printf("Max value: %d\\n", findMax(data, size));
    return 0;
}
`,
      },
      hints: ['Initialize max with arr[0] and iterate through the rest of the array.'],
    });

    // ── Module 7: Functions ───────────────────────────────────────────────────
    const mod7 = await adminService.createModule(course.id, {
      title: 'Module 7: Functions & Recursion',
      description: 'Declaration, definition, call-by-value, stack frames, and recursive problem solving.',
      order: 7,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l7_1 = await adminService.createLesson(mod7.id, {
      title: '7.1 Recursive Functions & The Call Stack',
      slug: 'c-recursive-functions-call-stack',
      type: 'coding',
      order: 1,
      content: `# Recursion in C

A function that calls itself is recursive. Every recursive function must have:
1. **Base Case:** Condition where recursion terminates without further self-calls.
2. **Recursive Step:** Progresses toward the base case with reduced subproblems.
`,
      learningObjectives: ['Write correct base cases to avoid stack overflow', 'Trace recursive call frames'],
    });

    await adminService.createExercise(l7_1.id, {
      title: 'Calculate Factorial using Recursion',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

long long factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    int n = 7;
    printf("Factorial of %d = %lld\\n", n, factorial(n));
    return 0;
}
`,
      },
      hints: ['Base case is n <= 1 returning 1.'],
    });

    // ── Module 8: Pointers ────────────────────────────────────────────────────
    const mod8 = await adminService.createModule(course.id, {
      title: 'Module 8: Pointers & Address Arithmetic',
      description: 'Pointer fundamentals, address-of (&), dereference (*), pointer arithmetic, arrays as pointers, and pass-by-reference.',
      order: 8,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l8_1 = await adminService.createLesson(mod8.id, {
      title: '8.1 Pass-by-Reference with Pointers',
      slug: 'c-pass-by-reference-pointers',
      type: 'coding',
      order: 1,
      content: `# Pass-by-Reference in C

C strictly passes parameters by value. To modify variables in caller stack frames, we pass memory addresses (\`&var\`) and dereference them inside the function (\`*ptr\`).
`,
      learningObjectives: ['Understand memory addresses and pointer variables', 'Swap variables in-place via pointer dereferencing'],
    });

    await adminService.createExercise(l8_1.id, {
      title: 'Swap Two Variables using Pointers',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>

void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}

int main() {
    int x = 100, y = 200;
    printf("Before: x=%d, y=%d\\n", x, y);
    swap(&x, &y);
    printf("After: x=%d, y=%d\\n", x, y);
    return 0;
}
`,
      },
      hints: ['Pass &x and &y to the function; use *a and *b to dereference and swap.'],
    });

    // ── Module 9: Structures and Unions ───────────────────────────────────────
    const mod9 = await adminService.createModule(course.id, {
      title: 'Module 9: Structures and Unions',
      description: 'Defining structs, arrow operator (->), typedef, nested structures, unions, and memory alignment.',
      order: 9,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l9_1 = await adminService.createLesson(mod9.id, {
      title: '9.1 Student Record Management with Structs',
      slug: 'c-student-records-structs',
      type: 'coding',
      order: 1,
      content: `# Structures in C

A \`struct\` is a composite type that groups variables of diverse types under a single name. When working with struct pointers, use the arrow operator (\`->\`).
`,
      learningObjectives: ['Define composite structured types', 'Access struct fields via direct (.) and indirect (->) operators'],
    });

    await adminService.createExercise(l9_1.id, {
      title: 'Define and Print a Student Record Struct',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>

typedef struct {
    int rollNumber;
    char name[50];
    float gpa;
} Student;

void printStudent(const Student *s) {
    printf("Roll: %d | Name: %s | GPA: %.2f\\n", s->rollNumber, s->name, s->gpa);
}

int main() {
    Student s1 = {101, "Aarav Sharma", 3.85f};
    printStudent(&s1);
    return 0;
}
`,
      },
      hints: ['Use s->rollNumber to access fields through a pointer.'],
    });

    // ── Module 10: Memory and File Handling ───────────────────────────────────
    const mod10 = await adminService.createModule(course.id, {
      title: 'Module 10: Dynamic Memory & File Handling',
      description: 'Heap allocation with malloc, calloc, realloc, freeing memory, and disk file I/O streams.',
      order: 10,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l10_1 = await adminService.createLesson(mod10.id, {
      title: '10.1 Dynamic Memory Allocation with malloc & free',
      slug: 'c-dynamic-memory-malloc-free',
      type: 'coding',
      order: 1,
      content: `# Dynamic Memory Management

Dynamic memory is allocated on the **Heap** at runtime:
- \`malloc(size)\`: Allocates uninitialized memory bytes.
- \`calloc(n, size)\`: Allocates zero-initialized memory.
- \`realloc(ptr, newSize)\`: Resizes an existing heap allocation.
- \`free(ptr)\`: Returns memory back to the heap to prevent memory leaks.
`,
      learningObjectives: ['Allocate dynamic arrays on heap memory', 'Safely release memory with free() to avoid leaks'],
    });

    await adminService.createExercise(l10_1.id, {
      title: 'Allocate and Sum Dynamic Integer Array on Heap',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 5;
    int *arr = (int*) malloc(n * sizeof(int));
    if (arr == NULL) {
        printf("Memory allocation failed\\n");
        return 1;
    }

    int sum = 0;
    for (int i = 0; i < n; ++i) {
        arr[i] = (i + 1) * 10;
        sum += arr[i];
    }

    printf("Sum of dynamic array: %d\\n", sum);
    free(arr); // Always free allocated memory
    return 0;
}
`,
      },
      hints: ['Always check if the pointer is NULL after malloc and call free(arr) before exit.'],
    });

    // ── Module 11: Practical Programming ──────────────────────────────────────
    const mod11 = await adminService.createModule(course.id, {
      title: 'Module 11: Practical Programming Problems',
      description: 'Industry-level problems: prime number checking, string palindromes, array reversal, and binary search.',
      order: 11,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l11_1 = await adminService.createLesson(mod11.id, {
      title: '11.1 Palindrome Verification in C',
      slug: 'c-palindrome-verification',
      type: 'coding',
      order: 1,
      content: `# String Palindrome Verification

A palindrome reads the same forwards and backwards (e.g. "radar", "level").
`,
      learningObjectives: ['Use two-pointer technique on character arrays'],
    });

    await adminService.createExercise(l11_1.id, {
      title: 'Verify Palindrome String in C',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>
#include <string.h>
#include <stdbool.h>

bool isPalindrome(const char *str) {
    int left = 0;
    int right = strlen(str) - 1;
    while (left < right) {
        if (str[left] != str[right]) return false;
        left++;
        right--;
    }
    return true;
}

int main() {
    const char *word = "radar";
    if (isPalindrome(word)) {
        printf("'%s' is a PALINDROME\\n", word);
    } else {
        printf("'%s' is NOT a palindrome\\n", word);
    }
    return 0;
}
`,
      },
      hints: ['Initialize left at 0 and right at strlen(str) - 1, then compare characters towards center.'],
    });

    // ── Module 12: Revision and Final Assessment ──────────────────────────────
    const mod12 = await adminService.createModule(course.id, {
      title: 'Module 12: Revision & Final Certification Examination',
      description: 'Comprehensive theoretical revision, final MCQ examination, and coding proficiency assessment.',
      order: 12,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
    });

    const l12_1 = await adminService.createLesson(mod12.id, {
      title: '12.1 Final Theory Revision Summary',
      slug: 'c-final-theory-revision',
      type: 'reading',
      order: 1,
      content: `# C Programming Mastery Revision Guide

Review these core architectural concepts before taking your final examination:
1. **Compilation Stages:** Preprocessing (\`#\`), Compilation (AST -> Assembly), Assembly (Object \`.o\`), Linking (Libraries).
2. **Pointers & Addresses:** \`&x\` yields address, \`*p\` dereferences value. Arrays decay to pointers to their first element.
3. **Dynamic Memory:** \`malloc\` allocates raw bytes, \`calloc\` zero-initializes, \`free\` releases heap memory.
4. **Structures & Alignment:** \`struct\` packs fields according to memory word alignment rules.
`,
      learningObjectives: ['Review full C programming syllabus for certification exam'],
    });

    const l12_2 = await adminService.createLesson(mod12.id, {
      title: '12.2 Final Certification Examination: C Programming',
      slug: 'c-final-certification-examination-mcq',
      type: 'quiz',
      order: 2,
      passingScore: 70,
      content: 'Chandigarh University Official Final Examination for C Programming Fundamentals Credential.',
    });

    await adminService.createExercise(l12_2.id, {
      title: 'Final Examination: C Programming MCQ',
      type: 'quiz',
      marks: 50,
      quizConfig: {
        questions: [
          {
            id: 'c-final-q1',
            question: 'What is the output of sizeof(char) in standard C on all platforms?',
            options: ['1', '2', '4', 'Implementation defined'],
            correctAnswer: 0,
            explanation: 'In the ISO C standard, sizeof(char) is guaranteed to be exactly 1 byte.',
          },
          {
            id: 'c-final-q2',
            question: 'Which operator is used to access members of a structure through a pointer?',
            options: ['.', '->', '*', '&'],
            correctAnswer: 1,
            explanation: 'The arrow operator (->) dereferences the pointer and accesses the structure member in one step.',
          },
          {
            id: 'c-final-q3',
            question: 'What does malloc() return when the requested memory cannot be allocated?',
            options: ['0', 'NULL', '-1', 'Throws bad_alloc exception'],
            correctAnswer: 1,
            explanation: 'When heap allocation fails, malloc returns a NULL pointer.',
          },
          {
            id: 'c-final-q4',
            question: 'What is the format specifier for printing double precision floating point in printf?',
            options: ['%f', '%lf', '%d', '%e'],
            correctAnswer: 0,
            explanation: 'In printf, float arguments are promoted to double, so %f prints doubles (in scanf, %lf is strictly required).',
          },
          {
            id: 'c-final-q5',
            question: 'What is a dangling pointer in C?',
            options: [
              'A pointer initialized to NULL',
              'A pointer that points to a deallocated memory address',
              'A pointer to a function',
              'A pointer with void type',
            ],
            correctAnswer: 1,
            explanation: 'A dangling pointer still points to a memory address after that memory has been freed.',
          },
        ],
      },
    });

    // ── 2. Create the Learning Path for C Programming ─────────────────────────
    const cPath = await adminService.createPath({
      title: 'C Programming Mastery',
      slug: 'c-programming-mastery',
      description:
        'Official Chandigarh University foundational curriculum in C: from memory architecture and pointers to dynamic memory management, data structures, and verified credentials.',
      difficulty: 'beginner',
      estimatedHours: 32,
      tags: ['C', 'Systems Programming', 'Pointers', 'Memory Management', 'CS Core', 'Algorithms'],
      status: 'published',
      courseIds: [course.id],
    });

    if (cPath) {
      await adminService.publishPath(cPath.id);
      logger.log(`✅ C Programming Mastery Learning Path published: ${cPath.id}`);
    }

    logger.log('🎉 C Programming Fundamentals course & 12 modules seeded and published successfully!');
  } catch (err: any) {
    logger.error(`Error seeding C programming curriculum: ${err?.message}`, err?.stack);
  }
}
