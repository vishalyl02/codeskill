// Repeatable local fixtures for testing sequential and unrestricted assessments.
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const backend = path.resolve(__dirname, '../backend-nestjs');
require(path.join(backend, 'node_modules/dotenv')).config({
  path: path.join(backend, '.env'),
  quiet: true,
});

const { Client } = require(path.join(backend, 'node_modules/pg'));
const bcrypt = require(path.join(backend, 'node_modules/bcryptjs'));

const mcqs = [
  ['Which data structure follows First-In, First-Out ordering?', ['Stack', 'Queue', 'Tree', 'Graph'], 1, 'A queue removes items in insertion order.'],
  ['What is the average time complexity of binary search?', ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'], 1, 'Binary search halves the remaining search interval each step.'],
  ['Which SQL clause filters grouped records?', ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], 1, 'HAVING filters rows after GROUP BY aggregation.'],
  ['What is a primary key used for?', ['Sorting data', 'Uniquely identifying a row', 'Encrypting a table', 'Creating a backup'], 1, 'A primary key uniquely identifies each row.'],
  ['Which protocol provides secure web communication?', ['HTTP', 'FTP', 'SMTP', 'HTTPS'], 3, 'HTTPS uses TLS to secure HTTP communication.'],
  ['Which sorting algorithm commonly uses divide and conquer?', ['Bubble sort', 'Insertion sort', 'Merge sort', 'Selection sort'], 2, 'Merge sort recursively divides and merges sorted halves.'],
  ['What is the result of 7 % 3 in most programming languages?', ['1', '2', '3', '4'], 0, '7 divided by 3 leaves remainder 1.'],
  ['Which traversal visits a binary tree left, root, right?', ['Preorder', 'Inorder', 'Postorder', 'Level order'], 1, 'Inorder traversal is left, node, right.'],
  ['Which keyword declares an immutable binding in JavaScript?', ['var', 'let', 'const', 'static'], 2, 'const creates a binding that cannot be reassigned.'],
  ['What does HTTP status 404 represent?', ['Success', 'Unauthorized', 'Not found', 'Server error'], 2, 'HTTP 404 means the requested resource was not found.'],
];

