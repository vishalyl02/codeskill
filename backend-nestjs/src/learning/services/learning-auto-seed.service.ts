import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AdminLearningService } from './admin-learning.service';

@Injectable()
export class LearningAutoSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LearningAutoSeedService.name);

  constructor(private readonly adminService: AdminLearningService) {}

  async onApplicationBootstrap() {
    // Run asynchronously in the background so application bootstrap remains non-blocking
    setTimeout(() => {
      this.seedCurriculumIfNotExist()
        .then(() => {
          this.logger.log('✨ CodeSkill Curriculum Auto-Seeding completed successfully.');
        })
        .catch((err) => {
          this.logger.error('Curriculum auto-seeding encountered an issue:', err);
        });
    }, 1500);
  }

  /**
   * Main idempotent curriculum seeding logic
   */
  async seedCurriculumIfNotExist(): Promise<void> {
    this.logger.log('🔍 Checking curriculum seeds (idempotent if-not-exists)...');
    await this.adminService.runMigrationColumnsIfNotExist();

    // ==========================================
    // 1. BADGES (Gamification Rewards)
    // ==========================================
    const badges = [
      {
        code: 'FIRST_SOLUTION',
        name: 'First Solution',
        description: 'Passed your first coding or quiz exercise in a learning course.',
        iconUrl: '/images/badges/first-solution.svg',
        rarity: 'common' as const,
        category: 'milestone' as const,
        criteria: { type: 'problem_solved', count: 1 },
      },
      {
        code: 'KNOWLEDGE_SEEKER',
        name: 'Knowledge Seeker',
        description: 'Completed your first 5 structured reading lessons.',
        iconUrl: '/images/badges/knowledge-seeker.svg',
        rarity: 'common' as const,
        category: 'skills' as const,
        criteria: { type: 'lesson_completed', count: 5 },
      },
      {
        code: 'AI_PIONEER',
        name: 'AI Pioneer',
        description: 'Mastered Large Language Models, prompt tuning, and generative AI foundations.',
        iconUrl: '/images/badges/ai-pioneer.svg',
        rarity: 'rare' as const,
        category: 'skills' as const,
        criteria: { type: 'course_completed', slug: 'ai-foundations-llm' },
      },
      {
        code: 'PROMPT_WIZARD',
        name: 'Prompt Wizard',
        description: 'Mastered Few-Shot, Chain-of-Thought, ReAct cognitive patterns and guardrails.',
        iconUrl: '/images/badges/prompt-wizard.svg',
        rarity: 'epic' as const,
        category: 'mastery' as const,
        criteria: { type: 'course_completed', slug: 'advanced-prompt-engineering' },
      },
      {
        code: 'DBMS_ARCHITECT',
        name: 'DBMS Architect',
        description: 'Mastered Relational Algebra, SQL, Normalization, ACID transactions, and B-Tree indexing.',
        iconUrl: '/images/badges/dbms-architect.svg',
        rarity: 'epic' as const,
        category: 'skills' as const,
        criteria: { type: 'course_completed', slug: 'dbms-core-engineering' },
      },
      {
        code: 'JAVA_CHAMPION',
        name: 'Java Champion',
        description: 'Mastered JVM internals, OOP principles, Collections Framework, and Java Streams concurrency.',
        iconUrl: '/images/badges/java-champion.svg',
        rarity: 'epic' as const,
        category: 'skills' as const,
        criteria: { type: 'course_completed', slug: 'java-programming-mastery' },
      },
      {
        code: 'COMPUTER_ARCHITECT',
        name: 'Computer Architect',
        description: 'Mastered Digital Logic, CPU Architecture, Memory Hierarchy, and Computer Networking.',
        iconUrl: '/images/badges/computer-architect.svg',
        rarity: 'rare' as const,
        category: 'skills' as const,
        criteria: { type: 'course_completed', slug: 'computer-fundamentals-architecture' },
      },
      {
        code: 'OS_KERNEL_MASTER',
        name: 'OS Kernel Master',
        description: 'Mastered Process Management, CPU Scheduling, Synchronization, Deadlocks, and Paging.',
        iconUrl: '/images/badges/os-master.svg',
        rarity: 'legendary' as const,
        category: 'mastery' as const,
        criteria: { type: 'course_completed', slug: 'operating-systems-engineering' },
      },
      {
        code: 'CS_CORE_DISTINCTION',
        name: 'CS Core Engineering Distinction',
        description: 'Completed the full Computer Science Core Curriculum across all 4 foundational pillars.',
        iconUrl: '/images/badges/cs-core.svg',
        rarity: 'legendary' as const,
        category: 'mastery' as const,
        criteria: { type: 'path_completed', slug: 'cs-core-engineering' },
      },
    ];

    for (const b of badges) {
      try {
        await this.adminService.createBadge(b);
      } catch (err: any) {
        this.logger.debug(`Badge create error ignored: ${err?.message}`);
      }
    }

    // ==========================================
    // 2. CERTIFICATE TEMPLATE
    // ==========================================
    try {
      await this.adminService.createCertificateTemplate({
        name: 'CodeSkill Verified Professional Credential',
        title: 'Certificate of Verified Technical Mastery',
        issuerName: 'Technical Training & Development Board',
        issuerTitle: 'Head of Technical Training & Development',
        issuerOrganization: 'CodeSkill · Chandigarh University',
        isDefault: true,
      });
    } catch {
      // Ignored if exists
    }

    // ==========================================
    // 3. COURSE 1: DBMS (Database Management Systems)
    // ==========================================
    const dbmsCourse = await this.adminService.createCourse({
      title: 'Database Management Systems (DBMS) Core Engineering',
      slug: 'dbms-core-engineering',
      description: 'Comprehensive engineering curriculum covering Relational Model, SQL Mastery, 1NF-BCNF Normalization, ACID Transactions, Concurrency Control, and B-Tree Indexing.',
      difficulty: 'intermediate',
      estimatedMinutes: 120,
      status: 'published',
    });

    // DBMS Module 1: Relational Model & SQL Mastery
    const dbmsMod1 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 1: Relational Model & SQL Query Foundations',
      description: 'Relational algebra, DDL/DML, Constraints, SELECT, GROUP BY, and HAVING clauses.',
      order: 1,
    });

    const dbmsL1 = await this.adminService.createLesson(dbmsMod1.id, {
      title: 'Relational Model, Primary/Foreign Keys & DDL Constraints',
      slug: 'dbms-relational-model-constraints',
      order: 1,
      type: 'reading',
      content: `### 1. The Relational Model
A **Relational Database** organizes data into tables (relations) consisting of rows (tuples) and columns (attributes).

#### Key Constraints:
- **Primary Key (PK)**: Uniquely identifies each tuple. Must be \`UNIQUE\` and \`NOT NULL\`.
- **Foreign Key (FK)**: Enforces referential integrity by linking to a Primary Key in another table.
- **Candidate Key**: A minimal superkey that can uniquely identify any tuple.
- **Unique vs Primary Key**: A table can have multiple \`UNIQUE\` keys, but only **one** \`PRIMARY KEY\`. Primary keys forbid \`NULL\` values.

\`\`\`sql
-- Creating an Orders table with Referential Integrity
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL
);

CREATE TABLE orders (
    order_id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    total_amount NUMERIC(10, 2) CHECK (total_amount >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

> **Rule of Thumb**: Always define foreign keys with appropriate cascade policies (\`ON DELETE CASCADE\` or \`ON DELETE RESTRICT\`) to prevent orphaned records.
`,
      learningObjectives: [
        'Understand Primary, Foreign, Candidate, and Super Keys',
        'Define DDL schemas with CHECK and UNIQUE constraints',
        'Evaluate referential integrity cascade policies',
      ],
    });

    await this.adminService.createExercise(dbmsL1.id, {
      title: 'DBMS Knowledge Check: Relational Keys & Integrity',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'dbms-q1',
            question: 'What is the primary difference between a PRIMARY KEY and a UNIQUE constraint?',
            options: [
              'PRIMARY KEY allows NULLs whereas UNIQUE strictly forbids them',
              'A table can have multiple PRIMARY KEYs but only one UNIQUE constraint',
              'A table can have only one PRIMARY KEY which forbids NULLs, while multiple UNIQUE constraints are permitted',
              'PRIMARY KEY only applies to integer columns',
            ],
            correctAnswer: 2,
            explanation: 'In relational databases, only one PRIMARY KEY is permitted per relation and all its columns must be NOT NULL. Multiple UNIQUE constraints can exist.',
          },
          {
            id: 'dbms-q2',
            question: 'What happens to child records when ON DELETE CASCADE is specified on a Foreign Key?',
            options: [
              'The deletion of the parent record is rejected with an error',
              'The child records are automatically deleted when the referenced parent record is deleted',
              'The child records foreign keys are converted to zero',
              'The parent record is archived rather than deleted',
            ],
            correctAnswer: 1,
            explanation: 'ON DELETE CASCADE propagates the deletion of the referenced row down to all child tuples holding the foreign key.',
          },
          {
            id: 'dbms-q3',
            question: 'Which Relational Algebra operation extracts specific columns from a relation while eliminating duplicate tuples?',
            options: [
              'Selection (σ)',
              'Projection (π)',
              'Cartesian Product (×)',
              'Set Intersection (∩)',
            ],
            correctAnswer: 1,
            explanation: 'Projection (π) extracts designated attribute columns from a relation, returning a unique set of tuples without duplicates.',
          },
          {
            id: 'dbms-q4',
            question: 'If Table A has 30 rows and Table B has 40 rows, how many tuples are generated by a CROSS JOIN (Cartesian product A × B)?',
            options: [
              '70 tuples',
              '1,200 tuples',
              '40 tuples',
              '10 tuples',
            ],
            correctAnswer: 1,
            explanation: 'The Cartesian product combines every tuple in A with every tuple in B: 30 × 40 = 1,200 tuples.',
          },
          {
            id: 'dbms-q5',
            question: 'Which SQL constraint guarantees that an employee salary column cannot contain a negative number?',
            options: [
              'CHECK (salary >= 0)',
              'DEFAULT 0',
              'UNIQUE (salary)',
              'CASCADE (salary)',
            ],
            correctAnswer: 0,
            explanation: 'The CHECK constraint verifies that all stored values satisfy the specified boolean predicate.',
          },
          {
            id: 'dbms-q6',
            question: 'What is a Surrogate Key in relational database schema design?',
            options: [
              'A natural key composed of business attributes like SSN or email',
              'An artificial system-generated unique identifier with no real-world business meaning (e.g., auto-increment integer or UUID)',
              'A foreign key that points to multiple parent tables',
              'An encrypted hash index',
            ],
            correctAnswer: 1,
            explanation: 'A surrogate key is an artificial unique identifier generated by the database system (such as an auto-increment integer or UUID) with no external business meaning.',
          },
          {
            id: 'dbms-q7',
            question: 'What is the fundamental difference between WHERE and HAVING in SQL queries?',
            options: [
              'WHERE is used only with subqueries; HAVING is used in the outer query',
              'WHERE filters individual tuples before aggregation, while HAVING filters aggregate groups after GROUP BY',
              'WHERE applies only to numeric columns, whereas HAVING applies to text columns',
              'HAVING executes before WHERE in the logical query processing order',
            ],
            correctAnswer: 1,
            explanation: 'WHERE filters rows before aggregation occurs. HAVING applies filtering conditions to the aggregate groups computed by GROUP BY.',
          },
        ],
      },
    });

    const dbmsL2 = await this.adminService.createLesson(dbmsMod1.id, {
      title: 'Advanced SQL: Multi-Table Joins, Aggregation & HAVING',
      slug: 'dbms-joins-aggregations-having',
      order: 2,
      type: 'coding',
      content: `### Multi-Table Joins & Aggregations

#### 1. Join Types:
- **INNER JOIN**: Returns records that have matching values in both tables.
- **LEFT (OUTER) JOIN**: Returns all records from the left table, and matched records from the right table (NULL if no match).
- **RIGHT (OUTER) JOIN**: Returns all records from the right table, and matched records from the left table.
- **FULL (OUTER) JOIN**: Returns all records when there is a match in either left or right table.
- **CROSS JOIN**: Cartesian product (m × n rows).

#### 2. WHERE vs HAVING:
- **\`WHERE\`** filters individual rows **before** aggregation occurs.
- **\`HAVING\`** filters aggregate groups **after** \`GROUP BY\` has executed.

\`\`\`sql
-- Find customers who placed orders exceeding $500 total
SELECT c.customer_id, c.name, SUM(o.total_amount) AS total_spent
FROM customers c
INNER JOIN orders o ON c.customer_id = o.customer_id
WHERE o.created_at >= '2026-01-01'
GROUP BY c.customer_id, c.name
HAVING SUM(o.total_amount) > 500
ORDER BY total_spent DESC;
\`\`\`
`,
      learningObjectives: [
        'Differentiate INNER, LEFT, RIGHT, and FULL outer joins',
        'Apply GROUP BY with HAVING filters on aggregated values',
        'Write queries computing joined metrics',
      ],
    });

    await this.adminService.createExercise(dbmsL2.id, {
      title: 'Hands-on Exercise: SQL Join & Aggregate Simulator',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// SQL Query Logic Simulation:
// Implement a function that performs an INNER JOIN between two tables (users and orders)
// and returns array of { name: string, total: number } grouped by user.

function aggregateOrders(users, orders) {
  // users: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
  // orders: [{ id: 101, userId: 1, amount: 250 }, { id: 102, userId: 1, amount: 150 }]
  const result = [];
  const userMap = new Map();
  users.forEach(u => userMap.set(u.id, { name: u.name, total: 0 }));

  orders.forEach(o => {
    if (userMap.has(o.userId)) {
      userMap.get(o.userId).total += o.amount;
    }
  });

  for (const [_, data] of userMap.entries()) {
    if (data.total > 0) result.push(data);
  }
  return result;
}

// Verification
const users = [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }];
const orders = [{ id: 101, userId: 1, amount: 400 }, { id: 102, userId: 2, amount: 150 }];
console.log(JSON.stringify(aggregateOrders(users, orders)));
`,
        python: `# SQL Query Logic Simulation:
# Perform an INNER JOIN between users and orders and compute total amount per user.

def aggregate_orders(users, orders):
    user_totals = {u["id"]: {"name": u["name"], "total": 0} for u in users}
    for o in orders:
        if o["userId"] in user_totals:
            user_totals[o["userId"]]["total"] += o["amount"]
    return [v for v in user_totals.values() if v["total"] > 0]

users = [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]
orders = [{"id": 101, "userId": 1, "amount": 400}, {"id": 102, "userId": 2, "amount": 150}]
print(aggregate_orders(users, orders))
`,
      },
      hints: [
        'Create a hash map keyed by user ID to aggregate order amounts in O(N+M) time.',
        'Filter out users with 0 orders to match INNER JOIN semantics.',
      ],
    });

    // DBMS Module 2: Normalization & Functional Dependencies
    const dbmsMod2 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 2: Normalization & Functional Dependencies',
      description: '1NF, 2NF, 3NF, BCNF, Functional Dependencies, and Anomalies.',
      order: 2,
    });

    const dbmsL3 = await this.adminService.createLesson(dbmsMod2.id, {
      title: 'Database Normalization: From 1NF to BCNF',
      slug: 'dbms-normalization-1nf-bcnf',
      order: 1,
      type: 'reading',
      content: `### Database Normalization
Normalization eliminates **redundancy** and prevents update, insertion, and deletion anomalies.

| Normal Form | Condition | Eliminates |
| :--- | :--- | :--- |
| **1NF** (First Normal Form) | All attribute values must be **atomic** (no repeating groups or arrays). | Multi-valued attributes |
| **2NF** (Second Normal Form) | In 1NF and **no partial dependency** (every non-prime attribute is fully dependent on the entire PK). | Partial dependencies |
| **3NF** (Third Normal Form) | In 2NF and **no transitive dependency** ($X \\to Y$ where $Y$ is non-prime and $X$ is not a superkey). | Transitive dependencies |
| **BCNF** (Boyce-Codd) | For every non-trivial functional dependency $X \\to Y$, **$X$ must be a Super Key**. | Anomalies where determinants are not candidate keys |

#### Lossless Join Property
A decomposition of relation $R$ into $R_1$ and $R_2$ is **lossless** if and only if:
$$R_1 \\cap R_2 \\to R_1 \\quad \\text{or} \\quad R_1 \\cap R_2 \\to R_2$$
The common attributes must form a superkey in at least one of the decomposed tables!
`,
      learningObjectives: [
        'Analyze 1NF, 2NF, 3NF, and BCNF requirements',
        'Identify update, deletion, and insertion anomalies',
        'Verify lossless decomposition using functional dependencies',
      ],
    });

    await this.adminService.createExercise(dbmsL3.id, {
      title: 'DBMS Normalization & Dependency Mastery Quiz',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'norm-q1',
            question: 'A table is in 1NF with composite primary key (StudentID, CourseID). It contains an attribute StudentEmail dependent solely on StudentID. Which normal form is violated?',
            options: [
              '1NF',
              '2NF (Partial dependency exists)',
              '3NF',
              'BCNF',
            ],
            correctAnswer: 1,
            explanation: 'StudentEmail depends only on part of the composite primary key (StudentID), which is a partial dependency violating 2NF.',
          },
          {
            id: 'norm-q2',
            question: 'What is the strict requirement for Boyce-Codd Normal Form (BCNF)?',
            options: [
              'All attributes must be numeric',
              'For every non-trivial functional dependency X -> Y, X must be a Super Key',
              'Transitive dependencies are permitted if they involve candidate keys',
              'The table must contain fewer than 5 columns',
            ],
            correctAnswer: 1,
            explanation: 'In BCNF, for every non-trivial functional dependency X -> Y, X must be a superkey of the relation.',
          },
          {
            id: 'norm-q3',
            question: 'If functional dependencies A -> B and B -> C hold where A is the Primary Key and B is not a candidate key, what anomaly occurs?',
            options: [
              'Transitive dependency violating 3NF',
              'Multivalued dependency violating 4NF',
              'Loss of domain atomicity',
              'Deadlock on index scans',
            ],
            correctAnswer: 0,
            explanation: 'A non-key attribute (C) depending on another non-key attribute (B) creates a transitive dependency, violating 3NF.',
          },
          {
            id: 'norm-q4',
            question: 'What must be true for a table to satisfy First Normal Form (1NF)?',
            options: [
              'All values in every column must be atomic (no arrays, lists, or repeating groups)',
              'Every table must have at least three candidate keys',
              'All foreign keys must reference indexed columns',
              'The relation must be stored in columnar format',
            ],
            correctAnswer: 0,
            explanation: '1NF requires that all column values are atomic scalar values and that there are no repeating groups or nested arrays.',
          },
          {
            id: 'norm-q5',
            question: 'When decomposing relation R into R1 and R2, what mathematical condition ensures the decomposition is Lossless-Join?',
            options: [
              '(R1 ∩ R2) -> R1 or (R1 ∩ R2) -> R2 must hold in F+',
              'R1 and R2 must have an equal number of columns',
              'R1 must contain only primary keys',
              'R1 ∪ R2 must be empty',
            ],
            correctAnswer: 0,
            explanation: 'A decomposition of R into (R1, R2) is lossless if and only if the common attributes (R1 ∩ R2) functionally determine either R1 or R2.',
          },
          {
            id: 'norm-q6',
            question: 'Which normal form is designed specifically to eliminate multi-valued dependencies (MVDs: X ->> Y)?',
            options: [
              '2NF',
              '3NF',
              '4NF (Fourth Normal Form)',
              'Domain/Key Normal Form',
            ],
            correctAnswer: 2,
            explanation: '4NF addresses multi-valued dependencies where two or more independent multi-valued facts about an entity are stored in the same table.',
          },
          {
            id: 'norm-q7',
            question: 'Why do high-throughput analytical data warehouses often deliberately denormalize schemas into Star or Snowflake schemas?',
            options: [
              'To eliminate expensive relational joins and maximize query read throughput',
              'Because SQL cannot execute joins on tables larger than 1GB',
              'To satisfy 5NF mathematical proofs',
              'To reduce memory utilization by 90%',
            ],
            correctAnswer: 0,
            explanation: 'Denormalization pre-computes and flattens relations into fact and dimension tables, avoiding expensive join operations on massive analytical queries.',
          },
        ],
      },
    });

    // DBMS Module 3: Transactions, ACID & Concurrency Control
    const dbmsMod3 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 3: Transactions, ACID & Concurrency Control',
      description: 'ACID properties, Serializability, Two-Phase Locking (2PL), and Deadlock resolution.',
      order: 3,
      requiredTimeMinutes: 1,
      requiredTimeSeconds: 30,
    });

    const dbmsL4 = await this.adminService.createLesson(dbmsMod3.id, {
      title: 'ACID Properties, Isolation Levels & Two-Phase Locking (2PL)',
      slug: 'dbms-transactions-acid-2pl',
      order: 1,
      type: 'reading',
      content: `### Transactions & ACID Guarantees

A transaction is a logical unit of work executing database operations:
- **Atomicity**: All or nothing (via undo/redo logs).
- **Consistency**: Preserves database invariants and constraints.
- **Isolation**: Concurrent transactions do not interfere with each other.
- **Durability**: Committed changes survive crashes (via WAL - Write-Ahead Logging).

#### Transaction Isolation Levels & Read Phenomena:

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read |
| :--- | :---: | :---: | :---: |
| **Read Uncommitted** | ❌ Allowed | ❌ Allowed | ❌ Allowed |
| **Read Committed** | ✅ Prevented | ❌ Allowed | ❌ Allowed |
| **Repeatable Read** | ✅ Prevented | ✅ Prevented | ❌ Allowed (prevented in Postgres MVCC) |
| **Serializable** | ✅ Prevented | ✅ Prevented | ✅ Prevented |

#### Two-Phase Locking (2PL):
1. **Growing Phase**: Transaction acquires locks, cannot release any locks.
2. **Shrinking Phase**: Transaction releases locks, cannot acquire any new locks.
- **Strict 2PL**: Holds all exclusive (write) locks until the transaction commits/aborts to prevent cascading rollbacks.
`,
      learningObjectives: [
        'Analyze Atomicity, Consistency, Isolation, and Durability mechanisms',
        'Compare SQL isolation levels and read phenomena',
        'Evaluate Two-Phase Locking (2PL) and Strict 2PL guarantees',
      ],
    });

    await this.adminService.createExercise(dbmsL4.id, {
      title: 'DBMS Concurrency & Isolation Check',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'acid-q1',
            question: 'Which phenomenon occurs when Transaction A reads uncommitted data written by Transaction B which is later rolled back?',
            options: [
              'Phantom Read',
              'Non-Repeatable Read',
              'Dirty Read',
              'Write Skew',
            ],
            correctAnswer: 2,
            explanation: 'A Dirty Read occurs when a transaction reads uncommitted modifications made by another concurrent transaction that later fails or aborts.',
          },
          {
            id: 'acid-q2',
            question: 'What is the fundamental rule of the Growing Phase in Two-Phase Locking (2PL)?',
            options: [
              'Locks can only be released, not acquired',
              'Locks can be acquired, but no locks can be released until the phase ends',
              'All shared locks are immediately promoted to exclusive locks',
              'Transactions must commit before locking',
            ],
            correctAnswer: 1,
            explanation: 'In 2PL growing phase, locks may be acquired but none may be released.',
          },
          {
            id: 'acid-q3',
            question: 'Which SQL standard isolation level prevents Dirty Reads and Non-Repeatable Reads, but permits Phantom Reads?',
            options: [
              'Read Uncommitted',
              'Read Committed',
              'Repeatable Read',
              'Serializable',
            ],
            correctAnswer: 2,
            explanation: 'Repeatable Read guarantees that data read by a transaction is frozen against updates, but new matching rows inserted by other transactions (phantoms) can still appear unless range locks or MVCC prevent them.',
          },
          {
            id: 'acid-q4',
            question: 'What crucial guarantee does Write-Ahead Logging (WAL) enforce in relational databases?',
            options: [
              'Indexes must be written before table rows',
              'Transaction log records describing changes must be flushed to disk before the dirty data pages are flushed',
              'Queries must be validated by the compiler before execution',
              'All transactions must acquire table-level exclusive locks',
            ],
            correctAnswer: 1,
            explanation: 'WAL guarantees Durability and Atomicity by ensuring log records are securely written to non-volatile disk before modified buffer pool data pages overwrite disk blocks.',
          },
          {
            id: 'acid-q5',
            question: 'In Multi-Version Concurrency Control (MVCC), how do read and write operations interact?',
            options: [
              'Readers acquire shared locks that block all writers',
              'Writers acquire exclusive locks that block all readers',
              'Readers never block writers, and writers never block readers because readers access an immutable snapshot version',
              'Both readers and writers execute exclusively sequentially',
            ],
            correctAnswer: 2,
            explanation: 'In MVCC systems (like PostgreSQL and MySQL InnoDB), reading queries do not lock rows, reading historical snapshot tuples while writers create new versions.',
          },
          {
            id: 'acid-q6',
            question: 'What distinguishes Strict Two-Phase Locking (Strict 2PL) from standard Basic 2PL?',
            options: [
              'Strict 2PL releases read locks before write locks',
              'Strict 2PL holds all exclusive (X) locks until transaction termination (commit or abort), preventing cascading aborts',
              'Strict 2PL eliminates all shared (S) locks entirely',
              'Strict 2PL requires all transactions to finish within 1 second',
            ],
            correctAnswer: 1,
            explanation: 'Strict 2PL prevents cascading aborts and guarantees strict schedules by holding all exclusive write locks until the transaction completely finishes.',
          },
          {
            id: 'acid-q7',
            question: 'Which of the following scenarios is an example of a Phantom Read?',
            options: [
              'A transaction reads row 5 with balance $100, then re-reads row 5 and sees balance $200 because another transaction updated and committed it',
              'A transaction executes SELECT COUNT(*) WHERE dept="IT" and gets 4, then re-executes the same query and gets 5 because another transaction committed an INSERT',
              'A transaction reads row 10 whose value is rolled back because the author aborted',
              'Two transactions simultaneously write to the same row without locks',
            ],
            correctAnswer: 1,
            explanation: 'A Phantom Read occurs when a range query executed twice within the same transaction returns a different set of rows due to another transaction committing new inserts or deletes matching the search condition.',
          },
        ],
      },
    });

    // DBMS Module 4: Indexing & Storage Structures
    const dbmsMod4 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 4: Storage Structures & B-Tree Indexing',
      description: 'B-Trees, B+ Trees, Hash Indexes, Clustered vs Non-Clustered Indexes, and EXPLAIN ANALYZE.',
      order: 4,
    });

    const dbmsL5 = await this.adminService.createLesson(dbmsMod4.id, {
      title: 'B+ Tree Indexing & Query Execution Plans',
      slug: 'dbms-b-tree-indexing-execution-plans',
      order: 1,
      type: 'reading',
      content: `### Why Databases Use B+ Trees for Indexing

#### B-Tree vs B+ Tree:
- In a **B+ Tree**, data records/pointers are stored **strictly in leaf nodes**. Internal nodes store only search routing keys.
- **Leaf nodes are doubly linked**, allowing blazing fast $O(\\log N + K)$ range queries: \`WHERE age BETWEEN 20 AND 30\`.
- High fanout ensures tree height rarely exceeds 3 to 4 levels even for millions of rows, minimizing disk I/O.

#### Clustered vs Non-Clustered Indexes:
- **Clustered Index**: Determines the physical ordering of data pages on disk. A table can have **only one** clustered index (usually the Primary Key).
- **Non-Clustered Index**: Separate index structure containing index keys pointing to the data row (TID / RID or PK).
`,
      learningObjectives: [
        'Understand B+ Tree fanout and height dynamics',
        'Compare Clustered vs Non-Clustered physical index layouts',
        'Analyze query index scans vs sequential table scans',
      ],
    });

    await this.adminService.createExercise(dbmsL5.id, {
      title: 'Hands-on Exercise: B+ Tree Range Search Simulation',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// Implement a binary search index lookup for range queries:
// Given a sorted array of record keys, find all keys in [minKey, maxKey] in O(log N + K) time.

function rangeIndexScan(sortedKeys, minKey, maxKey) {
  let left = 0, right = sortedKeys.length - 1;
  let startIdx = sortedKeys.length;

  // Binary search for first element >= minKey
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedKeys[mid] >= minKey) {
      startIdx = mid;
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  const results = [];
  for (let i = startIdx; i < sortedKeys.length && sortedKeys[i] <= maxKey; i++) {
    results.push(sortedKeys[i]);
  }
  return results;
}

// Verification:
const index = [10, 15, 20, 25, 30, 35, 40, 50, 60, 70];
console.log("Range [20, 40]:", rangeIndexScan(index, 20, 40));
`,
        python: `# Binary Search Range Index Scan (B+ Tree Leaf Traversal)
import bisect

def range_index_scan(sorted_keys, min_key, max_key):
    start_idx = bisect.bisect_left(sorted_keys, min_key)
    end_idx = bisect.bisect_right(sorted_keys, max_key)
    return sorted_keys[start_idx:end_idx]

index = [10, 15, 20, 25, 30, 35, 40, 50, 60, 70]
print("Range [20, 40]:", range_index_scan(index, 20, 40))
`,
      },
      hints: [
        'Use binary search to locate the lower bound index in O(log N)',
        'Traverse sequentially across the sorted array until exceeding the upper bound',
      ],
    });

    // DBMS Module 5: Query Optimization & Join Execution Algorithms
    const dbmsMod5 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 5: Query Optimization & Physical Join Algorithms',
      description: 'Cost-based optimization, Relational algebra trees, Nested Loop, Hash Join, and Sort-Merge Join.',
      order: 5,
    });

    const dbmsL6 = await this.adminService.createLesson(dbmsMod5.id, {
      title: 'Physical Join Algorithms: Nested Loop vs Hash Join vs Merge Join',
      slug: 'dbms-physical-join-algorithms',
      order: 1,
      type: 'coding',
      content: `### Physical Join Algorithms in Relational Query Engines

When an SQL engine executes an \`INNER JOIN\`, it chooses one of three primary physical operators:

#### 1. Nested Loop Join:
- For each outer tuple, scan the inner table.
- Best when the outer table is tiny and the inner table has an index on the join key ($O(N \\times \\log M)$).

#### 2. Hash Join:
1. **Build Phase**: In-memory hash table built on the smaller table's join keys.
2. **Probe Phase**: Scan the larger table and probe the hash table.
- Expected time: $O(N + M)$. Highly efficient for large unsorted datasets with equijoins.

#### 3. Sort-Merge Join:
- Sort both relations on the join key, then scan synchronously like two pointers.
- Optimal when tables are already sorted or indexed in sorted order.
`,
      learningObjectives: [
        'Analyze computational costs of Nested Loop, Hash Join, and Sort-Merge Join',
        'Trace the Build and Probe phases of Hash Joins',
        'Predict which join algorithm a database optimizer selects for query plans',
      ],
    });

    await this.adminService.createExercise(dbmsL6.id, {
      title: 'Hands-on Exercise: In-Memory Hash Join Simulator',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// Implement an in-memory Hash Join algorithm:
// Table R: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
// Table S: [{ userId: 1, role: "Admin" }, { userId: 2, role: "Editor" }]
// Return joined array: [{ id: 1, name: "Alice", role: "Admin" }, ...]

function executeHashJoin(tableR, tableS, keyR, keyS) {
  // 1. Build Phase: Build hash map on Table R
  const hashMap = new Map();
  for (const row of tableR) {
    const k = row[keyR];
    if (!hashMap.has(k)) hashMap.set(k, []);
    hashMap.get(k).push(row);
  }

  // 2. Probe Phase: Probe using Table S
  const results = [];
  for (const sRow of tableS) {
    const k = sRow[keyS];
    if (hashMap.has(k)) {
      for (const rRow of hashMap.get(k)) {
        results.push({ ...rRow, ...sRow });
      }
    }
  }

  return results;
}

// Verification:
const users = [{ id: 101, name: "Alice" }, { id: 102, name: "Bob" }];
const roles = [{ userId: 101, role: "Lead" }, { userId: 102, role: "Engineer" }];
console.log("Joined Records:", JSON.stringify(executeHashJoin(users, roles, "id", "userId")));
`,
        python: `# In-Memory Hash Join Implementation
def execute_hash_join(table_r, table_s, key_r, key_s):
    # Build phase
    hash_map = {}
    for row in table_r:
        k = row[key_r]
        hash_map.setdefault(k, []).append(row)
    
    # Probe phase
    results = []
    for s_row in table_s:
        k = s_row[key_s]
        if k in hash_map:
            for r_row in hash_map[k]:
                merged = {**r_row, **s_row}
                results.append(merged)
    return results

users = [{"id": 101, "name": "Alice"}, {"id": 102, "name": "Bob"}]
roles = [{"userId": 101, "role": "Lead"}, {"userId": 102, "role": "Engineer"}]
print("Joined Records:", execute_hash_join(users, roles, "id", "userId"))
`,
      },
      hints: [
        'Build a hash table using table R keys during the build phase',
        'Iterate through table S and probe the hash map in O(1) expected time per row',
      ],
    });

    // DBMS Module 6: Distributed Databases & CAP Theorem
    const dbmsMod6 = await this.adminService.createModule(dbmsCourse.id, {
      title: 'Module 6: Distributed Databases, NoSQL & CAP Theorem',
      description: 'Document, Key-Value, Columnar stores, ACID vs BASE, and CAP Theorem trade-offs.',
      order: 6,
    });

    const dbmsL7 = await this.adminService.createLesson(dbmsMod6.id, {
      title: 'The CAP Theorem & ACID vs BASE Consistency Models',
      slug: 'dbms-cap-theorem-nosql-acid-base',
      order: 1,
      type: 'reading',
      content: `### Distributed Databases & The CAP Theorem

In any distributed data store across a network, network partitions (disconnections) are inevitable.

#### 1. The CAP Theorem (Brewer):
You can guarantee at most **two out of three** properties simultaneously:
- **Consistency (C)**: Every read receives the most recent write or an error (linearizable).
- **Availability (A)**: Every non-failing node returns a non-error response, without guarantee that it contains the most recent write.
- **Partition Tolerance (P)**: System continues operating despite arbitrary dropped or delayed network messages.

> Since network partitions cannot be prevented in distributed hardware, real-world systems must choose between:
> - **CP Systems** (e.g., PostgreSQL primary-replica sync, MongoDB with majority write concern)
> - **AP Systems** (e.g., Cassandra, DynamoDB with eventual consistency)

#### 2. ACID vs BASE:
| ACID (Relational) | BASE (NoSQL / Eventual) |
| :--- | :--- |
| **A**tomicity | **B**asically **A**vailable |
| **C**onsistency | **S**oft-state |
| **I**solation | **E**ventual consistency |
| **D**urability | High throughput across partitions |
`,
      learningObjectives: [
        'Apply the CAP theorem to distributed architecture trade-offs',
        'Compare CP vs AP distributed databases',
        'Contrast ACID guarantees with BASE eventual consistency',
      ],
    });

    await this.adminService.createExercise(dbmsL7.id, {
      title: 'Distributed Databases & CAP Theorem Mastery Check',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'cap-q1',
            question: 'When a network partition occurs in a distributed database system, what fundamental choice must the system make according to CAP?',
            options: [
              'Choose between Consistency or Availability',
              'Choose between encryption or compression',
              'Shut down all nodes permanently',
              'Convert relational schemas to binary arrays',
            ],
            correctAnswer: 0,
            explanation: 'Under a network partition (P), a distributed system must decide whether to cancel the operation (preserving Consistency) or proceed without all nodes agreeing (preserving Availability).',
          },
          {
            id: 'cap-q2',
            question: 'What does the BASE consistency model stand for in modern distributed NoSQL systems?',
            options: [
              'Binary Architecture Storage Engine',
              'Basically Available, Soft-state, Eventual consistency',
              'Buffered Access Standard Encryption',
              'Base Allocation Single Entity',
            ],
            correctAnswer: 1,
            explanation: 'BASE stands for Basically Available, Soft-state, and Eventual consistency, prioritizing partition tolerance and availability over immediate strict consistency.',
          },
          {
            id: 'cap-q3',
            question: 'Under a network partition, how is Apache Cassandra typically categorized in terms of the CAP theorem?',
            options: [
              'CA (Consistent and Available)',
              'AP (Available and Partition-tolerant)',
              'CP (Consistent and Partition-tolerant)',
              'None of the above',
            ],
            correctAnswer: 1,
            explanation: 'Cassandra defaults to an AP design, allowing local nodes to accept writes and reads during network partitions, reconciling differences asynchronously using hinted handoffs and anti-entropy repair.',
          },
          {
            id: 'cap-q4',
            question: 'In distributed data stores, what does the Quorum equation (R + W > N) guarantee?',
            options: [
              'Network latency is halved',
              'Strong read-after-write consistency, because the read set and write set must overlap by at least one replica',
              'Data is encrypted with asymmetric keys',
              'Zero disk usage',
            ],
            correctAnswer: 1,
            explanation: 'When Read quorum (R) plus Write quorum (W) exceeds total replicas (N), by the pigeonhole principle at least one node read by the client contains the latest write version.',
          },
          {
            id: 'cap-q5',
            question: 'What is the dreaded "Split-Brain" scenario in a distributed clustered database?',
            options: [
              'When CPU utilization reaches 100% on two cores',
              'When a network partition isolates nodes into two disconnected partitions, and each partition elects its own leader and accepts conflicting writes',
              'When dual hard drives fail simultaneously in RAID 0',
              'When a single query triggers two separate threads',
            ],
            correctAnswer: 1,
            explanation: 'Split-brain occurs when broken network links cause two subsets of cluster nodes to independently act as masters, producing irreversible divergent states and data corruption.',
          },
          {
            id: 'cap-q6',
            question: 'What problem do consensus protocols such as Raft and Paxos solve in distributed architectures?',
            options: [
              'Image rendering compression',
              'Agreeing on a deterministic sequence of state changes (replicated log) among a group of servers despite network delays or node crashes',
              'Preventing SQL injection vulnerabilities',
              'Auto-scaling Kubernetes pods',
            ],
            correctAnswer: 1,
            explanation: 'Consensus protocols like Raft allow distributed machines to function as a coherent group that can survive failures of some of its members while maintaining an identical replicated state machine log.',
          },
          {
            id: 'cap-q7',
            question: 'What does "Eventual Consistency" guarantee to clients in a distributed data store?',
            options: [
              'All queries return an error until manual verification',
              'If no new updates are made to a given data item, all replicas will eventually converge to return the same last-updated value',
              'Data will be permanently deleted after 30 days',
              'Reads always block until the entire internet verifies the transaction',
            ],
            correctAnswer: 1,
            explanation: 'Eventual consistency guarantees that in the absence of new updates, all replicas eventually sync up and become identical.',
          },
        ],
      },
    });

    this.logger.log('✓ DBMS Core Engineering course & exercises verified.');

    // ==========================================
    // 4. COURSE 2: Java Programming Mastery
    // ==========================================
    const javaCourse = await this.adminService.createCourse({
      title: 'Java Programming & Object-Oriented Architecture',
      slug: 'java-programming-mastery',
      description: 'Complete 1st-4th year university curriculum: JVM Internals, OOP Deep Dive, Collections Framework, Exception Handling, Streams API, and Concurrency.',
      difficulty: 'intermediate',
      estimatedMinutes: 120,
      status: 'published',
    });

    const javaMod1 = await this.adminService.createModule(javaCourse.id, {
      title: 'Module 1: JVM Architecture & Memory Model',
      description: 'JDK vs JRE vs JVM, Heap vs Stack memory, ClassLoader subsystem, and Bytecode execution.',
      order: 1,
    });

    const javaL1 = await this.adminService.createLesson(javaMod1.id, {
      title: 'JVM Memory Architecture: Heap, Stack & Metaspace',
      slug: 'jvm-architecture-heap-stack',
      order: 1,
      type: 'reading',
      content: `### JVM Memory Architecture

The Java Virtual Machine organizes runtime data into distinct regions:

1. **Heap Memory**:
   - Stores all created objects and instances.
   - Shared across all threads.
   - Managed automatically by the Garbage Collector (GC: Young Gen [Eden, S0, S1] + Old Gen).
2. **Stack Memory**:
   - Stores local primitive variables and references to objects on the heap.
   - Thread-private (each thread has its own stack).
   - Operates on a Last-In-First-Out (LIFO) method frame basis. Fast allocation and deallocation.
3. **Metaspace (Native Memory)**:
   - Replaced PermGen in Java 8.
   - Stores class metadata, bytecode, static variables, and method tables.
4. **Program Counter (PC) Register**:
   - Tracks the address of the current JVM instruction being executed by a thread.

\`\`\`java
public class MemoryDemo {
    public static void main(String[] args) {
        int primitiveVar = 42; // Allocated on Stack
        Person p = new Person("Alice"); // Reference 'p' on Stack, Person object on Heap
    }
}
\`\`\`
`,
      learningObjectives: [
        'Distinguish Heap, Stack, and Metaspace memory domains',
        'Analyze Garbage Collection generations (Eden, Survivor, Tenured)',
        'Trace object allocation and reference assignment',
      ],
    });

    await this.adminService.createExercise(javaL1.id, {
      title: 'Java Memory Architecture Knowledge Check',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'java-q1',
            question: 'Where is an object instance allocated when created with the new keyword in Java?',
            options: [
              'Thread Stack memory',
              'Heap memory',
              'Program Counter register',
              'CPU Cache L1 directly',
            ],
            correctAnswer: 1,
            explanation: 'In Java, all objects and array instances are dynamically allocated on the Heap. The variable holding the reference lives on the Stack.',
          },
          {
            id: 'java-q2',
            question: 'What happens when method call recursion continues infinitely in Java?',
            options: [
              'OutOfMemoryError: Java heap space',
              'StackOverflowError',
              'Segmentation Fault',
              'DeadlockException',
            ],
            correctAnswer: 1,
            explanation: 'Each method call allocates a frame on the thread stack. Unbounded recursion fills the stack capacity, throwing StackOverflowError.',
          },
          {
            id: 'java-q3',
            question: 'Which JVM memory area replaced PermGen starting in Java 8 and resides in native OS memory?',
            options: [
              'Eden Space',
              'Metaspace',
              'Thread Stack',
              'Survivor Space 0',
            ],
            correctAnswer: 1,
            explanation: 'Java 8 removed the fixed-size PermGen and introduced Metaspace, which allocates class metadata in native OS memory, automatically expanding as needed.',
          },
          {
            id: 'java-q4',
            question: 'In JVM Generational Garbage Collection, where are newly instantiated objects initially allocated?',
            options: [
              'Old (Tenured) Generation',
              'Eden Space in the Young Generation',
              'Survivor Space S1',
              'Directly in Metaspace',
            ],
            correctAnswer: 1,
            explanation: 'Most short-lived objects are allocated in the Eden space. Survivors of Minor GC cycles are promoted to Survivor spaces and eventually to Tenured generation.',
          },
          {
            id: 'java-q5',
            question: 'Why are String instances designed to be immutable in Java?',
            options: [
              'To allow faster CPU clock cycles',
              'For security, hashcode caching in HashMaps, thread safety, and String Constant Pool sharing',
              'Because Java lacks pointer arithmetic',
              'To avoid compiling bytecode',
            ],
            correctAnswer: 1,
            explanation: 'String immutability guarantees thread safety, secure transmission (URLs, passwords), allows reuse via the String Pool, and enables safe caching of hash values.',
          },
          {
            id: 'java-q6',
            question: 'What runtime guarantee does the volatile keyword provide for a variable in Java multithreading?',
            options: [
              'It locks the entire class for 5 seconds',
              'It guarantees immediate visibility of reads and writes directly to main memory across threads, preventing thread-local cache stale reads',
              'It serializes the variable to disk',
              'It makes the variable immutable',
            ],
            correctAnswer: 1,
            explanation: 'The volatile modifier ensures that any thread reading the field sees the most recent write made by any other thread, establishing a happens-before memory relationship.',
          },
          {
            id: 'java-q7',
            question: 'Which of the following JVM memory regions is shared across all concurrent threads?',
            options: [
              'Thread Execution Stack',
              'Program Counter (PC) Register',
              'Java Heap Memory',
              'Native Method Stack',
            ],
            correctAnswer: 2,
            explanation: 'The Heap and Metaspace are shared across all threads in a JVM process, whereas each thread has its own private Stack, Native Stack, and PC Register.',
          },
        ],
      },
    });

    const javaMod2 = await this.adminService.createModule(javaCourse.id, {
      title: 'Module 2: Object-Oriented Programming (OOP) Deep Dive',
      description: 'Encapsulation, Inheritance, Polymorphism (Static vs Dynamic), Abstract Classes vs Interfaces.',
      order: 2,
    });

    const javaL2 = await this.adminService.createLesson(javaMod2.id, {
      title: 'Polymorphism, Dynamic Method Dispatch & Interfaces',
      slug: 'java-oop-polymorphism-interfaces',
      order: 1,
      type: 'coding',
      content: `### Polymorphism & Dynamic Dispatch

#### Four Pillars of OOP:
1. **Encapsulation**: Bundling data with methods and restricting direct access using \`private\`, getters, and setters.
2. **Inheritance**: Code reuse where a child class acquires properties of a parent (\`extends\`).
3. **Polymorphism**:
   - **Compile-time (Overloading)**: Same method name with different parameter signatures.
   - **Runtime (Overriding / Dynamic Dispatch)**: Subclass provides a specific implementation of a method declared in its superclass or interface.
4. **Abstraction**: Hiding internal implementation details using \`abstract class\` or \`interface\`.

\`\`\`java
interface Shape {
    double area();
}

class Circle implements Shape {
    private final double radius;
    public Circle(double r) { this.radius = r; }
    @Override public double area() { return Math.PI * radius * radius; }
}

class Rectangle implements Shape {
    private final double width, height;
    public Rectangle(double w, double h) { this.width = w; this.height = h; }
    @Override public double area() { return width * height; }
}
\`\`\`
`,
      learningObjectives: [
        'Implement Interface abstraction with dynamic dispatch',
        'Demonstrate method overriding with the @Override annotation',
        'Encapsulate private state with immutable constructors',
      ],
    });

    await this.adminService.createExercise(javaL2.id, {
      title: 'Hands-on Java: Polymorphic Shape Area Calculator',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        java: `public class Main {
    interface Shape {
        double area();
    }

    static class Circle implements Shape {
        private final double radius;
        public Circle(double radius) { this.radius = radius; }
        @Override
        public double area() {
            return Math.PI * radius * radius;
        }
    }

    static class Rectangle implements Shape {
        private final double width, height;
        public Rectangle(double w, double h) { this.width = w; this.height = h; }
        @Override
        public double area() {
            return width * height;
        }
    }

    public static void main(String[] args) {
        Shape c = new Circle(5.0);
        Shape r = new Rectangle(4.0, 6.0);
        System.out.printf("Circle Area: %.2f%n", c.area());
        System.out.printf("Rectangle Area: %.2f%n", r.area());
    }
}
`,
        javascript: `class Circle {
  constructor(r) { this.r = r; }
  area() { return Math.PI * this.r * this.r; }
}
class Rectangle {
  constructor(w, h) { this.w = w; this.h = h; }
  area() { return this.w * this.h; }
}
const c = new Circle(5);
const r = new Rectangle(4, 6);
console.log("Circle Area:", c.area().toFixed(2));
console.log("Rectangle Area:", r.area().toFixed(2));
`,
      },
      hints: [
        'Ensure all classes implementing Shape override the area() method.',
        'Use Math.PI for circle area calculation.',
      ],
    });

    const javaMod3 = await this.adminService.createModule(javaCourse.id, {
      title: 'Module 3: Java Collections Framework & HashMap Internals',
      description: 'List, Set, Map hierarchies, HashMap internal bucket hashing, and treeification threshold.',
      order: 3,
    });

    const javaL3 = await this.adminService.createLesson(javaMod3.id, {
      title: 'Java Collections: ArrayList, LinkedList & HashMap Hashing',
      slug: 'java-collections-hashmap-internals',
      order: 1,
      type: 'reading',
      content: `### Java Collections Framework

#### 1. List Hierarchy:
- **ArrayList**: Backed by a resizable array. Fast random access $O(1)$, slow insertions/deletions in the middle $O(N)$.
- **LinkedList**: Doubly linked list. Fast insertions/deletions at ends $O(1)$, slow index access $O(N)$.

#### 2. HashMap Internals (Deep Dive):
- Default initial capacity = **16**, Load factor = **0.75**.
- Threshold for resize = $16 \\times 0.75 = 12$. When reached, array doubles to 32.
- **Index Calculation**: \`index = hash(key) & (n - 1)\`
- **Hash Collisions**:
  - Initially resolved using a **linked list** in each bucket.
  - When a bucket exceeds **\`TREEIFY_THRESHOLD = 8\`** and array size $\\ge 64$, the bucket transforms from a linked list into a **Red-Black Tree**, reducing worst-case lookup from $O(N)$ to $O(\\log N)$!
`,
      learningObjectives: [
        'Compare ArrayList vs LinkedList time complexities',
        'Trace HashMap bucket index calculation and collision resolution',
        'Explain Red-Black treeification threshold in Java 8+',
      ],
    });

    await this.adminService.createExercise(javaL3.id, {
      title: 'Java Collections Knowledge Check',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'jcoll-q1',
            question: 'In Java 8+, what happens when the number of elements in a single HashMap bucket reaches 8 and the table capacity is at least 64?',
            options: [
              'An OutOfMemoryError is thrown',
              'The bucket linked list is converted into a Red-Black Tree',
              'The key is overwritten',
              'The HashMap converts to a TreeMap globally',
            ],
            correctAnswer: 1,
            explanation: 'Java 8 converts linked list collision chains exceeding 8 nodes into a balanced Red-Black Tree (TreeNode) to guarantee O(log N) worst-case lookup.',
          },
          {
            id: 'jcoll-q2',
            question: 'What contract must be upheld when overriding equals() in a Java class used as a HashMap key?',
            options: [
              'toString() must return a numeric value',
              'hashCode() must also be overridden so equal objects produce equal hash codes',
              'The class must implement Serializable',
              'All fields must be declared volatile',
            ],
            correctAnswer: 1,
            explanation: 'If two objects are equal according to equals(Object), then calling hashCode() on each of the two objects must produce the same integer result.',
          },
          {
            id: 'jcoll-q3',
            question: 'Which Java Collection implementation guarantees elements remain sorted in natural or comparator-defined order?',
            options: [
              'HashSet',
              'LinkedHashSet',
              'TreeSet',
              'Vector',
            ],
            correctAnswer: 2,
            explanation: 'TreeSet is backed by a NavigableMap (TreeMap) and stores its elements in sorted order according to their natural ordering or a supplied Comparator.',
          },
          {
            id: 'jcoll-q4',
            question: 'What are the default initial capacity and load factor for an empty Java HashMap instance?',
            options: [
              'Capacity 32, Load Factor 0.5',
              'Capacity 16, Load Factor 0.75',
              'Capacity 64, Load Factor 1.0',
              'Capacity 8, Load Factor 0.8',
            ],
            correctAnswer: 1,
            explanation: 'By default, HashMap initializes with a capacity of 16 buckets and a 0.75 load factor, triggering a doubling rehash once 12 entries are populated.',
          },
          {
            id: 'jcoll-q5',
            question: 'How does modern ConcurrentHashMap (Java 8+) achieve high concurrency without locking the entire map?',
            options: [
              'By blocking all reads',
              'Using fine-grained synchronizing on individual bucket head nodes combined with CAS (Compare-And-Swap) operations for empty buckets',
              'By spinning up an OS process per read',
              'By duplicating the entire map in RAM for every thread',
            ],
            correctAnswer: 1,
            explanation: 'Java 8+ ConcurrentHashMap eliminates segment locks, using CAS for lock-free insertions into empty buckets and synchronized locks only on the first node of the relevant bucket chain.',
          },
          {
            id: 'jcoll-q6',
            question: 'Which List implementation provides O(1) instantaneous random access time for the get(int index) operation?',
            options: [
              'LinkedList',
              'ArrayList',
              'TreeList',
              'LinkedBlockingQueue',
            ],
            correctAnswer: 1,
            explanation: 'ArrayList is backed by a contiguous physical array in memory, allowing constant time O(1) pointer arithmetic indexing.',
          },
          {
            id: 'jcoll-q7',
            question: 'Which runtime exception is triggered when a collection is structurally modified while being traversed by an iterator without using iterator.remove()?',
            options: [
              'NullPointerException',
              'ConcurrentModificationException',
              'IndexOutOfBoundsException',
              'IllegalStateException',
            ],
            correctAnswer: 1,
            explanation: 'Standard Java collections implement fail-fast iterators that detect changes in modCount and throw ConcurrentModificationException immediately.',
          },
        ],
      },
    });

    const javaMod4 = await this.adminService.createModule(javaCourse.id, {
      title: 'Module 4: Modern Java: Streams API & Functional Pipelines',
      description: 'Functional Interfaces, Lambda Expressions, Stream filter/map/reduce pipelines.',
      order: 4,
    });

    const javaL4 = await this.adminService.createLesson(javaMod4.id, {
      title: 'Java Streams API: Filter, Map & Collectors',
      slug: 'java-streams-api-pipelines',
      order: 1,
      type: 'coding',
      content: `### Java Streams API
Streams provide a declarative, functional approach to processing collections.

#### Core Stream Operations:
- **Intermediate Operations** (Lazy):
  - \`.filter(Predicate<T>)\`: Filters elements matching condition.
  - \`.map(Function<T, R>)\`: Transforms elements into another type.
  - \`.sorted()\`: Orders elements.
  - \`.distinct()\`: Removes duplicates.
- **Terminal Operations** (Triggers execution):
  - \`.collect(Collectors.toList())\`: Materializes stream to List.
  - \`.reduce(identity, accumulator)\`: Aggregates elements to single value.
  - \`.forEach(Consumer<T>)\`: Executes action for each element.
`,
      learningObjectives: [
        'Construct declarative data pipelines using Streams',
        'Distinguish lazy intermediate vs eager terminal operations',
        'Aggregate collections using Collectors.groupingBy and reduce',
      ],
    });

    await this.adminService.createExercise(javaL4.id, {
      title: 'Hands-on Java: Stream Filtering & Aggregation',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        java: `import java.util.*;
import java.util.stream.Collectors;

public class Main {
    static class Student {
        String name;
        int marks;
        Student(String n, int m) { this.name = n; this.marks = m; }
        public String getName() { return name; }
        public int getMarks() { return marks; }
    }

    public static void main(String[] args) {
        List<Student> students = Arrays.asList(
            new Student("Aarav", 85),
            new Student("Bhavna", 62),
            new Student("Chirag", 92),
            new Student("Divya", 74),
            new Student("Esha", 58)
        );

        // Filter students with marks >= 75 and collect names in uppercase
        List<String> topStudents = students.stream()
            .filter(s -> s.getMarks() >= 75)
            .map(s -> s.getName().toUpperCase())
            .sorted()
            .collect(Collectors.toList());

        System.out.println("Honor Roll: " + topStudents);
    }
}
`,
        javascript: `const students = [
  { name: "Aarav", marks: 85 },
  { name: "Bhavna", marks: 62 },
  { name: "Chirag", marks: 92 },
  { name: "Divya", marks: 74 },
  { name: "Esha", marks: 58 }
];

const topStudents = students
  .filter(s => s.marks >= 75)
  .map(s => s.name.toUpperCase())
  .sort();

console.log("Honor Roll:", topStudents);
`,
      },
      hints: [
        'Use .filter() with a lambda checking marks >= 75',
        'Use .map() to transform student to s.getName().toUpperCase()',
      ],
    });

    this.logger.log('✓ Java Programming Mastery course & exercises verified.');

    // ==========================================
    // 5. COURSE 3: Computer Fundamentals & Digital Architecture
    // ==========================================
    const cfCourse = await this.adminService.createCourse({
      title: 'Computer Fundamentals & Digital Architecture',
      slug: 'computer-fundamentals-architecture',
      description: 'Foundational computer science: Number Systems (Binary/Hex/2s Complement), Logic Gates, CPU Architecture (von Neumann, ALU, Registers), Memory Hierarchy, and Networking.',
      difficulty: 'beginner',
      estimatedMinutes: 90,
      status: 'published',
    });

    const cfMod1 = await this.adminService.createModule(cfCourse.id, {
      title: 'Module 1: Number Systems, Base Conversion & Boolean Logic',
      description: 'Binary, Octal, Hexadecimal conversions, Two Complement representation, and Logic Gates.',
      order: 1,
    });

    const cfL1 = await this.adminService.createLesson(cfMod1.id, {
      title: 'Binary Number Systems, 2s Complement & Logic Gates',
      slug: 'cf-binary-2s-complement-logic-gates',
      order: 1,
      type: 'reading',
      content: `### Number Systems & Binary Arithmetic

#### 1. Number Systems:
- **Binary (Base 2)**: Digits 0, 1.
- **Octal (Base 8)**: Digits 0–7.
- **Hexadecimal (Base 16)**: Digits 0–9, A–F (where A=10, B=11, C=12, D=13, E=14, F=15).

#### 2. Two's Complement (Signed Integers):
To represent negative numbers in binary:
1. Write the positive binary number.
2. Invert all bits (1's complement: $0 \\to 1, 1 \\to 0$).
3. Add 1 to the result.

Example for $-5$ in 8-bit:
- $+5 = 00000101_2$
- 1's complement = $11111010_2$
- Add 1 = **$11111011_2$**

#### 3. Primary Logic Gates:
- **AND**: Output 1 only if BOTH inputs are 1.
- **OR**: Output 1 if AT LEAST ONE input is 1.
- **NOT**: Inverts the input.
- **XOR**: Output 1 if inputs are DIFFERENT ($0 \\oplus 1 = 1, 1 \\oplus 1 = 0$).
- **NAND & NOR**: **Universal Gates** because any boolean function can be constructed using only NAND or only NOR gates.
`,
      learningObjectives: [
        'Convert numbers between Binary, Decimal, and Hexadecimal bases',
        'Compute signed integers using Two Complement representation',
        'Verify truth tables for universal logic gates (NAND, NOR, XOR)',
      ],
    });

    await this.adminService.createExercise(cfL1.id, {
      title: 'Computer Fundamentals: Number Systems & Logic Quiz',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'cf-q1',
            question: 'What is the hexadecimal representation of the 8-bit binary number 11011010?',
            options: [
              '0xDA',
              '0xD8',
              '0xCA',
              '0xBA',
            ],
            correctAnswer: 0,
            explanation: 'Split into two 4-bit nibbles: 1101_2 = 13 = D, and 1010_2 = 10 = A. Thus, 0xDA.',
          },
          {
            id: 'cf-q2',
            question: 'Why are NAND and NOR gates called Universal Gates?',
            options: [
              'Because they consume the lowest electric power',
              'Because any boolean logic function can be synthesized using exclusively NAND or exclusively NOR gates',
              'Because they were the first gates invented',
              'Because they operate on both AC and DC current',
            ],
            correctAnswer: 1,
            explanation: 'NAND and NOR gates are universal because combinations of them can implement NOT, AND, OR, and any arbitrary logic circuit.',
          },
          {
            id: 'cf-q3',
            question: 'What is the 8-bit Two Complement binary representation of decimal -1?',
            options: [
              '10000001',
              '11111111',
              '10000000',
              '11111110',
            ],
            correctAnswer: 1,
            explanation: '+1 is 00000001. Inverting all bits gives 11111110. Adding 1 gives 11111111 (0xFF), which equals -1 in Two Complement arithmetic.',
          },
          {
            id: 'cf-q4',
            question: 'Which logic gate outputs HIGH (1) if and only if exactly one of its two binary inputs is HIGH (1)?',
            options: [
              'AND',
              'OR',
              'XOR (Exclusive OR)',
              'XNOR',
            ],
            correctAnswer: 2,
            explanation: 'The XOR (Exclusive OR) gate yields 1 when the inputs differ (0 and 1, or 1 and 0), and 0 when the inputs are identical.',
          },
          {
            id: 'cf-q5',
            question: 'What is the range of signed integer values that can be stored in an 8-bit Two Complement byte?',
            options: [
              '0 to 255',
              '-128 to +127',
              '-127 to +128',
              '-256 to +255',
            ],
            correctAnswer: 1,
            explanation: 'With n=8 bits, Two Complement represents signed values from -2^(n-1) to +2^(n-1)-1, which evaluates to -128 up to +127.',
          },
          {
            id: 'cf-q6',
            question: 'According to De Morgan laws of Boolean algebra, what is the boolean expression NOT(A AND B) equivalent to?',
            options: [
              '(NOT A) AND (NOT B)',
              '(NOT A) OR (NOT B)',
              'A OR B',
              'NOT A',
            ],
            correctAnswer: 1,
            explanation: 'De Morgan law states: !(A && B) == (!A || !B), and !(A || B) == (!A && !B).',
          },
          {
            id: 'cf-q7',
            question: 'How many binary bits are mathematically required to assign a distinct unique code to 256 different character symbols?',
            options: [
              '7 bits',
              '8 bits',
              '16 bits',
              '32 bits',
            ],
            correctAnswer: 1,
            explanation: 'Since 2^8 = 256, exactly 8 bits (1 byte) are required to enumerate 256 distinct symbols (as in extended ASCII).',
          },
        ],
      },
    });

    const cfMod2 = await this.adminService.createModule(cfCourse.id, {
      title: 'Module 2: CPU Architecture & Instruction Execution Cycle',
      description: 'von Neumann architecture, Registers (PC, IR, MAR, MDR), ALU, and Fetch-Decode-Execute.',
      order: 2,
    });

    const cfL2 = await this.adminService.createLesson(cfMod2.id, {
      title: 'von Neumann Architecture & The Fetch-Decode-Execute Cycle',
      slug: 'cf-von-neumann-cpu-cycle',
      order: 1,
      type: 'reading',
      content: `### Computer Architecture & CPU Internals

#### 1. The von Neumann Architecture:
Central components include:
- **Central Processing Unit (CPU)**: Contains the Arithmetic Logic Unit (ALU) and Control Unit (CU).
- **Primary Memory (RAM)**: Holds both program instructions and data in the same shared memory space.
- **Input / Output (I/O) Mechanisms**.
- **System Buses**:
  - **Data Bus**: Transfers actual data between CPU and memory.
  - **Address Bus**: Specifies the memory address to read/write.
  - **Control Bus**: Carries read/write and synchronization control signals.

#### 2. Key Internal Registers:
- **Program Counter (PC)**: Holds the memory address of the **next** instruction to execute.
- **Instruction Register (IR)**: Holds the current instruction being decoded.
- **Memory Address Register (MAR)**: Holds the address currently being read from or written to memory.
- **Memory Data Register (MDR)**: Holds data read from or waiting to be written to memory.
- **Accumulator (AC)**: Stores intermediate arithmetic/logic results.

#### 3. The Instruction Cycle:
1. **Fetch**: CPU fetches instruction from memory address in PC into IR; increments PC.
2. **Decode**: Control Unit decodes the opcode and determines operand locations.
3. **Execute**: ALU performs arithmetic/logic operation or writes back to memory/registers.
`,
      learningObjectives: [
        'Diagram von Neumann architecture and system bus roles',
        'Trace the role of PC, IR, MAR, and MDR during instruction execution',
        'Explain the stages of the Fetch-Decode-Execute cycle',
      ],
    });

    await this.adminService.createExercise(cfL2.id, {
      title: 'Hands-on Exercise: Register State Machine Simulation',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// Simulate a mini CPU Instruction Cycle:
// Instruction format: { opcode: "ADD"|"LOAD"|"STORE", val: number }
// Maintain PC (Program Counter) and ACC (Accumulator)

function executeMiniCpu(program) {
  let pc = 0;
  let acc = 0;

  while (pc < program.length) {
    const instruction = program[pc];
    pc++; // Fetch & increment PC

    switch (instruction.opcode) {
      case "LOAD":
        acc = instruction.val;
        break;
      case "ADD":
        acc += instruction.val;
        break;
      case "SUB":
        acc -= instruction.val;
        break;
    }
  }

  return { finalPc: pc, finalAcc: acc };
}

// Verification:
const program = [
  { opcode: "LOAD", val: 10 },
  { opcode: "ADD", val: 25 },
  { opcode: "SUB", val: 5 }
];
console.log("CPU State:", executeMiniCpu(program));
`,
        python: `# Mini CPU Instruction Cycle Simulator
def execute_mini_cpu(program):
    pc = 0
    acc = 0
    while pc < len(program):
        inst = program[pc]
        pc += 1
        if inst["opcode"] == "LOAD":
            acc = inst["val"]
        elif inst["opcode"] == "ADD":
            acc += inst["val"]
        elif inst["opcode"] == "SUB":
            acc -= inst["val"]
    return {"finalPc": pc, "finalAcc": acc}

prog = [{"opcode": "LOAD", "val": 10}, {"opcode": "ADD", "val": 25}, {"opcode": "SUB", "val": 5}]
print("CPU State:", execute_mini_cpu(prog))
`,
      },
      hints: [
        'Increment PC immediately upon fetching the instruction',
        'Apply the instruction opcode to the Accumulator register',
      ],
    });

    const cfMod3 = await this.adminService.createModule(cfCourse.id, {
      title: 'Module 3: Memory Hierarchy & Computer Networking Basics',
      description: 'L1/L2/L3 Caches, Cache Hit/Miss, OSI 7-Layer Model, and TCP/IP Networking.',
      order: 3,
    });

    const cfL3 = await this.adminService.createLesson(cfMod3.id, {
      title: 'Memory Hierarchy & The 7-Layer OSI Networking Model',
      slug: 'cf-memory-hierarchy-osi-model',
      order: 1,
      type: 'reading',
      content: `### Memory Hierarchy & Computer Networking

#### 1. Memory Hierarchy:
From fastest/most expensive to slowest/least expensive:
1. **CPU Registers**: < 1 ns access time.
2. **L1, L2, L3 Caches**: Static RAM (SRAM), 1–10 ns.
3. **Main Memory (RAM)**: Dynamic RAM (DRAM), 50–100 ns.
4. **Secondary Storage (NVMe SSD / HDD)**: Microseconds to milliseconds.

#### 2. The OSI 7-Layer Networking Model:
Remember with: *"Please Do Not Throw Sausage Pizza Away"*

| Layer | Name | Protocol Data Unit (PDU) | Core Protocols / Functions |
| :--- | :--- | :--- | :--- |
| **7** | Application | Data | HTTP, HTTPS, DNS, SSH, SMTP |
| **6** | Presentation | Data | SSL/TLS, Encryption, Compression, MIME |
| **5** | Session | Data | RPC, Sockets, Session establishment |
| **4** | Transport | Segment | **TCP** (Reliable, handshake) vs **UDP** (Fast, datagram) |
| **3** | Network | Packet | **IP** (IPv4, IPv6), ICMP, Routers |
| **2** | Data Link | Frame | Ethernet, MAC Addressing, Switches |
| **1** | Physical | Bits | Cables, Radio frequencies, Fiber optics, Hubs |
`,
      learningObjectives: [
        'Analyze latency differences across the computer memory hierarchy',
        'Identify functions and PDUs of all 7 OSI model layers',
        'Compare TCP connection-oriented reliability vs UDP datagram speed',
      ],
    });

    await this.adminService.createExercise(cfL3.id, {
      title: 'Networking & Memory Hierarchy Quiz',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'net-q1',
            question: 'At which OSI model layer do Routers and IP Packet addressing operate?',
            options: [
              'Layer 2 (Data Link Layer)',
              'Layer 3 (Network Layer)',
              'Layer 4 (Transport Layer)',
              'Layer 5 (Session Layer)',
            ],
            correctAnswer: 1,
            explanation: 'Layer 3 (Network Layer) is responsible for logical packet addressing (IPv4/IPv6) and routing between disparate networks.',
          },
          {
            id: 'net-q2',
            question: 'What is the primary difference between SRAM and DRAM?',
            options: [
              'DRAM is faster than SRAM and used in CPU registers',
              'SRAM uses flip-flops and does not need periodic refreshing; DRAM uses capacitors and must be refreshed millions of times per second',
              'SRAM is non-volatile while DRAM loses data without power',
              'DRAM is exclusively used for secondary disk storage',
            ],
            correctAnswer: 1,
            explanation: 'SRAM uses bistable latching circuitry (flip-flops) providing fast cache access without refresh cycles. DRAM stores charge in capacitors requiring periodic refresh.',
          },
          {
            id: 'net-q3',
            question: 'Which Transport Layer protocol guarantees in-order reliable data delivery using a 3-Way Handshake (SYN, SYN-ACK, ACK)?',
            options: [
              'UDP (User Datagram Protocol)',
              'TCP (Transmission Control Protocol)',
              'ICMP',
              'ARP',
            ],
            correctAnswer: 1,
            explanation: 'TCP establishes a stateful, reliable connection with sequence numbers, flow control, and retransmissions via a three-way handshake.',
          },
          {
            id: 'net-q4',
            question: 'What principle of CPU cache design states that when a memory address is accessed, contiguous nearby addresses will likely be accessed soon?',
            options: [
              'Temporal Locality',
              'Spatial Locality',
              'Branch Prediction',
              'Out-of-Order Execution',
            ],
            correctAnswer: 1,
            explanation: 'Spatial Locality states that contiguous memory addresses will likely be referenced soon, which is why caches load entire cache lines (typically 64 bytes).',
          },
          {
            id: 'net-q5',
            question: 'What is the Protocol Data Unit (PDU) at Layer 2 (Data Link Layer) of the OSI model?',
            options: [
              'Packet',
              'Frame',
              'Segment',
              'Bit',
            ],
            correctAnswer: 1,
            explanation: 'Layer 2 formats data into Frames containing source and destination MAC addresses, error detection CRCs, and payload.',
          },
          {
            id: 'net-q6',
            question: 'Which layer of the OSI 7-layer model is responsible for data encryption (SSL/TLS), character encoding, and data compression?',
            options: [
              'Layer 7 (Application)',
              'Layer 6 (Presentation)',
              'Layer 5 (Session)',
              'Layer 4 (Transport)',
            ],
            correctAnswer: 1,
            explanation: 'Layer 6 (Presentation Layer) handles syntax translation, compression, and cryptography/encryption like TLS.',
          },
          {
            id: 'net-q7',
            question: 'What hardware controller mechanism enables network cards and disks to transfer data blocks directly to RAM without burning CPU cycles for every byte?',
            options: [
              'ALU Arithmetic Logic Unit',
              'DMA (Direct Memory Access)',
              'TLB Translation Lookaside Buffer',
              'Program Counter Register',
            ],
            correctAnswer: 1,
            explanation: 'DMA controllers transfer blocks of data directly between I/O peripherals and system RAM, firing an interrupt only when the complete transfer is finished.',
          },
        ],
      },
    });

    // Computer Fundamentals Module 4: Floating Point & Storage Architectures
    const cfMod4 = await this.adminService.createModule(cfCourse.id, {
      title: 'Module 4: Floating Point Representation & Storage RAID Systems',
      description: 'IEEE-754 Standard (Single vs Double Precision), RAID 0, 1, 5, 10, and Direct Memory Access (DMA).',
      order: 4,
    });

    const cfL4 = await this.adminService.createLesson(cfMod4.id, {
      title: 'IEEE-754 Floating Point & RAID Storage Reliability',
      slug: 'cf-ieee754-float-raid-storage',
      order: 1,
      type: 'coding',
      content: `### Floating-Point Representation & Storage RAID Architecture

#### 1. IEEE-754 Standard (32-bit Single Precision):
Divided into three distinct bit fields:
- **1 Sign Bit ($S$)**: 0 for positive, 1 for negative.
- **8 Exponent Bits ($E$)**: Biased by $+127$. Actual exponent $= E - 127$.
- **23 Fraction/Mantissa Bits ($M$)**: Normalized form $1.M$.
$$V = (-1)^S \\times 1.M \\times 2^{E - 127}$$

#### 2. RAID Storage Architectures:
- **RAID 0 (Striping)**: Data split across disks. Zero redundancy, double read/write performance.
- **RAID 1 (Mirroring)**: Full replica copies. 100% redundancy, 50% storage efficiency.
- **RAID 5 (Block Striping with Distributed Parity)**: Requires minimum 3 disks. Survives 1 disk failure. Efficiency: $(N - 1) / N$.
- **Direct Memory Access (DMA)**: I/O device transfers blocks directly to/from RAM without loading the CPU per byte.
`,
      learningObjectives: [
        'Decode IEEE-754 32-bit floating point bit fields',
        'Calculate storage efficiency and fault tolerance across RAID levels',
        'Analyze DMA channel operation and interrupt mechanisms',
      ],
    });

    await this.adminService.createExercise(cfL4.id, {
      title: 'Hands-on Exercise: RAID 5 Parity Calculation Simulator',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// RAID 5 Parity Simulator:
// In RAID 5, parity is calculated using bitwise XOR across data disk blocks:
// Parity = Block1 XOR Block2 XOR ...
// If any single disk fails, its data can be reconstructed by XORing the surviving disks with the Parity!

function calculateRaid5Parity(dataBlocks) {
  // dataBlocks: [0b1011, 0b1100, 0b0110]
  return dataBlocks.reduce((parity, block) => parity ^ block, 0);
}

function recoverFailedDisk(survivingBlocks, parity) {
  // Reconstruct missing data:
  return survivingBlocks.reduce((rec, block) => rec ^ block, parity);
}

// Verification:
const disk1 = 0b10110011;
const disk2 = 0b11001010;
const parity = calculateRaid5Parity([disk1, disk2]);
console.log("Computed Parity:", parity.toString(2));
console.log("Recovered Disk 1:", recoverFailedDisk([disk2], parity).toString(2));
`,
        python: `# RAID 5 Parity Calculation & Recovery Simulator
def calculate_raid5_parity(data_blocks):
    parity = 0
    for block in data_blocks:
        parity ^= block
    return parity

def recover_failed_disk(surviving_blocks, parity):
    recovered = parity
    for block in surviving_blocks:
        recovered ^= block
    return recovered

disk1 = 0b10110011
disk2 = 0b11001010
parity = calculate_raid5_parity([disk1, disk2])
print("Computed Parity:", bin(parity))
print("Recovered Disk 1:", bin(recover_failed_disk([disk2], parity)))
`,
      },
      hints: [
        'XOR operation has the algebraic property: A ^ B ^ A = B',
        'Use the bitwise XOR operator (^) across all data blocks',
      ],
    });

    this.logger.log('✓ Computer Fundamentals course & exercises verified.');

    // ==========================================
    // 6. COURSE 4: Operating Systems (Core Systems)
    // ==========================================
    const osCourse = await this.adminService.createCourse({
      title: 'Operating Systems (OS) Core Systems Engineering',
      slug: 'operating-systems-engineering',
      description: 'Comprehensive core systems curriculum: Process Lifecycle, CPU Scheduling (Round Robin/SJF), Concurrency & Semaphores, Deadlock Banker Algorithm, and Virtual Memory Paging.',
      difficulty: 'advanced',
      estimatedMinutes: 120,
      status: 'published',
    });

    const osMod1 = await this.adminService.createModule(osCourse.id, {
      title: 'Module 1: Processes, Threads & Context Switching',
      description: 'Process states, Process Control Block (PCB), Kernel vs User mode, and System Calls.',
      order: 1,
    });

    const osL1 = await this.adminService.createLesson(osMod1.id, {
      title: 'Process Lifecycle, PCB & Dual-Mode CPU Operation',
      slug: 'os-process-lifecycle-dual-mode',
      order: 1,
      type: 'reading',
      content: `### Operating System Kernel & Processes

#### 1. Dual-Mode CPU Operation:
- **User Mode**: Application software executes here. Direct access to hardware memory and I/O ports is prohibited.
- **Kernel (Supervisor) Mode**: OS kernel executes here with unrestricted hardware privilege.
- **System Call (\`syscall\`)**: A software interrupt used by applications to request OS services (e.g., \`read()\`, \`write()\`, \`fork()\`). The CPU switches mode bits from User $\\to$ Kernel.

#### 2. Process vs Thread:
- **Process**: An instance of a program in execution with its own private address space (Text, Data, Heap, Stack). Heavyweight.
- **Thread**: A lightweight unit of CPU utilization within a process. Threads in the same process **share the same Heap, global data, and file descriptors**, but each thread has its own **private Stack and Registers**.

#### 3. Process Control Block (PCB):
Contains: Process ID (PID), Process State (New, Ready, Running, Waiting, Terminated), Program Counter, CPU registers, CPU scheduling priority, and open file pointers.
`,
      learningObjectives: [
        'Differentiate User Mode vs Kernel Mode hardware protection',
        'Compare memory sharing in Processes vs Threads',
        'Analyze fields of the Process Control Block (PCB)',
      ],
    });

    await this.adminService.createExercise(osL1.id, {
      title: 'Operating Systems: Process & Kernel Mode Quiz',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'os-q1',
            question: 'What mechanism causes the CPU hardware mode bit to switch from User Mode to Kernel Mode?',
            options: [
              'A standard while loop iteration',
              'A System Call, Hardware Interrupt, or Trap',
              'A CSS animation repaint',
              'A local variable assignment on the stack',
            ],
            correctAnswer: 1,
            explanation: 'System calls, hardware interrupts, or CPU exceptions switch the CPU into kernel mode to handle the privileged request safely.',
          },
          {
            id: 'os-q2',
            question: 'What do multiple threads within the exact same process share?',
            options: [
              'Their private execution stack and registers',
              'The heap memory, global data segment, and open file handles',
              'Nothing; threads have isolated virtual memory spaces',
              'Their CPU Program Counter exclusively',
            ],
            correctAnswer: 1,
            explanation: 'Threads share the code segment, data segment, heap, and OS resources like open files, while retaining individual stacks and PC registers.',
          },
          {
            id: 'os-q3',
            question: 'What kernel data structure stores the execution state, Program Counter, CPU registers, and scheduling priority of a process?',
            options: [
              'Process Control Block (PCB)',
              'Translation Lookaside Buffer (TLB)',
              'File Allocation Table (FAT)',
              'Interrupt Descriptor Table (IDT)',
            ],
            correctAnswer: 0,
            explanation: 'The PCB (Process Control Block) is the central kernel record maintaining all runtime attributes and register snapshots for a process.',
          },
          {
            id: 'os-q4',
            question: 'What sequence of operations occurs during an operating system Context Switch?',
            options: [
              'Hard drive formatting',
              'Saving the CPU register state of the running process to its PCB and loading the saved register state of the newly scheduled process',
              'Compiling source code to binary bytecode',
              'Flushing all physical RAM to swap space',
            ],
            correctAnswer: 1,
            explanation: 'Context switching incurs OS overhead by preserving the exact CPU hardware context (registers, stack pointer, program counter) of the outgoing task and restoring the incoming task.',
          },
          {
            id: 'os-q5',
            question: 'When a running process initiates a disk read or network socket receive operation, to which state is it transitioned by the OS?',
            options: [
              'Ready state',
              'Waiting / Blocked state',
              'Terminated state',
              'Zombie state',
            ],
            correctAnswer: 1,
            explanation: 'Processes awaiting an external I/O event move to the Waiting (Blocked) state, relinquishing the CPU to other Ready processes until the I/O interrupt fires.',
          },
          {
            id: 'os-q6',
            question: 'What is a "Zombie Process" in Unix-like operating systems?',
            options: [
              'A process that consumed 100% of memory and crashed the kernel',
              'A process that has completed execution but remains in the process table because its parent has not yet read its exit status with wait()',
              'A background daemon process running with root privileges',
              'A process executing infinite while(true) loops',
            ],
            correctAnswer: 1,
            explanation: 'A zombie process has exited and freed its memory, but retains an entry in the OS process table with its termination code until its parent reaps it via wait() or waitpid().',
          },
          {
            id: 'os-q7',
            question: 'What is the key difference between Preemptive and Non-Preemptive CPU scheduling policies?',
            options: [
              'Preemptive scheduling can forcibly suspend a currently executing process when a timer interrupt or higher-priority job arrives',
              'Non-preemptive scheduling uses multiple CPUs while preemptive uses only one',
              'Preemptive scheduling deletes paused processes from disk',
              'There is no difference in modern operating systems',
            ],
            correctAnswer: 0,
            explanation: 'Preemptive schedulers can interrupt executing processes (e.g. Round Robin time slice expiration), whereas non-preemptive schedulers allow a process to run until it yields or blocks.',
          },
        ],
      },
    });

    const osMod2 = await this.adminService.createModule(osCourse.id, {
      title: 'Module 2: CPU Scheduling Algorithms',
      description: 'First-Come First-Served (FCFS), Shortest Job First (SJF), Priority, and Round Robin (RR).',
      order: 2,
    });

    const osL2 = await this.adminService.createLesson(osMod2.id, {
      title: 'CPU Scheduling: Round Robin & Turnaround Time Optimization',
      slug: 'os-cpu-scheduling-round-robin',
      order: 1,
      type: 'coding',
      content: `### CPU Scheduling Algorithms

CPU scheduling selects a process from the Ready Queue to execute on the CPU core:

1. **FCFS (First-Come First-Served)**: Non-preemptive. Suffers from the **Convoy Effect** (short processes wait behind a massive CPU burst process).
2. **SJF (Shortest Job First)**: Provably optimal minimum average waiting time. Preemptive version is called **SRTF** (Shortest Remaining Time First).
3. **Round Robin (RR)**: Preemptive. Each process receives a fixed **Time Quantum** ($q$). If the process doesn't finish within $q$, it is pre-empted and moved to the back of the queue.

#### Key Metrics:
- **Turnaround Time** = Completion Time $-$ Arrival Time
- **Waiting Time** = Turnaround Time $-$ Burst Time
`,
      learningObjectives: [
        'Calculate Turnaround Time and Waiting Time across scheduling algorithms',
        'Simulate Round Robin execution with a fixed Time Quantum',
        'Analyze Convoy Effect in FCFS vs Starvation in SJF',
      ],
    });

    await this.adminService.createExercise(osL2.id, {
      title: 'Hands-on OS: Round Robin Scheduler Simulation',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// Implement a Round Robin CPU Scheduler:
// Given an array of processes with burst times and a time quantum q,
// compute the average waiting time.

function roundRobinAverageWait(processes, quantum) {
  // processes: [{ id: "P1", burst: 10 }, { id: "P2", burst: 5 }, { id: "P3", burst: 8 }]
  const remaining = processes.map(p => ({ ...p, rem: p.burst, wait: 0, finished: false }));
  let currentTime = 0;
  let completed = 0;

  while (completed < processes.length) {
    let progressed = false;
    for (let i = 0; i < remaining.length; i++) {
      const p = remaining[i];
      if (p.rem > 0) {
        progressed = true;
        const timeSpent = Math.min(quantum, p.rem);
        p.rem -= timeSpent;
        currentTime += timeSpent;
        if (p.rem === 0) {
          p.finished = true;
          completed++;
          p.wait = currentTime - p.burst;
        }
      }
    }
    if (!progressed) break;
  }

  const totalWait = remaining.reduce((sum, p) => sum + p.wait, 0);
  return Number((totalWait / processes.length).toFixed(2));
}

// Verification:
const procs = [{ id: "P1", burst: 6 }, { id: "P2", burst: 4 }, { id: "P3", burst: 2 }];
console.log("Average Waiting Time (q=2):", roundRobinAverageWait(procs, 2));
`,
        python: `# Round Robin CPU Scheduler Simulator
def round_robin_wait(processes, quantum):
    rem_burst = [p["burst"] for p in processes]
    wait_times = [0] * len(processes)
    current_time = 0

    while True:
        done = True
        for i in range(len(processes)):
            if rem_burst[i] > 0:
                done = False
                if rem_burst[i] > quantum:
                    current_time += quantum
                    rem_burst[i] -= quantum
                else:
                    current_time += rem_burst[i]
                    wait_times[i] = current_time - processes[i]["burst"]
                    rem_burst[i] = 0
        if done:
            break
    return round(sum(wait_times) / len(processes), 2)

procs = [{"id": "P1", "burst": 6}, {"id": "P2", "burst": 4}, {"id": "P3", "burst": 2}]
print("Average Waiting Time (q=2):", round_robin_wait(procs, 2))
`,
      },
      hints: [
        'Iterate through the processes in round-robin order allocating up to quantum units',
        'When a process finishes, its waiting time is total completion time minus burst time',
      ],
    });

    const osMod3 = await this.adminService.createModule(osCourse.id, {
      title: 'Module 3: Deadlocks & Banker Algorithm',
      description: 'Coffman 4 Conditions, Resource Allocation Graphs, and Banker Safety Algorithm.',
      order: 3,
    });

    const osL3 = await this.adminService.createLesson(osMod3.id, {
      title: 'Deadlock Conditions & The Bankers Safety Algorithm',
      slug: 'os-deadlocks-banker-algorithm',
      order: 1,
      type: 'reading',
      content: `### Deadlocks in Operating Systems

A **Deadlock** is a state where a set of processes are blocked because each process holds a resource and waits for another resource held by another process.

#### The 4 Coffman Conditions (Must all hold simultaneously):
1. **Mutual Exclusion**: At least one resource is non-shareable.
2. **Hold and Wait**: A process holds at least one resource and is waiting to acquire others.
3. **No Preemption**: Resources cannot be forcibly taken; only released voluntarily.
4. **Circular Wait**: A closed chain of processes exists where $P_0$ waits for $P_1$, $P_1$ waits for $P_2$, ..., and $P_n$ waits for $P_0$.

#### Banker's Algorithm (Dijkstra):
Used for **Deadlock Avoidance** by testing for a **Safe State** before granting any resource request:
$$\\text{Need}[i][j] = \\text{Max}[i][j] - \\text{Allocation}[i][j]$$
If there exists a process sequence $\\langle P_1, P_2, \\dots, P_n \\rangle$ such that for each $P_i$, $\\text{Need}_i \\le \\text{Available}$, the system is in a **Safe State** and guaranteed deadlock-free!
`,
      learningObjectives: [
        'Verify all 4 Coffman conditions required for deadlock',
        'Compute Need matrices in resource allocation problems',
        'Execute Banker safety algorithm to determine safe execution sequences',
      ],
    });

    await this.adminService.createExercise(osL3.id, {
      title: 'OS Deadlock & Banker Algorithm Mastery Quiz',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'dl-q1',
            question: 'Which of the following is NOT one of the 4 Coffman conditions for deadlock?',
            options: [
              'Mutual Exclusion',
              'Hold and Wait',
              'Preemptive Resource Reallocation',
              'Circular Wait',
            ],
            correctAnswer: 2,
            explanation: 'The condition is NO Preemption. If resources can be preempted, deadlock cannot occur.',
          },
          {
            id: 'dl-q2',
            question: 'What is the purpose of Dijkstra Banker Algorithm in operating systems?',
            options: [
              'To encrypt user file passwords',
              'To dynamically determine if granting a resource request leaves the system in a safe state, preventing deadlocks',
              'To schedule memory cache invalidation',
              'To detect packet collisions on Ethernet',
            ],
            correctAnswer: 1,
            explanation: 'Bankers algorithm tests whether a safe execution sequence exists where all processes can finish without deadlocking before granting resource allocations.',
          },
          {
            id: 'dl-q3',
            question: 'In Dijkstra Banker Algorithm, how is the Need matrix for process i calculated?',
            options: [
              'Need = Max + Allocation',
              'Need = Max - Allocation',
              'Need = Available - Max',
              'Need = Allocation / 2',
            ],
            correctAnswer: 1,
            explanation: 'The Need matrix indicates remaining resource requirements and is computed as Need[i][j] = Max[i][j] - Allocation[i][j].',
          },
          {
            id: 'dl-q4',
            question: 'How can an operating system architecturally eliminate the possibility of Circular Wait?',
            options: [
              'By allocating all CPU cores to a single thread',
              'By establishing a strict total linear ordering of all resource types and requiring processes to request resources in strictly increasing order',
              'By disabling all virtual memory',
              'By running only 1 process at a time',
            ],
            correctAnswer: 1,
            explanation: 'Imposing a strict global numbering order (e.g. F(R1) < F(R2)) ensures cycles in resource allocation graphs cannot form.',
          },
          {
            id: 'dl-q5',
            question: 'For a system where each resource type has only a single instance, what condition in a Wait-For Graph (WFG) indicates a deadlock?',
            options: [
              'A leaf node with zero incoming edges',
              'The presence of a directed cycle in the graph',
              'An isolated disconnected node',
              'A tree with depth greater than 3',
            ],
            correctAnswer: 1,
            explanation: 'In single-instance resource systems, a directed cycle in the Resource-Allocation or Wait-For Graph is both necessary and sufficient for a deadlock.',
          },
          {
            id: 'dl-q6',
            question: 'What is the "Ostrich Algorithm" in operating system deadlock theory?',
            options: [
              'A randomized greedy scheduling heuristic',
              'Sticking ones head in the sand: ignoring deadlocks entirely based on the pragmatic assumption that they occur infrequently enough that the cost of prevention outweighs the cost of rare reboots',
              'A fast memory compaction routine',
              'A hardware watchdog timer',
            ],
            correctAnswer: 1,
            explanation: 'Most general-purpose OS kernels (such as standard Linux and Windows) employ the Ostrich algorithm for general user processes because runtime deadlock detection overhead is prohibitive.',
          },
          {
            id: 'dl-q7',
            question: 'When a deadlock detection algorithm identifies a deadlocked cycle of processes, what is the standard recovery action taken by the kernel?',
            options: [
              'Rewriting the BIOS firmware',
              'Terminating one or more deadlocked processes and preempting their allocated resources until the dependency cycle breaks',
              'Increasing the CPU clock speed',
              'Disabling hardware interrupts',
            ],
            correctAnswer: 1,
            explanation: 'Recovery requires breaking the cycle by terminating processes (either all deadlocked ones or one-by-one by lowest priority/lowest cost) and rolling back their state.',
          },
        ],
      },
    });

    const osMod4 = await this.adminService.createModule(osCourse.id, {
      title: 'Module 4: Virtual Memory, Paging & Page Replacement',
      description: 'Paging, Translation Lookaside Buffer (TLB), Page Faults, FIFO, LRU, and Optimal replacement.',
      order: 4,
    });

    const osL4 = await this.adminService.createLesson(osMod4.id, {
      title: 'Virtual Memory Paging & LRU Page Replacement',
      slug: 'os-virtual-memory-paging-lru',
      order: 1,
      type: 'coding',
      content: `### Virtual Memory & Paging Architecture

#### 1. Paging:
- Memory is split into fixed-size physical blocks called **Frames** and logical program blocks called **Pages**.
- **Page Table**: Translates logical addresses $(p, d)$ into physical addresses $(f, d)$.
- **TLB (Translation Lookaside Buffer)**: High-speed hardware associative cache holding recent page-to-frame mappings.
  $$\\text{Effective Access Time (EAT)} = (h \\times (t + m)) + ((1 - h) \\times (t + 2m))$$
  where $h = \\text{TLB hit ratio}, t = \\text{TLB lookup time}, m = \\text{memory access time}$.

#### 2. Page Replacement Algorithms:
When physical memory is full and a page fault occurs:
- **FIFO**: Replaces oldest page. Suffers from **Belady Anomaly** (increasing frame count can increase page faults!).
- **LRU (Least Recently Used)**: Replaces the page that has not been referenced for the longest time. Optimal practical policy.
- **Optimal (OPT)**: Replaces page that will not be used for longest future time (theoretical benchmark).
`,
      learningObjectives: [
        'Diagram page-to-frame translation via the Page Table and TLB',
        'Compute Effective Access Time with TLB hit ratios',
        'Simulate LRU and FIFO page replacement and explain Belady anomaly',
      ],
    });

    await this.adminService.createExercise(osL4.id, {
      title: 'Hands-on OS: LRU Page Replacement Cache Simulation',
      type: 'coding',
      marks: 15,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `// Implement an LRU (Least Recently Used) Page Replacement Simulator:
// Given an array of page references and capacity of physical memory frames,
// calculate the total number of Page Faults.

function countPageFaultsLRU(pages, capacity) {
  const memory = []; // Holds current page numbers
  let pageFaults = 0;

  for (const page of pages) {
    const idx = memory.indexOf(page);
    if (idx !== -1) {
      // Page Hit: Move page to end to mark as most recently used
      memory.splice(idx, 1);
      memory.push(page);
    } else {
      // Page Fault!
      pageFaults++;
      if (memory.length >= capacity) {
        memory.shift(); // Evict least recently used (first item)
      }
      memory.push(page);
    }
  }

  return pageFaults;
}

// Verification:
const pageReferences = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
console.log("Total Page Faults (capacity=3):", countPageFaultsLRU(pageReferences, 3));
`,
        python: `# LRU Page Replacement Simulator
def count_page_faults_lru(pages, capacity):
    memory = []
    page_faults = 0
    for page in pages:
        if page in memory:
            memory.remove(page)
            memory.append(page)
        else:
            page_faults += 1
            if len(memory) >= capacity:
                memory.pop(0)
            memory.append(page)
    return page_faults

refs = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2]
print("Total Page Faults (capacity=3):", count_page_faults_lru(refs, 3))
`,
      },
      hints: [
        'On page hit, update the position of the hit page to the tail of your list',
        'On page fault with full capacity, pop the oldest page from the head',
      ],
    });

    this.logger.log('✓ Operating Systems course & exercises verified.');

    // ==========================================
    // 7. PUBLISH / UPDATE LEARNING PATHS
    // ==========================================
    this.logger.log('🔗 Linking courses to comprehensive Learning Paths...');

    // 1. Core CS Curriculum Bundle
    try {
      const csCorePath = await this.adminService.createPath({
        title: 'Computer Science Core Engineering Suite (B.Tech 1st - 4th Year)',
        slug: 'cs-core-engineering',
        description: 'The complete foundational curriculum required for university exams, GATE, and tier-1 product technical interviews: Computer Fundamentals, Operating Systems, DBMS, and Java Mastery.',
        difficulty: 'intermediate',
        estimatedHours: 40,
        tags: ['CS Core', 'DBMS', 'Operating Systems', 'Java', 'Computer Fundamentals', 'GATE', 'Interview Prep'],
        status: 'published',
        courseIds: [cfCourse.id, osCourse.id, dbmsCourse.id, javaCourse.id],
      });
      if (csCorePath) await this.adminService.publishPath(csCorePath.id);
    } catch (err: any) {
      this.logger.debug(`cs-core-engineering path setup: ${err?.message}`);
    }

    // 2. Individual DBMS Mastery Path
    try {
      const dbmsPath = await this.adminService.createPath({
        title: 'Database Management Systems (DBMS) Complete Mastery',
        slug: 'dbms-mastery',
        description: 'Master relational databases from DDL/DML, Joins, and 1NF-BCNF Normalization to ACID transactions, Two-Phase Locking, and B+ Tree indexing.',
        difficulty: 'intermediate',
        estimatedHours: 12,
        tags: ['DBMS', 'SQL', 'Normalization', 'ACID', 'Indexing', 'Databases'],
        status: 'published',
        courseIds: [dbmsCourse.id],
      });
      if (dbmsPath) await this.adminService.publishPath(dbmsPath.id);
    } catch (err: any) {
      this.logger.debug(`dbms-mastery path setup: ${err?.message}`);
    }

    // 3. Individual Java Mastery Path
    try {
      const javaPath = await this.adminService.createPath({
        title: 'Java Programming & Object-Oriented Architecture',
        slug: 'java-mastery',
        description: 'Complete Java mastery: JVM memory layout, OOP principles, Collections Framework, Exception Handling, Streams API, and multithreading.',
        difficulty: 'intermediate',
        estimatedHours: 14,
        tags: ['Java', 'JVM', 'OOP', 'Collections', 'Streams', 'Multithreading'],
        status: 'published',
        courseIds: [javaCourse.id],
      });
      if (javaPath) await this.adminService.publishPath(javaPath.id);
    } catch (err: any) {
      this.logger.debug(`java-mastery path setup: ${err?.message}`);
    }

    // 4. Individual Operating Systems Path
    try {
      const osPath = await this.adminService.createPath({
        title: 'Operating Systems & Systems Engineering',
        slug: 'operating-systems-mastery',
        description: 'Core OS concepts: Process scheduling, Peterson algorithm, Semaphores, Deadlock Banker algorithm, and Virtual Memory Paging.',
        difficulty: 'advanced',
        estimatedHours: 15,
        tags: ['Operating Systems', 'Kernel', 'Processes', 'Scheduling', 'Deadlocks', 'Paging'],
        status: 'published',
        courseIds: [osCourse.id],
      });
      if (osPath) await this.adminService.publishPath(osPath.id);
    } catch (err: any) {
      this.logger.debug(`operating-systems-mastery path setup: ${err?.message}`);
    }

    // 5. Individual Computer Fundamentals Path
    try {
      const cfPath = await this.adminService.createPath({
        title: 'Computer Fundamentals & Digital Architecture',
        slug: 'computer-fundamentals-mastery',
        description: 'Binary number systems, Two complement arithmetic, Logic gates, von Neumann CPU architecture, and 7-layer OSI networking.',
        difficulty: 'beginner',
        estimatedHours: 10,
        tags: ['Fundamentals', 'Binary', 'Logic Gates', 'von Neumann', 'Networking', 'OSI Model'],
        status: 'published',
        courseIds: [cfCourse.id],
      });
      if (cfPath) await this.adminService.publishPath(cfPath.id);
    } catch (err: any) {
      this.logger.debug(`computer-fundamentals-mastery path setup: ${err?.message}`);
    }

    this.logger.log('🎉 All 5 Core Courses and Paths auto-seeded and published successfully!');
  }
}
