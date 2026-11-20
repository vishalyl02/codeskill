import { Logger } from '@nestjs/common';
import { AdminLearningService } from './admin-learning.service';

/**
 * Official Chandigarh University Practice & Interactive Coding Exercises
 * Idempotently creates the dedicated Course and Learning Path with real, diverse problems,
 * custom starter code, test assertions, and conceptual fill-in-the-blanks.
 */
export async function seedInteractiveCUExercisesCurriculum(
  adminService: AdminLearningService,
  logger: Logger,
): Promise<void> {
  try {
    logger.log('📘 Starting Interactive Practice & Chandigarh University Exercises seeding...');

    // 1. Create or retrieve the dedicated Course
    const course = await adminService.createCourse({
      title: 'Interactive Practice & Chandigarh University Exercises',
      slug: 'interactive-practice-chandigarh-university-exercises',
      description:
        'Official Chandigarh University real-time code compiler labs and concept fill-in-the-blanks exercises across C, C++, Data Structures, Algorithms, SQL Database engineering, and Systems Computing.',
      difficulty: 'intermediate',
      estimatedMinutes: 600,
      status: 'published',
    });

    if (!course) {
      logger.error('Failed to create Interactive Practice & Chandigarh University Exercises course');
      return;
    }

    // ── Module 1: C Programming & Formatted I/O Labs ─────────────────────────────
    const mod1 = await adminService.createModule(course.id, {
      title: 'Module 1: C Programming & Formatted I/O Labs',
      description:
        'Master standard I/O streams, format specifiers, precision rounding, and control structures in standard ISO C11.',
      order: 1,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 45,
    });

    // Lesson 1.1: Formatted Output & Field Widths
    const l1_1 = await adminService.createLesson(mod1.id, {
      title: '1.1 Formatted Console Output & Field Widths',
      slug: 'c-formatted-console-output-and-field-widths',
      type: 'coding',
      order: 1,
      content: `# Formatted Console Output in C

In systems development and embedded programming, generating precise tabular outputs is crucial. The \`printf\` function in \`<stdio.h>\` accepts format flags, minimum field widths, and precision specifiers:

\`\`\`c
printf("%-15s | %8.2f\\n", itemName, price);
\`\`\`

- \`%-\`: Left-aligns the output within the allocated width.
- \`15\`: Reserves a minimum column width of 15 characters.
- \`.2f\`: Formats floating-point numbers rounded to exactly 2 decimal places.

---

### Challenge Task
Write a C program that prints a formatted invoice header and two items as shown in the expected output.
`,
      learningObjectives: [
        'Apply printf format specifiers with minimum field widths',
        'Left-align string columns and format currency floats to two decimal places',
      ],
    });

    await adminService.createExercise(l1_1.id, {
      title: 'Generate Tabular Invoice with Field Widths',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

int main() {
    // TODO: Print formatted items using field width specifiers:
    // Item 1: "Notebook" with price 45.50
    // Item 2: "Pen" with price 12.00
    // Format: "%-12s : $%.2f\\n"

    return 0;
}
`,
        cpp: `#include <iostream>
#include <iomanip>

int main() {
    // TODO: Print "Notebook" ($45.50) and "Pen" ($12.00) formatted with field width 12
    return 0;
}
`,
        python: `# TODO: Print "Notebook" ($45.50) and "Pen" ($12.00) with format "%-12s : $%.2f"
`,
      },
      hints: [
        'Use printf("%-12s : $%.2f\\n", name, price) to align text cleanly.',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: 'Notebook     : $45.50\nPen          : $12.00',
          },
        ],
      },
    });

    // Lesson 1.2: Conditional Logic & Prime Number Detection
    const l1_2 = await adminService.createLesson(mod1.id, {
      title: '1.2 Conditional Logic: Prime Number Verification',
      slug: 'c-conditional-logic-prime-verification',
      type: 'coding',
      order: 2,
      content: `# Prime Number Verification Algorithm

A prime number is an integer greater than 1 that has no positive divisors other than 1 and itself.

### Optimized Trial Division
Instead of testing all divisors up to $n$, test only up to $\\sqrt{n}$:
- If $n \\le 1$, return false.
- If $n = 2$ or $n = 3$, return true.
- If $n \\% 2 = 0$ or $n \\% 3 = 0$, return false.
- Test remaining candidates $i$ and $i+2$ up to $i \\times i \\le n$.
`,
      learningObjectives: [
        'Implement trial division prime checking algorithm',
        'Handle edge cases for n <= 1, even numbers, and perfect squares',
      ],
    });

    await adminService.createExercise(l1_2.id, {
      title: 'Verify Prime Number in C',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>
#include <stdbool.h>

bool isPrime(int n) {
    // TODO: Implement trial division prime check logic
    // Return true if n is prime, false otherwise
    return false;
}

int main() {
    int testCases[] = {2, 17, 25, 29, 1};
    int count = sizeof(testCases) / sizeof(testCases[0]);
    for (int i = 0; i < count; i++) {
        printf("%d: %s\\n", testCases[i], isPrime(testCases[i]) ? "PRIME" : "COMPOSITE");
    }
    return 0;
}
`,
        python: `def is_prime(n):
    # TODO: Implement prime checking logic
    return False

for num in [2, 17, 25, 29, 1]:
    print(f"{num}: {'PRIME' if is_prime(num) else 'COMPOSITE'}")
`,
      },
      hints: [
        'Remember that numbers <= 1 are neither prime nor composite.',
        'Loop up to i * i <= n with step 6 to reduce iteration complexity to O(sqrt(n)).',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: '2: PRIME\n17: PRIME\n25: COMPOSITE\n29: PRIME\n1: COMPOSITE',
          },
        ],
      },
    });

    // ── Module 2: Pointers, Memory Addressing & Algorithms ─────────────────────
    const mod2 = await adminService.createModule(course.id, {
      title: 'Module 2: Pointers, Memory Addressing & Algorithms',
      description:
        'Low-level pointer arithmetic, indirection, memory swaps, and in-place string algorithms.',
      order: 2,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 45,
    });

    // Lesson 2.1: In-Place Pointer Swap
    const l2_1 = await adminService.createLesson(mod2.id, {
      title: '2.1 Pass-by-Reference & In-Place Pointer Swap',
      slug: 'c-pass-by-reference-pointer-swap',
      type: 'coding',
      order: 1,
      content: `# Pass-by-Reference in C

In C, all function arguments are passed by value. To modify caller variables, pass memory addresses using the address-of operator (\`&\`) and dereference them using the dereference operator (\`*\`):

\`\`\`c
void swap(int *a, int *b) {
    int temp = *a;
    *a = *b;
    *b = temp;
}
\`\`\`
`,
      learningObjectives: [
        'Pass pointer parameters to mutate caller state',
        'Safely dereference memory addresses without segmentation faults',
      ],
    });

    await adminService.createExercise(l2_1.id, {
      title: 'Implement Swap Function with Pointers',
      type: 'coding',
      marks: 25,
      starterCode: {
        c: `#include <stdio.h>

void swap(int *a, int *b) {
    // TODO: Implement pointer swap logic without allocating new memory
}

int main() {
    int x = 100, y = 200;
    printf("Before: x=%d, y=%d\\n", x, y);
    swap(&x, &y);
    printf("After: x=%d, y=%d\\n", x, y);
    return 0;
}
`,
        cpp: `#include <iostream>

void swap(int *a, int *b) {
    // TODO: Implement pointer swap logic
}

int main() {
    int x = 100, y = 200;
    std::cout << "Before: x=" << x << ", y=" << y << "\\n";
    swap(&x, &y);
    std::cout << "After: x=" << x << ", y=" << y << "\\n";
    return 0;
}
`,
      },
      hints: [
        'Pass the addresses of x and y using &x and &y.',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: 'Before: x=100, y=200\nAfter: x=200, y=100',
          },
        ],
      },
    });

    // Lesson 2.2: In-Place Two-Pointer String Reversal
    const l2_2 = await adminService.createLesson(mod2.id, {
      title: '2.2 In-Place String Reversal with Pointers',
      slug: 'c-string-reversal-two-pointers',
      type: 'coding',
      order: 2,
      content: `# Two-Pointer In-Place String Reversal

Reversing a null-terminated string without allocating additional memory uses two pointers:
1. Initialize \`left\` pointing to the start.
2. Initialize \`right\` pointing to the last character before \`\\0\`.
3. Swap \`*left\` and \`*right\`, advance \`left++\`, and decrement \`right--\` until they meet.
`,
      learningObjectives: [
        'Traverse null-terminated strings using pointer arithmetic',
        'Execute in-place byte swaps without memory leaks',
      ],
    });

    await adminService.createExercise(l2_2.id, {
      title: 'Reverse String In-Place',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>
#include <string.h>

void reverseString(char *str) {
    // TODO: Implement in-place string reversal using two pointers
}

int main() {
    char word[] = "Chandigarh";
    reverseString(word);
    printf("Reversed: %s\\n", word);
    return 0;
}
`,
        python: `def reverse_string(s):
    # TODO: Implement string reversal
    return s

print("Reversed:", reverse_string("Chandigarh"))
`,
      },
      hints: [
        'char *right = str + strlen(str) - 1 points to the final non-null character.',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: 'Reversed: hragidnahC',
          },
        ],
      },
    });

    // ── Module 3: Dynamic Memory Allocation & Custom Structures ─────────────────
    const mod3 = await adminService.createModule(course.id, {
      title: 'Module 3: Dynamic Memory Allocation & Custom Structures',
      description:
        'Heap memory management with malloc, calloc, realloc, free, and composite struct records.',
      order: 3,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 45,
    });

    // Lesson 3.1: Dynamic Heap Allocation with malloc and free
    const l3_1 = await adminService.createLesson(mod3.id, {
      title: '3.1 Dynamic Heap Memory with malloc() and free()',
      slug: 'c-dynamic-heap-memory-malloc-free',
      type: 'coding',
      order: 1,
      content: `# Heap Memory Management in C

Unlike stack frames which are deallocated on function exit, heap memory allocated via \`malloc\` persists until explicitly released with \`free\`:

\`\`\`c
int *arr = (int *)malloc(n * sizeof(int));
if (arr == NULL) {
    // Heap exhaustion error handling
    return -1;
}
// Use memory...
free(arr);
arr = NULL; // Prevent dangling pointer
\`\`\`
`,
      learningObjectives: [
        'Allocate dynamic arrays on the heap using malloc',
        'Check for NULL allocation failure',
        'Release memory with free() to prevent memory leaks',
      ],
    });

    await adminService.createExercise(l3_1.id, {
      title: 'Allocate Dynamic Array and Compute Sum',
      type: 'coding',
      marks: 30,
      starterCode: {
        c: `#include <stdio.h>
#include <stdlib.h>

int main() {
    int n = 5;
    // TODO: Dynamically allocate memory for n integers using malloc
    // TODO: Populate arr[i] with (i + 1) * 10
    // TODO: Compute sum of elements, print "Dynamic Array Sum: %d\\n", and free memory

    return 0;
}
`,
        cpp: `#include <iostream>
#include <vector>

int main() {
    // TODO: Populate array with 10, 20, 30, 40, 50 and print sum
    return 0;
}
`,
      },
      hints: [
        'Always check if malloc returns NULL before accessing memory.',
        'Always pair every malloc() call with a free() call.',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: 'Dynamic Array Sum: 150',
          },
        ],
      },
    });

    // ── Module 4: Relational SQL Sandbox & Aggregations ─────────────────────────
    const mod4 = await adminService.createModule(course.id, {
      title: 'Module 4: Relational SQL Sandbox & Aggregations',
      description:
        'Hands-on PostgreSQL query execution with projection, predicate filtering, JOINs, and aggregates.',
      order: 4,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 45,
    });

    // Lesson 4.1: SQL Select & Predicates
    const l4_1 = await adminService.createLesson(mod4.id, {
      title: '4.1 Relational Projection & Predicate Filtering',
      slug: 'sql-projection-and-predicate-filtering',
      type: 'coding',
      order: 1,
      content: `# Relational Querying in PostgreSQL

The SQL \`SELECT\` statement retrieves columns, while the \`WHERE\` clause filters records based on boolean predicates:

\`\`\`sql
SELECT name, email, country
FROM customers
WHERE country = 'USA'
ORDER BY name ASC;
\`\`\`
`,
      learningObjectives: [
        'Filter rows using WHERE conditions',
        'Sort query results using ORDER BY',
      ],
    });

    await adminService.createExercise(l4_1.id, {
      title: 'Query USA Customers Sorted by Name',
      type: 'coding',
      marks: 25,
      starterCode: {
        sql: `-- TODO: Write a query selecting name, email, and country from customers
-- where country = 'USA', ordered alphabetically by name ASC
`,
      },
      hints: [
        'Use WHERE country = \'USA\' and ORDER BY name ASC.',
      ],
    });

    // Lesson 4.2: Relational JOINs & Aggregation
    const l4_2 = await adminService.createLesson(mod4.id, {
      title: '4.2 Relational JOINs & Aggregation with GROUP BY',
      slug: 'sql-joins-and-group-by-aggregation',
      type: 'coding',
      order: 2,
      content: `# Relational JOINs & Aggregation

An \`INNER JOIN\` combines records from two tables with matching foreign keys. \`GROUP BY\` aggregates numerical metrics:

\`\`\`sql
SELECT c.name, COUNT(o.id) as order_count, SUM(o.amount) as total_spent
FROM customers c
INNER JOIN orders o ON c.id = o.customer_id
GROUP BY c.name
ORDER BY total_spent DESC;
\`\`\`
`,
      learningObjectives: [
        'Perform multi-table INNER JOINs',
        'Compute aggregate sums and counts grouped by customer',
      ],
    });

    await adminService.createExercise(l4_2.id, {
      title: 'Aggregate Customer Spending via INNER JOIN',
      type: 'coding',
      marks: 30,
      starterCode: {
        sql: `-- TODO: Write a query selecting customer name and total_spent (SUM of order amounts)
-- Join customers c and orders o on customer_id, group by customer name, order by total_spent DESC
`,
      },
      hints: [
        'Join customers c and orders o on c.id = o.customer_id.',
      ],
    });

    // ── Module 5: Operating Systems & System Calls ──────────────────────────────
    const mod5 = await adminService.createModule(course.id, {
      title: 'Module 5: Operating Systems & Systems Programming',
      description:
        'POSIX process lifecycle, fork system call, exit statuses, and synchronization.',
      order: 5,
      requiredTimeMinutes: 2,
      requiredTimeSeconds: 45,
    });

    // Lesson 5.1: Process Creation with fork()
    const l5_1 = await adminService.createLesson(mod5.id, {
      title: '5.1 Unix Process Creation with fork() and wait()',
      slug: 'os-unix-process-creation-fork-wait',
      type: 'coding',
      order: 1,
      content: `# Unix Process Lifecycle with fork()

The \`fork()\` system call duplicates the current calling process:
- Returns \`0\` to the child process.
- Returns the child's positive \`PID\` to the parent process.
- Returns \`-1\` on failure.

The parent calls \`wait()\` or \`waitpid()\` to prevent zombie processes.
`,
      learningObjectives: [
        'Differentiate parent and child execution branches following fork()',
        'Reap terminated child processes using wait() to avoid zombies',
      ],
    });

    await adminService.createExercise(l5_1.id, {
      title: 'Demonstrate Process Branching with fork()',
      type: 'coding',
      marks: 35,
      starterCode: {
        c: `#include <stdio.h>
#include <unistd.h>
#include <sys/wait.h>

int main() {
    // TODO: Create a child process using fork()
    // In child (pid == 0): print "Child Process: Execution Complete\\n"
    // In parent: wait for child using wait(NULL) and print "Parent Process: Child Reaped\\n"

    return 0;
}
`,
        python: `import os

# TODO: Fork process and have child print "Child Process: Execution Complete"
# and parent wait and print "Parent Process: Child Reaped"
`,
      },
      hints: [
        'Check pid == 0 for child, pid > 0 for parent.',
      ],
      quizConfig: {
        testCases: [
          {
            input: '',
            expected: 'Child Process: Execution Complete\nParent Process: Child Reaped',
          },
        ],
      },
    });

    // ── 2. Create or Link to Chandigarh University Learning Path ────────────────
    const cuPath = await adminService.createPath({
      title: 'Chandigarh University Practice & Certification',
      slug: 'cu-practice-certification',
      description:
        'Comprehensive Chandigarh University engineering practice and certification curriculum with real-time sandbox coding, SQL sandboxes, and conceptual assessments.',
      difficulty: 'intermediate',
      estimatedHours: 24,
      tags: ['Chandigarh University', 'C', 'Pointers', 'SQL', 'OS', 'DSA', 'Practice'],
      status: 'published',
      courseIds: [course.id],
    });

    if (cuPath) {
      await adminService.publishPath(cuPath.id);
      logger.log(`✅ CU Practice & Certification Path published: ${cuPath.id}`);
    }

    logger.log('🎉 Interactive Practice & Chandigarh University Exercises course seeded successfully!');
  } catch (err: any) {
    logger.error(`Error seeding CU Interactive Exercises curriculum: ${err?.message}`, err?.stack);
  }
}
