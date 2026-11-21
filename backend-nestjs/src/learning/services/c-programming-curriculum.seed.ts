import { Logger } from '@nestjs/common';
import { AdminLearningService } from './admin-learning.service';

/**
 * CodeSkill University Curriculum: C Programming Foundations & Problem-Solving Certification
 * Standard: ISO/IEC 9899 (C11/C17)
 * Complete 10-Module Certification Curriculum with verified hands-on sandboxes and assessments.
 */
export async function seedCProgrammingCurriculum(
  adminService: AdminLearningService,
  logger: Logger,
): Promise<void> {
  try {
    logger.log('📘 Starting C Programming Foundations & Problem-Solving Certification seeding...');

    // ── 1. Create or Update Course ───────────────────────────────────────────
    const course = await adminService.createCourse({
      title: 'C Programming Foundations & Problem-Solving Certification',
      slug: 'c-programming-fundamentals',
      description:
        'Comprehensive university-grade certification curriculum in C (C11/C17): from compilation pipelines and low-level memory architecture to pointers, data structures, and production capstone projects.',
      difficulty: 'beginner',
      estimatedMinutes: 960,
      status: 'published',
    });

    if (!course) {
      logger.error('Failed to create or retrieve C Programming Certification course');
      return;
    }

    // Clean up any legacy or duplicate modules to guarantee exactly the 10 canonical certification modules
    await adminService.cleanupLegacyModules(course.id, [
      'Module 1: Introduction to C Programming',
      'Module 2: Variables, Data Types & Operators',
      'Module 3: Decision Making & Iterations',
      'Module 4: Arrays & Null-Terminated Strings',
      'Module 5: Functions & Recursion Architecture',
      'Module 6: Pointers & Dynamic Memory Architecture',
      'Module 7: Structures, Unions & File I/O',
      'Module 8: Advanced C Systems Programming',
      'Module 9: Problem Solving & Core Data Structures',
      'Module 10: Capstone Project & Final Certification Exam',
    ]);

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 1: Introduction to C Programming
    // ═════════════════════════════════════════════════════════════════════════
    const mod1 = await adminService.createModule(course.id, {
      title: 'Module 1: Introduction to C Programming',
      description:
        'Foundational history, applications, compilation pipeline (preprocessing, compilation, assembly, linking), program anatomy, and standard I/O.',
      order: 1,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l1_1 = await adminService.createLesson(mod1.id, {
      title: '1.1 History, Architecture & Execution Pipeline of C',
      slug: 'c-history-architecture-execution-pipeline',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Trace the origins of C from Bell Labs to ISO C11/C17 standards.',
        'Deconstruct the 4 phases of the GCC/Clang compilation pipeline.',
        'Understand the structure of a standard C program.',
      ],
      content: `# History, Architecture & The C Execution Pipeline

## 1. Origins & Impact
Created in **1972 by Dennis Ritchie** at Bell Laboratories to implement the UNIX operating system, C remains the bedrock of modern computing. C combines the high-level readability of structured languages with the hardware-level control of assembly code.

---

## 2. The 4-Phase Compilation Pipeline
When you execute \`gcc main.c -o main\`, the compiler translates human-readable source code into native machine instructions across four stages:

1. **Preprocessing (\`gcc -E\`):**
   - Strips comments.
   - Expands header files (e.g., replaces \`#include <stdio.h>\` with standard library declarations).
   - Evaluates macro replacements (\`#define\`) and conditional preprocessor flags (\`#ifdef\`).
2. **Compilation (\`gcc -S\`):**
   - Analyzes lexical tokens, syntax, and semantics.
   - Generates intermediate representation and converts C code into target-specific assembly code (\`main.s\`).
3. **Assembly (\`gcc -c\`):**
   - Assembles assembly mnemonic instructions into relocatable binary machine code (\`main.o\`).
4. **Linking (\`gcc -o\`):**
   - Resolves external references, connects runtime startup code (\`crt0\`), and links precompiled static/dynamic libraries (such as libc) into an executable binary.

---

## 3. Structure of a Canonical C Program
\`\`\`c
#include <stdio.h>

int main(void) {
    // printf outputs formatted strings to stdout
    printf("CodeSkill C Certification\\n");
    return 0; // Exit status 0 indicates successful execution
}
\`\`\`

A standard C program is organized into three primary architectural parts:

- **Standard Header Inclusion:** Includes the standard input/output header (\`#include <stdio.h>\`) which provides foundational declarations for stream I/O functions like \`printf()\`.
- **Primary Program Entry Point:** The function \`int main(void)\` represents the mandatory entry point where program execution initiates upon invocation by the operating system runtime.
- **Exit Code Transmission:** The statement \`return 0;\` communicates directly to the operating system kernel that the program terminated cleanly and successfully.

---

## 4. Common Errors & Debugging
- **Missing Semicolon (\`;\`):** The compiler treats statements as continuous tokens until a semicolon is encountered.
- **Undefined Reference to \`main\`:** Occurs during the linking stage if the entry point identifier is misspelled (e.g. \`Main\` or \`mian\`).
- **Ignoring Return Codes:** Always return \`0\` on success; non-zero values communicate error codes to UNIX scripts.

---

## 5. Short Revision Notes
- C is statically typed, compiled, procedural, and standardized under ISO/IEC 9899.
- Compilation sequence: **Source (.c) → Preprocessor (.i) → Compiler (.s) → Assembler (.o) → Linker (Executable)**.`,
    });

    await adminService.createExercise(l1_1.id, {
      title: 'Lab 1.1: Hello CodeSkill Formatted Output',
      type: 'coding',
      order: 1,
      marks: 10,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n\nint main(void) {\n    // Print "Hello, CodeSkill Engineers!" followed by a newline\n    \n    return 0;\n}\n',
      },
      hints: ['Use printf("Hello, CodeSkill Engineers!\\n");'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'Hello, CodeSkill Engineers!\n',
          },
        ],
      },
    });

    await adminService.createExercise(l1_1.id, {
      title: 'Knowledge Check: Compilation Pipeline',
      type: 'quiz',
      order: 2,
      marks: 10,
      isMandatory: true,
      quizConfig: {
        questions: [
          {
            id: 'c-m1-q1',
            question: 'Which stage of the C compilation pipeline expands header files (#include) and evaluates macros (#define)?',
            options: ['Compilation', 'Preprocessing', 'Assembly', 'Linking'],
            correctAnswer: 1,
            explanation: 'The Preprocessor handles directives beginning with # before source code is parsed for syntax.',
          },
          {
            id: 'c-m1-q2',
            question: 'What is the role of the Linker in C?',
            options: [
              'Converts assembly code into machine object files',
              'Combines relocatable object code with library routines into an executable',
              'Removes comments from the source file',
              'Checks type safety in function headers',
            ],
            correctAnswer: 1,
            explanation: 'The linker resolves external symbols and attaches library binaries into a runnable program.',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 2: Variables, Data Types and Operators
    // ═════════════════════════════════════════════════════════════════════════
    const mod2 = await adminService.createModule(course.id, {
      title: 'Module 2: Variables, Data Types & Operators',
      description:
        'Memory layouts of fundamental types (int, float, double, char), format specifiers, type conversion, operator precedence, and bitwise manipulation.',
      order: 2,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l2_1 = await adminService.createLesson(mod2.id, {
      title: '2.1 Data Types, Format Specifiers & Bitwise Logic',
      slug: 'c-data-types-format-specifiers-bitwise',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Understand storage sizes: char (1B), int (4B), float (4B), double (8B).',
        'Master format specifiers: %d, %f, %lf, %c, %s, %p, %x.',
        'Utilize bitwise operators: &, |, ^, ~, <<, >> for systems programming.',
      ],
      content: `# Variables, Data Types & Bitwise Operators

## 1. Fundamental Primitive Types & Memory Layout
In C, every variable corresponds to an exact allocation in computer memory:

| Type | Typical Size | Format Specifier | Range |
| :--- | :--- | :--- | :--- |
| \`char\` | 1 byte (8 bits) | \`%c\` or \`%d\` | -128 to 127 (or 0 to 255 unsigned) |
| \`int\` | 4 bytes (32 bits) | \`%d\` or \`%i\` | -2,147,483,648 to 2,147,483,647 |
| \`float\` | 4 bytes (IEEE 754) | \`%f\` | ~6-7 decimal digits of precision |
| \`double\` | 8 bytes (IEEE 754) | \`%lf\` (scanf) / \`%f\` | ~15-17 decimal digits of precision |
| \`void*\` | 4 or 8 bytes | \`%p\` | Memory address pointer |

---

## 2. Bitwise Operators in Systems Programming
C provides direct bit-level manipulation operators:
- **Bitwise AND (\`&\`)**: Masking and clearing specific bits.
- **Bitwise OR (\`|\`)**: Setting specific flags or registers.
- **Bitwise XOR (\`^\`)**: Toggling bits; in-place value swapping without temporary variables.
- **Bitwise NOT (\`~\`)**: Inverting all bits (one's complement).
- **Left Shift (\`<< n\`)**: Multiplying integers by $2^n$ rapidly.
- **Right Shift (\`>> n\`)**: Dividing integers by $2^n$ rapidly.

\`\`\`c
#include <stdio.h>

int main(void) {
    unsigned char flags = 0b00000100; // Bit 2 set
    flags |= (1 << 3);  // Set bit 3 -> 0b00001100
    printf("Result: %u\\n", flags);
    return 0;
}
\`\`\`

---

## 3. Common Pitfalls
- **Integer Division Truncation:** \`5 / 2\` produces \`2\`, not \`2.5\`. Cast operands: \`((double)5) / 2\`.
- **Buffer Overflow with scanf():** Using \`scanf("%s", buffer)\` without bounds limits allows buffer overflows. Use \`scanf("%19s", buffer)\` or \`fgets()\`.`,
    });

    await adminService.createExercise(l2_1.id, {
      title: 'Lab 2.1: Bitwise Fast Multiplication & Power of Two',
      type: 'coding',
      order: 1,
      marks: 15,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n\nint main(void) {\n    int n = 8;\n    // Print 1 if n is a power of 2 using bitwise AND, else 0\n    int isPowerOfTwo = (n > 0) && ((n & (n - 1)) == 0);\n    printf("%d\\n", isPowerOfTwo);\n    return 0;\n}\n',
      },
      hints: ['A power of two in binary has exactly one bit set: n & (n - 1) == 0'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: '1\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 3: Decision Making and Loops
    // ═════════════════════════════════════════════════════════════════════════
    const mod3 = await adminService.createModule(course.id, {
      title: 'Module 3: Decision Making & Iterations',
      description:
        'Control flow logic: if-else ladders, switch-case jump tables, for loops, while loops, do-while loops, and nested algorithmic patterns.',
      order: 3,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l3_1 = await adminService.createLesson(mod3.id, {
      title: '3.1 Conditional Branching & Loop Construct Invariants',
      slug: 'c-branching-and-loop-invariants',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Master boolean evaluation in C (0 is false, non-zero is true).',
        'Implement structured switch-case statements with break guarantees.',
        'Construct deterministic loops and optimize nested matrix traversals.',
      ],
      content: `# Decision Making & Loops in C

## 1. Truth in C
Unlike modern languages with native booleans, C historically treats:
- \`0\` as **FALSE**.
- Any non-zero numeric value (e.g. \`1\`, \`-42\`, \`0xFF\`) as **TRUE**.
- (C99 introduced \`<stdbool.h>\` defining \`bool\`, \`true\`, and \`false\`).

---

## 2. The switch-case Construct & Fallthrough
The \`switch\` expression evaluates to an integer or character and jumps directly to the matching \`case\` label via an internal compiler jump table:

\`\`\`c
switch (op) {
    case '+': result = a + b; break;
    case '-': result = a - b; break;
    case '*': result = a * b; break;
    case '/': 
        if (b != 0) result = a / b; 
        break;
    default:
        fprintf(stderr, "Unknown operator\\n");
}
\`\`\`
*Always include \`break\` to prevent unintended fallthrough into consecutive case blocks.*

---

## 3. Loop Constructs Compared
- **Count-Controlled Loop (\`for\`):** Ideal for index-based, bounded traversals with predetermined loop counts and explicit iteration counters.
- **Pre-Tested Conditional Loop (\`while\`):** Evaluates the loop condition prior to execution; iterates zero or more times until the condition evaluates to false.
- **Post-Tested Conditional Loop (\`do-while\`):** Evaluates the condition after the block body executes; guaranteed to run **at least once** before evaluating continuation.`,
    });

    await adminService.createExercise(l3_1.id, {
      title: 'Lab 3.1: Prime Number Verification Sandbox',
      type: 'coding',
      order: 1,
      marks: 15,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n\nint is_prime(int n) {\n    if (n <= 1) return 0;\n    for (int i = 2; i * i <= n; i++) {\n        if (n % i == 0) return 0;\n    }\n    return 1;\n}\n\nint main(void) {\n    printf("29: %s\\n", is_prime(29) ? "PRIME" : "COMPOSITE");\n    printf("30: %s\\n", is_prime(30) ? "PRIME" : "COMPOSITE");\n    return 0;\n}\n',
      },
      hints: ['Test divisors up to sqrt(n) for O(sqrt(n)) time complexity.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: '29: PRIME\n30: COMPOSITE\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 4: Arrays and Strings
    // ═════════════════════════════════════════════════════════════════════════
    const mod4 = await adminService.createModule(course.id, {
      title: 'Module 4: Arrays & Null-Terminated Strings',
      description:
        'Contiguous memory allocation, row-major multi-dimensional matrices, C-string null terminators (\\0), and string.h library algorithms.',
      order: 4,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l4_1 = await adminService.createLesson(mod4.id, {
      title: '4.1 Arrays, Cache Locality & String Manipulation',
      slug: 'c-arrays-cache-locality-strings',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Understand contiguous memory allocation and zero-indexed array indexing.',
        'Explain C-strings as null-terminated character arrays (\'\\0\').',
        'Safely utilize strlen, strcpy, strcmp, and strncpy.',
      ],
      content: `# Arrays & Strings in C

## 1. Contiguous Memory Allocation
An array in C is a homogeneous sequence of elements stored in **contiguous memory locations**. If an \`int\` array starts at byte \`0x1000\`, element \`arr[i]\` resides at:
$$\\text{Address}(arr[i]) = \\text{BaseAddress} + (i \\times \\text{sizeof}(int))$$

Because elements are contiguous, arrays exhibit **spatial locality of reference**, allowing CPU hardware prefetchers to cache consecutive elements with minimal cache misses.

---

## 2. Null-Terminated C-Strings
In C, there is no high-level \`string\` class. A string is an array of characters ending with the null sentinel character **\`'\\0'\`** (ASCII value 0):

\`\`\`c
char greeting[] = "Hello"; 
// Memory layout: ['H', 'e', 'l', 'l', 'o', '\\0'] (6 bytes total)
\`\`\`

---

## 3. Essential String Library Functions
- **String Length (\`strlen\`):** Computes and returns the exact number of characters preceding the terminating null character (\`'\\0'\`).
- **Lexicographical Comparison (\`strcmp\`):** Performs byte-by-byte lexicographical evaluation. Returns 0 if identical, a negative integer if the first string precedes the second, and a positive integer otherwise.
- **Bounded Buffer Copy (\`strncpy\`):** Safely copies up to $n$ characters from source to destination buffer, preventing buffer overflow vulnerabilities in systems software.`,
    });

    await adminService.createExercise(l4_1.id, {
      title: 'Lab 4.1: In-Place String Reversal Algorithm',
      type: 'coding',
      order: 1,
      marks: 20,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n#include <string.h>\n\nvoid reverse_string(char str[]) {\n    int i = 0;\n    int j = strlen(str) - 1;\n    while (i < j) {\n        char temp = str[i];\n        str[i] = str[j];\n        str[j] = temp;\n        i++;\n        j--;\n    }\n}\n\nint main(void) {\n    char word[] = "CodeSkill";\n    reverse_string(word);\n    printf("%s\\n", word);\n    return 0;\n}\n',
      },
      hints: ['Use two pointers (one at 0, one at length - 1) and swap characters in-place.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'llikSEdoC\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 5: Functions and Recursion
    // ═════════════════════════════════════════════════════════════════════════
    const mod5 = await adminService.createModule(course.id, {
      title: 'Module 5: Functions & Recursion Architecture',
      description:
        'Stack frames, activation records, pass-by-value vs pass-by-reference semantics, storage classes (auto, static, extern), and recursive base cases.',
      order: 5,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l5_1 = await adminService.createLesson(mod5.id, {
      title: '5.1 Call Stack Dynamics & Recursive Functions',
      slug: 'c-call-stack-and-recursion',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Understand call stack frames: return addresses, local variables, and saved registers.',
        'Distinguish pass-by-value from simulating pass-by-reference with memory addresses.',
        'Formulate recursive base cases to avoid stack overflow errors.',
      ],
      content: `# Functions & The Call Stack in C

## 1. Stack Frames & Activation Records
When a C function is invoked, the compiler allocates a new **stack frame** containing:
1. Return address in the caller code.
2. Function parameter values.
3. Local variables scoped to the function.

When the function executes \`return\`, its frame is popped from the stack and memory is instantly reclaimed.

---

## 2. Pass-by-Value vs. Simulating Pass-by-Reference
In C, **all parameters are passed strictly by value** (a copy of the argument is pushed to the stack frame). To modify variables in caller scope, we pass the variable's **memory address** (\`&var\`) and dereference it:

\`\`\`c
void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}
\`\`\`

---

## 3. Recursion & Base Conditions
Every recursive algorithm requires:
1. **Base Case:** The terminating condition that returns without further recursive calls.
2. **Recursive Step:** Progressing towards the base case with reduced subproblems.

Without a valid base case, recursive calls consume stack frames until a **Stack Overflow (SIGSEGV)** crash occurs.`,
    });

    await adminService.createExercise(l5_1.id, {
      title: 'Lab 5.1: Euclidean Greatest Common Divisor (GCD) via Recursion',
      type: 'coding',
      order: 1,
      marks: 20,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n\nint gcd(int a, int b) {\n    if (b == 0) return a;\n    return gcd(b, a % b);\n}\n\nint main(void) {\n    printf("GCD(48, 18) = %d\\n", gcd(48, 18));\n    return 0;\n}\n',
      },
      hints: ['Euclidean algorithm: gcd(a, b) = gcd(b, a % b) with base case b == 0'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'GCD(48, 18) = 6\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 6: Pointers and Dynamic Memory
    // ═════════════════════════════════════════════════════════════════════════
    const mod6 = await adminService.createModule(course.id, {
      title: 'Module 6: Pointers & Dynamic Memory Architecture',
      description:
        'Direct memory addressing, address-of (&), dereference (*), pointer arithmetic, heap allocation with malloc/calloc/realloc/free, and memory leak prevention.',
      order: 6,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l6_1 = await adminService.createLesson(mod6.id, {
      title: '6.1 Pointers, Address Arithmetic & Heap Memory Management',
      slug: 'c-pointers-address-arithmetic-heap-memory',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Understand memory addresses and the relationship between pointers and arrays.',
        'Perform byte-aligned pointer arithmetic.',
        'Allocate and free heap memory safely using malloc(), calloc(), realloc(), and free().',
      ],
      content: `# Pointers & Dynamic Heap Memory in C

## 1. What is a Pointer?
A pointer is a variable whose value is the **memory address** of another variable.
- **Address-of operator (\`&\`)**: Retrieves the memory address where a variable is stored.
- **Dereference operator (\`*\`)**: Accesses the value residing at the address pointed to.

\`\`\`c
int x = 42;
int *ptr = &x; // ptr points to memory address of x
*ptr = 100;    // Modifies x to 100
\`\`\`

---

## 2. Dynamic Memory Management: Stack vs. Heap
- **Stack:** Fast, automated memory management with fixed size bounded by OS limits.
- **Heap:** Dynamic, runtime-resizable pool of memory allocated explicitly by the programmer.

### Core Heap Memory Functions
1. **Raw Memory Allocation (\`malloc\`):** Allocates a contiguous block of uninitialized raw bytes. Returns \`NULL\` if heap memory is exhausted.
2. **Zero-Cleared Allocation (\`calloc\`):** Allocates memory for multiple elements and automatically clears every byte to zero (\`0\`).
3. **Buffer Resizing (\`realloc\`):** Resizes an active heap allocation in-place or copies content to an expanded contiguous block.
4. **Memory Deallocation (\`free\`):** Releases previously allocated memory back to the operating system heap manager to prevent memory leaks.

---

## 3. Golden Rule of Dynamic Memory
*For every call to \`malloc()\`, \`calloc()\`, or \`realloc()\`, there must be exactly one corresponding call to \`free()\` to prevent memory leaks.*`,
    });

    await adminService.createExercise(l6_1.id, {
      title: 'Lab 6.1: Dynamic Heap Array Allocation with malloc() and free()',
      type: 'coding',
      order: 1,
      marks: 25,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    int n = 5;\n    int *arr = (int *)malloc(n * sizeof(int));\n    if (arr == NULL) return 1;\n    \n    for (int i = 0; i < n; i++) {\n        arr[i] = (i + 1) * 10;\n    }\n    \n    for (int i = 0; i < n; i++) {\n        printf("%d ", arr[i]);\n    }\n    printf("\\n");\n    \n    free(arr);\n    return 0;\n}\n',
      },
      hints: ['Allocate heap memory with malloc, populate, print, and always free.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: '10 20 30 40 50 \n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 7: Structures, Unions and File Handling
    // ═════════════════════════════════════════════════════════════════════════
    const mod7 = await adminService.createModule(course.id, {
      title: 'Module 7: Structures, Unions & File I/O',
      description:
        'Composite records with struct, padding/alignment, arrow (->) operator, typedef, unions, disk stream handling (fopen, fclose, fprintf, fscanf).',
      order: 7,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l7_1 = await adminService.createLesson(mod7.id, {
      title: '7.1 Composite Data Structures & Disk File Handling',
      slug: 'c-structures-unions-file-io',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Design composite records using struct and simplify names with typedef.',
        'Access struct members via pointers using the arrow (->) operator.',
        'Read and write persistent files on disk using standard C streams.',
      ],
      content: `# Structures, Unions & File I/O in C

## 1. Structures (\`struct\`)
A structure is a user-defined composite data type that groups related variables of different types under a single named entity:

\`\`\`c
typedef struct {
    int id;
    char name[50];
    double gpa;
} Student;

Student s1 = {101, "Alice", 3.95};
\`\`\`

When accessing a structure via a pointer, use the **arrow operator (\`->\`)**:
\`\`\`c
Student *sPtr = &s1;
printf("ID: %d\\n", sPtr->id); // Equivalent to (*sPtr).id
\`\`\`

---

## 2. Disk File Streams
C treats files as sequential byte streams accessed via \`FILE*\` descriptors:

- **Open File Stream (\`fopen\`):** Binds a filesystem path to a buffered file stream with access modes like \`"r"\` (read), \`"w"\` (create/truncate for writing), or \`"a"\` (append).
- **Formatted File Output (\`fprintf\`):** Writes formatted text directly into the specified file stream descriptor.
- **Formatted File Input (\`fscanf\`):** Scans and parses formatted character data directly from the target file stream into memory variables.
- **Close File Stream (\`fclose\`):** Flushes pending buffered write operations and releases the operating system file descriptor.`,
    });

    await adminService.createExercise(l7_1.id, {
      title: 'Lab 7.1: Student Record Struct Serialization',
      type: 'coding',
      order: 1,
      marks: 25,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n#include <string.h>\n\ntypedef struct {\n    int id;\n    char name[32];\n    float score;\n} Student;\n\nvoid print_student(const Student *s) {\n    printf("Student[ID=%d, Name=%s, Score=%.1f]\\n", s->id, s->name, s->score);\n}\n\nint main(void) {\n    Student s = {101, "Rahul Sharma", 95.5f};\n    print_student(&s);\n    return 0;\n}\n',
      },
      hints: ['Pass the struct by reference using const Student* and use the arrow operator.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'Student[ID=101, Name=Rahul Sharma, Score=95.5]\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 8: Advanced C Programming
    // ═════════════════════════════════════════════════════════════════════════
    const mod8 = await adminService.createModule(course.id, {
      title: 'Module 8: Advanced C Systems Programming',
      description:
        'Preprocessor macros, conditional compilation (#ifdef), command-line arguments (argc, argv), function pointers, and modular header file design.',
      order: 8,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l8_1 = await adminService.createLesson(mod8.id, {
      title: '8.1 Preprocessor Directives, Function Pointers & CLI Arguments',
      slug: 'c-preprocessor-function-pointers-cli',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Write parameterized macros and guard header files using #ifndef inclusion guards.',
        'Parse command-line arguments using int argc and char *argv[].',
        'Declare, assign, and dispatch callbacks using function pointers.',
      ],
      content: `# Advanced C Programming

## 1. Function Pointers
In C, functions reside in the text/code segment of process memory and have memory addresses. A function pointer stores the address of an executable function, enabling **dynamic callback dispatching**:

\`\`\`c
int add(int a, int b) { return a + b; }

// Function pointer declaration:
int (*operation)(int, int) = add;
int result = operation(10, 20); // Calls add(10, 20) -> 30
\`\`\`

---

## 2. Command-Line Arguments
The signature \`int main(int argc, char *argv[])\` enables command-line interaction directly from the terminal shell:

- **Argument Counter (\`argc\`):** Non-negative integer representing the total count of command-line tokens passed from the shell, including the executable binary name.
- **Argument Vector (\`argv\`):** Null-terminated array of character pointers where \`argv[0]\` holds the program name and subsequent indices store individual argument strings.`,
    });

    await adminService.createExercise(l8_1.id, {
      title: 'Lab 8.1: Function Pointer Callback Dispatcher',
      type: 'coding',
      order: 1,
      marks: 25,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n\nint compute(int a, int b, int (*op)(int, int)) {\n    return op(a, b);\n}\n\nint multiply(int x, int y) { return x * y; }\n\nint main(void) {\n    int ans = compute(6, 7, multiply);\n    printf("Result: %d\\n", ans);\n    return 0;\n}\n',
      },
      hints: ['Pass multiply as the callback argument matching the int (*op)(int, int) signature.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'Result: 42\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 9: Problem Solving and Data Structures
    // ═════════════════════════════════════════════════════════════════════════
    const mod9 = await adminService.createModule(course.id, {
      title: 'Module 9: Problem Solving & Core Data Structures',
      description:
        'Implementation of fundamental data structures in pure C: Singly Linked Lists, Stacks, Queues, Binary Search, and sorting algorithms.',
      order: 9,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 60,
      isMandatory: true,
    });

    const l9_1 = await adminService.createLesson(mod9.id, {
      title: '9.1 Singly Linked Lists & Stack Implementations',
      slug: 'c-linked-lists-and-stacks',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Build a self-referential Node structure with pointers.',
        'Implement dynamic insertion, traversal, and node deallocation.',
        'Analyze asymptotic time complexity ($O(1)$ head insertion vs $O(n)$ search).',
      ],
      content: `# Data Structures in C: Linked Lists & Stacks

## 1. Singly Linked List Architecture
A linked list consists of dynamic nodes where each node contains:
1. Data payload.
2. A pointer referencing the next node in heap memory.

\`\`\`c
typedef struct Node {
    int data;
    struct Node *next;
} Node;
\`\`\`

Unlike contiguous arrays, linked lists can grow dynamically without requiring large contiguous memory allocations. Insertion at the head is an **$O(1)$ operation**, while search requires **$O(n)$ linear traversal**.`,
    });

    await adminService.createExercise(l9_1.id, {
      title: 'Lab 9.1: Dynamic Singly Linked List Insertion and Traversal',
      type: 'coding',
      order: 1,
      marks: 30,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n#include <stdlib.h>\n\ntypedef struct Node {\n    int data;\n    struct Node *next;\n} Node;\n\nvoid insert_head(Node **head, int val) {\n    Node *newNode = (Node *)malloc(sizeof(Node));\n    newNode->data = val;\n    newNode->next = *head;\n    *head = newNode;\n}\n\nint main(void) {\n    Node *head = NULL;\n    insert_head(&head, 30);\n    insert_head(&head, 20);\n    insert_head(&head, 10);\n    \n    Node *curr = head;\n    while (curr != NULL) {\n        printf("%d -> ", curr->data);\n        curr = curr->next;\n    }\n    printf("NULL\\n");\n    \n    // Free list\n    while (head != NULL) {\n        Node *temp = head;\n        head = head->next;\n        free(temp);\n    }\n    return 0;\n}\n',
      },
      hints: ['Prepend nodes to the head by updating pointers and clean up with free.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: '10 -> 20 -> 30 -> NULL\n',
          },
        ],
      },
    });

    // ═════════════════════════════════════════════════════════════════════════
    // MODULE 10: Capstone Project & Certification
    // ═════════════════════════════════════════════════════════════════════════
    const mod10 = await adminService.createModule(course.id, {
      title: 'Module 10: Capstone Project & Final Certification Exam',
      description:
        'Full modular systems project (Student Record Management System), final comprehensive assessment, and university certification issuance.',
      order: 10,
      requiredTimeMinutes: 3,
      requiredTimeSeconds: 120,
      isMandatory: true,
    });

    const l10_1 = await adminService.createLesson(mod10.id, {
      title: '10.1 Production Capstone: Student Record Management System',
      slug: 'c-capstone-student-record-system',
      type: 'reading',
      order: 1,
      isMandatory: true,
      learningObjectives: [
        'Synthesize dynamic memory, structures, pointers, and algorithms into a complete C application.',
        'Implement CRUD operations (Create, Read, Update, Delete) on in-memory records.',
        'Prepare for final certification validation.',
      ],
      content: `# Capstone Project: Student Record Management System

## Overview
This production capstone integrates all core C competencies into an in-memory database management engine:
- Composite \`struct Student\` models.
- Dynamic resizing array pointers.
- Sorting by GPA / ID using standard algorithms.
- Complete modular functions with input validation.

Students must complete the Capstone implementation and pass the Final Certification Examination to earn their official credential.`,
    });

    await adminService.createExercise(l10_1.id, {
      title: 'Capstone Lab: Student Record Engine & Search',
      type: 'coding',
      order: 1,
      marks: 40,
      isMandatory: true,
      starterCode: {
        c: '#include <stdio.h>\n#include <string.h>\n\ntypedef struct {\n    int id;\n    char name[32];\n    float gpa;\n} Record;\n\nint find_highest_gpa(const Record students[], int count) {\n    int bestIdx = 0;\n    for (int i = 1; i < count; i++) {\n        if (students[i].gpa > students[bestIdx].gpa) {\n            bestIdx = i;\n        }\n    }\n    return bestIdx;\n}\n\nint main(void) {\n    Record roster[3] = {\n        {101, "Aman Verma", 3.82f},\n        {102, "Priya Patel", 3.96f},\n        {103, "Rohan Das", 3.75f}\n    };\n    \n    int top = find_highest_gpa(roster, 3);\n    printf("Valedictorian: %s (GPA: %.2f)\\n", roster[top].name, roster[top].gpa);\n    return 0;\n}\n',
      },
      hints: ['Iterate through records and track the index with the maximum GPA.'],
      quizConfig: {
        testCases: [
          {
            id: 1,
            input: '',
            expected: 'Valedictorian: Priya Patel (GPA: 3.96)\n',
          },
        ],
      },
    });

    await adminService.createExercise(l10_1.id, {
      title: 'Comprehensive Final C Certification Examination',
      type: 'quiz',
      order: 2,
      marks: 50,
      isMandatory: true,
      quizConfig: {
        questions: [
          {
            id: 'c-cert-q1',
            question: 'What is the exact return value of sizeof(char) as specified by the ISO C standard?',
            options: ['Always 1', 'Depends on whether the architecture is 32-bit or 64-bit', '4 bytes', 'Undefined'],
            correctAnswer: 0,
            explanation: 'The C standard defines sizeof(char) to be strictly 1 byte by definition on all architectures.',
          },
          {
            id: 'c-cert-q2',
            question: 'Which standard library function is used to release dynamic heap memory back to the system?',
            options: ['delete', 'free()', 'dealloc()', 'release()'],
            correctAnswer: 1,
            explanation: 'In C, free() releases heap memory allocated by malloc, calloc, or realloc.',
          },
          {
            id: 'c-cert-q3',
            question: 'What is the operator used to access structure members through a pointer?',
            options: ['.', '->', '::', '=>'],
            correctAnswer: 1,
            explanation: 'The arrow operator (->) dereferences a pointer to a struct and accesses the specified field.',
          },
          {
            id: 'c-cert-q4',
            question: 'What happens when you write to memory beyond the allocated bounds of an array?',
            options: [
              'The compiler throws an ArrayOutOfBoundsException',
              'Undefined behavior (may corrupt memory or cause segmentation fault)',
              'The array automatically expands its capacity',
              'Memory write is silently dropped',
            ],
            correctAnswer: 1,
            explanation: 'C does not perform runtime array bounds checking; out-of-bounds writes invoke undefined behavior.',
          },
          {
            id: 'c-cert-q5',
            question: 'What is the purpose of the #ifndef ... #define ... #endif preprocessor pattern in header files?',
            options: [
              'To speed up CPU clock execution',
              'Include guards: prevents duplicate definition errors when headers are included multiple times',
              'To allocate static heap memory',
              'To export functions to external shared libraries',
            ],
            correctAnswer: 1,
            explanation: 'Include guards guarantee that a header file is processed only once per translation unit.',
          },
        ],
      },
    });

    // ── 2. Create / Update the Learning Path ─────────────────────────────────
    const cPath = await adminService.createPath({
      title: 'C Programming Foundations & Problem-Solving Certification',
      slug: 'c-programming-mastery',
      description:
        'Official university-accredited certification program in C Programming & Systems Engineering. Master syntax, pointers, memory architectures, algorithms, and modular software design.',
      difficulty: 'beginner',
      estimatedHours: 48,
      tags: ['C', 'Systems Programming', 'Pointers', 'Memory Management', 'Data Structures', 'Algorithms'],
      status: 'published',
      courseIds: [course.id],
    });

    if (cPath) {
      await adminService.publishPath(cPath.id);
      logger.log(`✅ C Programming Certification Learning Path published: ${cPath.id}`);
    }

    logger.log('🎉 C Programming Foundations & Problem-Solving Certification seeded successfully with 10 comprehensive modules!');
  } catch (err: any) {
    logger.error(`Error seeding C programming certification curriculum: ${err?.message}`, err?.stack);
  }
}