const coding = [
  {
    title: 'Sum of Two Integers',
    question: 'Read two integers and print their sum.',
    cases: [['2 3', '5', false], ['-4 7', '3', false], ['1000000 2500000', '3500000', true]],
  },
  {
    title: 'Difference of Two Integers',
    question: 'Read two integers a and b. Print a minus b.',
    cases: [['10 4', '6', false], ['3 8', '-5', false], ['0 0', '0', true]],
  },
  {
    title: 'Maximum of Three Integers',
    question: 'Read three integers and print the greatest value.',
    cases: [['3 9 5', '9', false], ['-2 -8 -4', '-2', false], ['7 7 7', '7', true]],
  },
  {
    title: 'Factorial',
    question: 'Read a non-negative integer n and print n factorial.',
    cases: [['5', '120', false], ['0', '1', false], ['10', '3628800', true]],
  },
  {
    title: 'Nth Fibonacci Number',
    question: 'Read n and print the nth Fibonacci number, with F(0)=0 and F(1)=1.',
    cases: [['0', '0', false], ['6', '8', false], ['20', '6765', true]],
  },
  {
    title: 'Reverse a String',
    question: 'Read a string without spaces and print it reversed.',
    cases: [['hello', 'olleh', false], ['codeskill', 'lliksedoc', false], ['a', 'a', true]],
  },
  {
    title: 'Count Vowels',
    question: 'Read a lowercase string and print its number of vowels (a, e, i, o, u).',
    cases: [['hello', '2', false], ['rhythm', '0', false], ['education', '5', true]],
  },
  {
    title: 'Count Even Numbers',
    question: 'Read n followed by n integers. Print how many integers are even.',
    cases: [['5\n1 2 3 4 6', '3', false], ['3\n-2 0 7', '2', false], ['1\n11', '0', true]],
  },
  {
    title: 'Check Palindrome',
    question: 'Read a string without spaces. Print YES if it is a palindrome, otherwise NO.',
    cases: [['level', 'YES', false], ['hello', 'NO', false], ['a', 'YES', true]],
  },
  {
    title: 'Sum of an Array',
    question: 'Read n followed by n integers. Print the sum of all integers.',
    cases: [['4\n1 2 3 4', '10', false], ['3\n-5 0 5', '0', false], ['5\n10 20 30 40 50', '150', true]],
  },
];

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || process.env.NODE_ENV === 'production') {
    throw new Error('This fixture seeder is restricted to the local development database');
  }

  const db = new Client({ connectionString: url.toString() });
  await db.connect();

  const schemas = new Map();
  const rows = (await db.query(
    "SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public'",
  )).rows;
  for (const row of rows) {
    if (!schemas.has(row.table_name)) schemas.set(row.table_name, new Map());
    schemas.get(row.table_name).set(row.column_name, row.data_type);
  }

  const put = async (table, key, body) => {
    const columns = schemas.get(table);
    if (!columns) throw new Error(`Missing table ${table}`);

    const keys = Object.keys(key);
    const where = keys.map((keyName, index) => `"${keyName}"=$${index + 1}`).join(' AND ');
    const found = (await db.query(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`, Object.values(key))).rows[0];

    const data = { ...body, ...key, id: found?.id || body.id || randomUUID() };
    const names = Object.keys(data);
    const unknown = names.filter((name) => !columns.has(name));
    if (unknown.length) throw new Error(`Unknown seed column in ${table}: ${unknown.join(',')}`);

    const values = names.map((name) =>
      columns.get(name) === 'jsonb' || columns.get(name) === 'json'
        ? JSON.stringify(data[name])
        : data[name],
    );

    const result = await db.query(
      `INSERT INTO "${table}" (${names.map((name) => `"${name}"`).join(',')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(',')})
       ON CONFLICT (id) DO UPDATE SET ${names
         .filter((name) => name !== 'id')
         .map((name) => `"${name}"=EXCLUDED."${name}"`)
         .join(',')}
       RETURNING *`,
      values,
    );
    return result.rows[0];
  };

  try {
    await db.query('BEGIN');

    let admin = (await db.query(
      'SELECT * FROM users WHERE email=$1 OR "isAdmin"=true ORDER BY CASE WHEN email=$1 THEN 0 ELSE 1 END LIMIT 1',
      ['admin.test@codeskill.local'],
    )).rows[0];
    if (!admin) {
      admin = await put('users', { email: 'admin.test@codeskill.local' }, {
        name: 'Test Administrator',
        username: 'test-admin',
        uid: 'TEST-ADMIN',
        role: 'super_admin',
        isAdmin: true,
        password: await bcrypt.hash('Admin@123', 10),
        isActive: true,
        isAssessmentStudent: false,
        forcePasswordChange: false,
        mfaEnabled: false,
        authProvider: 'local',
        tokenVersion: 0,
      });
    }

    await put('users', { email: 'candidate.test@codeskill.local' }, {
      name: 'Assessment Candidate',
      username: 'test-candidate',
      uid: 'TEST001',
      role: 'student',
      isAdmin: false,
      password: await bcrypt.hash('Student@123', 10),
      isActive: true,
      isAssessmentStudent: true,
      forcePasswordChange: false,
      mfaEnabled: false,
      authProvider: 'local',
      tokenVersion: 0,
    });

    await put('users', { email: 'sequential.test.student@codeskill.local' }, {
      name: 'Sequential Test Student',
      username: 'sequential-test-student',
      uid: 'TEST002',
      role: 'student',
      isAdmin: false,
      password: await bcrypt.hash('Student@123', 10),
      isActive: true,
      isAssessmentStudent: true,
      forcePasswordChange: false,
      mfaEnabled: false,
      authProvider: 'local',
      tokenVersion: 0,
    });

    const questionIds = [];

    for (let index = 0; index < mcqs.length; index += 1) {
      const [question, options, correctAnswer, explanation] = mcqs[index];
      const slug = `navigation-test-mcq-${String(index + 1).padStart(2, '0')}`;
      const saved = await put('questions', { slug }, {
        title: `MCQ ${index + 1}: ${question}`,
        question,
        problemStatement: question,
        description: question,
        options,
        correctAnswer,
        correctAnswers: [correctAnswer],
        explanation,
        topic: ['Algorithms', 'Databases', 'Networking', 'Data Structures'][index % 4],
        subtopic: 'Navigation Test',
        difficulty: index < 6 ? 'easy' : 'medium',
        marks: 1,
        negativeMarks: 0,
        language: 'general',
        questionType: 'single_choice',
        status: 'approved',
        tags: ['Navigation Test', 'MCQ'],
        metadata: {},
        examples: [],
        constraints: [],
        supportedLanguages: [],
        starterCode: [],
        testCases: [],
        created_by_id: admin.id,
        approved_by_id: admin.id,
        approvedAt: new Date(),
      });
      questionIds.push(saved.id);
    }

    const mcqCount = mcqs.length;
    for (let index = 0; index < coding.length; index += 1) {
      const spec = coding[index];
      const slug = `navigation-test-coding-${String(index + 1).padStart(2, '0')}`;
      const starterCode = [
        ['python', 'import sys\n\n# Write your solution here\n'],
        ['cpp', '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n'],
        ['java', 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n'],
        ['javascript', 'const fs = require("fs");\n\n// Write your solution here\n'],
      ].map(([language, code]) => ({ language, code }));
      const testCases = spec.cases.map(([input, expectedOutput, isHidden], caseIndex) => ({
        id: String(caseIndex + 1),
        input,
        expectedOutput,
        isHidden,
        weight: 1,
      }));

      const saved = await put('questions', { slug }, {
        title: `Coding ${index + 1}: ${spec.title}`,
        question: spec.question,
        problemStatement: spec.question,
        description: spec.question,
        options: [],
        correctAnswer: -1,
        correctAnswers: [],
        explanation: 'Solve the problem using standard input and print the expected output.',
        topic: 'Coding',
        subtopic: 'Navigation Test',
        difficulty: index < 6 ? 'easy' : 'medium',
        marks: 5,
        negativeMarks: 0,
        language: 'python',
        questionType: 'coding',
        status: 'approved',
        tags: ['Navigation Test', 'Coding'],
        metadata: { supportedLanguages: ['python', 'cpp', 'java', 'javascript'] },
        examples: spec.cases.slice(0, 2).map(([input, expectedOutput]) => ({
          input,
          output: expectedOutput,
          explanation: '',
        })),
        constraints: ['Use standard input and standard output.', 'Follow the exact output format.'],
        supportedLanguages: ['python', 'cpp', 'java', 'javascript'],
        starterCode,
        testCases,
        timeLimit: 2000,
        memoryLimit: 256,
        hideMainMethod: false,
        created_by_id: admin.id,
        approved_by_id: admin.id,
        approvedAt: new Date(),
      });
      questionIds.push(saved.id);
    }

    const now = Date.now();
    const startTime = new Date(now - 24 * 60 * 60 * 1000);
    const endTime = new Date(now + 60 * 24 * 60 * 60 * 1000);
    const common = {
      status: 'published',
      startTime,
      endTime,
      targetBatches: [],
      targetDepartments: [],
      targetCourses: [],
      targetSections: [],
      targetGroups: [],
      targetStudentIds: [],
      targetSemesters: [],
      shuffleQuestions: false,
      shuffleOptions: false,
      showResultImmediately: true,
      allowReview: true,
      allowedAttempts: 10,
      negativeMarking: false,
      proctoring: { enforceFullscreen: false, blockCopyPaste: false, detectTabSwitch: false },
      securityPolicy: { secureExamMode: 'DISABLED', requireFullscreen: false, proctoringMode: 'NONE' },
      created_by_id: admin.id,
      instructions: ['Question order is fixed.', 'MCQs are followed by coding problems.'],
    };

    const sections = [
      {
        id: '0',
        title: 'Multiple Choice Questions',
        description: 'First 10 multiple-choice questions',
        order: 0,
        timeLimit: 0,
        questions: questionIds.slice(0, mcqCount).map((questionId, index) => ({
          questionId,
          marks: 1,
          negativeMarks: 0,
          order: index,
        })),
      },
      {
        id: '1',
        title: 'Coding Problems',
        description: 'Next 10 coding problems',
        order: 1,
        timeLimit: 0,
        questions: questionIds.slice(mcqCount).map((questionId, index) => ({
          questionId,
          marks: 5,
          negativeMarks: 0,
          order: index,
        })),
      },
    ];

    await put('assessments', { code: 'NAV-SEQ-20' }, {
      ...common,
      title: 'Sequential Navigation Test — 20 Questions',
      description: 'Testing fixture: 10 MCQs followed by 10 coding problems with strict sequential navigation.',
      type: 'mixed',
      category: 'exam',
      durationMinutes: 120,
      totalMarks: 60,
      passingMarks: 30,
      questions: questionIds,
      sections,
      lockSectionsSequentially: true,
      allowVirtualMachine: false,
      requireLockdown: false,
    });

    await put('assessments', { code: 'NAV-FREE-20' }, {
      ...common,
      title: 'Free Navigation Test — 20 Questions',
      description: 'Testing fixture: 10 MCQs followed by 10 coding problems with normal forward/backward navigation.',
      type: 'mixed',
      category: 'exam',
      durationMinutes: 120,
      totalMarks: 60,
      passingMarks: 30,
      questions: questionIds,
      sections,
      lockSectionsSequentially: false,
      allowVirtualMachine: false,
      requireLockdown: false,
    });

    await db.query('COMMIT');
    console.log(JSON.stringify({
      mcqs: mcqs.length,
      coding: coding.length,
      assessments: ['NAV-SEQ-20', 'NAV-FREE-20'],
      sequential: 'NAV-SEQ-20',
      nonSequential: 'NAV-FREE-20',
      accounts: [
        'candidate.test@codeskill.local / Student@123',
        'sequential.test.student@codeskill.local / Student@123',
      ],
    }, null, 2));
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
