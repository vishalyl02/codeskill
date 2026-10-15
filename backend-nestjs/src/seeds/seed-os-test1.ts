import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../app.module';
import { Assessment } from '../database/entities/assessment.entity';
import { Question } from '../database/entities/question.entity';
import { User } from '../database/entities/user.entity';

type SeedQuestion = { stem: string; options: string[]; answer: number; explanation: string; difficulty: 'easy' | 'medium' | 'hard' };

const questions: SeedQuestion[] = [
  { stem: 'Which part of the OS directly manages hardware, memory and processes?', options: ['Shell', 'Kernel', 'Compiler', 'Bootloader'], answer: 1, explanation: 'The kernel is the core of an operating system and manages hardware resources, memory, and process execution.', difficulty: 'easy' },
  { stem: 'Which of these is NOT a standard process state?', options: ['Ready', 'Running', 'Waiting', 'Compiling'], answer: 3, explanation: 'Ready, running, and waiting are standard process states. Compiling is an activity performed by a compiler, not a process state.', difficulty: 'easy' },
  { stem: 'Which scheduling algorithm runs processes strictly in the order they arrive?', options: ['SJF', 'Round Robin', 'FCFS', 'Priority'], answer: 2, explanation: 'First-Come, First-Served schedules processes in their arrival order.', difficulty: 'easy' },
  { stem: 'What is a deadlock?', options: ['A process that runs too long', 'A set of processes each waiting for a resource held by another in the set', 'A crash of the kernel', 'A process that has no memory'], answer: 1, explanation: 'In a deadlock, a group of processes wait indefinitely for resources held by other processes in that same group.', difficulty: 'easy' },
  { stem: 'Which of these is the fastest to access?', options: ['Hard disk', 'RAM', 'CPU cache', 'SSD'], answer: 2, explanation: 'CPU cache is closest to the processor and has lower access latency than RAM or persistent storage.', difficulty: 'easy' },
  { stem: 'What is a context switch?', options: ['Switching from user to admin account', 'Saving the state of one process and loading the state of another', 'Changing the file system', 'Restarting the OS'], answer: 1, explanation: 'A context switch saves a running process state and restores another process state so the CPU can switch execution.', difficulty: 'easy' },
  { stem: 'Virtual memory uses which area of the disk to hold pages that do not fit in RAM?', options: ['Swap space', 'Boot sector', 'Cache', 'Registry'], answer: 0, explanation: 'The operating system can move inactive pages to swap space on disk, freeing physical memory for active pages.', difficulty: 'easy' },
  { stem: 'Which of these is NOT one of the four necessary conditions for deadlock?', options: ['Mutual exclusion', 'Hold and wait', 'Starvation', 'Circular wait'], answer: 2, explanation: 'The four Coffman conditions are mutual exclusion, hold and wait, no preemption, and circular wait. Starvation is not one of them.', difficulty: 'medium' },
  { stem: 'A system has a 32-bit logical address and 4 KB pages. How many pages are in the logical address space?', options: ['2^12', '2^20', '2^22', '2^32'], answer: 1, explanation: 'A 4 KB page uses 12 offset bits. The page number therefore has 32 − 12 = 20 bits, giving 2^20 pages.', difficulty: 'medium' },
  { stem: 'In Round Robin, what happens if the time quantum is made very large?', options: ['It behaves like FCFS', 'It behaves like SJF', 'Context switches increase', 'It becomes preemptive priority'], answer: 0, explanation: 'With a quantum larger than the CPU bursts, each process runs until completion in arrival order, like FCFS.', difficulty: 'medium' },
  { stem: 'A counting semaphore starts at 3. Five wait (P) operations and then two signal (V) operations are performed. What is its final value (blocking implementation, where a signal wakes a blocked process instead of increasing the value)?', options: ['-2', '1', '3', '0'], answer: 3, explanation: 'Three waits consume the initial permits; the next two callers block. Each of the two signals wakes a blocked caller, leaving the semaphore count at zero.', difficulty: 'medium' },
  { stem: "Belady's anomaly can occur in which page replacement algorithm?", options: ['LRU', 'Optimal', 'FIFO', 'All of them'], answer: 2, explanation: "FIFO can incur more page faults when the number of frames increases; this behavior is known as Belady's anomaly.", difficulty: 'medium' },
  { stem: 'With FIFO page replacement and 3 frames, how many page faults occur for the reference string 1 2 3 4 1 2 5 1 2 3 4 5?', options: ['7', '8', '9', '10'], answer: 2, explanation: 'Simulating FIFO across the reference string produces nine faults.', difficulty: 'hard' },
  { stem: 'Using SRTF (preemptive SJF), processes are P1 (arrival 0, burst 8), P2 (1, 4), P3 (2, 9), and P4 (3, 5). What is the average waiting time?', options: ['5.5', '6.5', '7.75', '8.25'], answer: 1, explanation: 'The completion times are P2=5, P4=10, P1=17, and P3=26. Waiting times are 0, 2, 9, and 15 respectively, averaging 6.5.', difficulty: 'hard' },
  { stem: 'There is one resource type with 12 units total. Allocations are P0=5, P1=2, P2=2; maximum demands are P0=10, P1=4, P2=9. Which is a safe sequence using Banker’s algorithm?', options: ['P0, P1, P2', 'P2, P1, P0', 'P1, P0, P2', 'No safe sequence exists'], answer: 2, explanation: 'Three units are available. P1 needs two and can finish, releasing its allocation; P0 can then finish, leaving enough for P2.', difficulty: 'hard' },
  { stem: 'Memory access time is 100 ns, page-fault service time is 8 ms, and the page-fault rate is 0.001. What is the effective access time?', options: ['About 100 ns', 'About 8.1 microseconds', 'About 80 microseconds', 'About 8 ms'], answer: 1, explanation: 'EAT ≈ (1−0.001)×100 ns + 0.001×(8 ms + 100 ns) ≈ 8,100 ns, or 8.1 microseconds.', difficulty: 'hard' },
  { stem: 'In the bounded-buffer producer-consumer solution with semaphores (mutex, empty, full), which producer ordering can cause deadlock?', options: ['wait(empty); wait(mutex); ... signal(mutex); signal(full)', 'wait(mutex); wait(empty); ... signal(full); signal(mutex)', 'wait(empty); wait(mutex); ... signal(full); signal(mutex)', 'None of these'], answer: 1, explanation: 'If the buffer is full, a producer holding mutex while waiting on empty prevents the consumer from acquiring mutex to remove an item and signal empty.', difficulty: 'hard' },
  { stem: 'A 32-bit logical address uses two-level paging, a 4 KB page size, and 4-byte page-table entries. How many bits are used for the outer page index?', options: ['8', '10', '12', '20'], answer: 1, explanation: 'The page offset uses 12 bits, leaving a 20-bit virtual page number. A page table page holds 4 KB / 4 B = 1024 = 2^10 entries, so the inner index uses 10 bits and the outer index uses the remaining 10 bits.', difficulty: 'hard' },
  { stem: 'The disk head is at cylinder 50. The request queue is 82, 170, 43, 140, 24, 16, 190. What is the total head movement using SSTF?', options: ['208', '236', '332', '642'], answer: 0, explanation: 'SSTF services 43, 24, 16, 82, 140, 170, 190. The movement is 7+19+8+66+58+30+20 = 208 cylinders.', difficulty: 'hard' },
  { stem: 'A Unix-style inode has 10 direct pointers, 1 single-indirect pointer, and 1 double-indirect pointer. Block size is 1 KB and pointer size is 4 bytes. What is the maximum file size?', options: ['266 KB', '65,536 KB', '65,802 KB', '16,777,216 KB'], answer: 2, explanation: 'Each indirect block holds 1024/4 = 256 pointers. The inode addresses 10 + 256 + 256² = 65,802 data blocks, for 65,802 KB.', difficulty: 'hard' },
];

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const questionRepo = app.get<Repository<Question>>(getRepositoryToken(Question));
    const assessmentRepo = app.get<Repository<Assessment>>(getRepositoryToken(Assessment));
    const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
    const creator = await userRepo.findOne({ where: { isAdmin: true } });
    const savedQuestions: Question[] = [];

    for (const [index, item] of questions.entries()) {
      const slug = `mcq-os-test-1-q${String(index + 1).padStart(2, '0')}`;
      let entity = await questionRepo.findOne({ where: { slug } });
      entity = questionRepo.create({
        ...(entity || {}),
        slug,
        title: `OS Test 1 — Question ${index + 1}`,
        question: item.stem,
        options: item.options,
        correctAnswer: item.answer,
        correctAnswers: [item.answer],
        explanation: item.explanation,
        topic: 'Operating Systems',
        subtopic: ['Processes', 'Scheduling', 'Deadlocks', 'Memory Management', 'Synchronization'][index % 5],
        difficulty: item.difficulty,
        marks: 1,
        negativeMarks: 0,
        language: 'general',
        questionType: 'single_choice',
        status: 'approved',
        tags: ['MCQ', 'OS', 'Test 1'],
        metadata: { seedKey: 'os-test-1', questionNumber: index + 1 },
        created_by_id: creator?.id,
        approved_by_id: creator?.id,
        approvedAt: new Date(),
      });
      savedQuestions.push(await questionRepo.save(entity));
    }

    const code = 'MCQ-OS-TEST-01';
    let assessment = await assessmentRepo.findOne({ where: { code } });
    const ids = savedQuestions.map(q => q.id);
    const testQuestions = ids.map((questionId, order) => ({ questionId, marks: 1, negativeMarks: 0, order }));
    assessment = assessmentRepo.create({
      ...(assessment || {}),
      title: 'OS Fundamentals Test 1',
      code,
      description: 'Twenty operating-systems multiple-choice questions covering fundamentals, scheduling, deadlocks, memory management, synchronization, and virtual memory.',
      type: 'mcq',
      category: 'mcq_os',
      durationMinutes: 30,
      totalMarks: 20,
      passingMarks: 8,
      negativeMarking: false,
      questions: ids,
      sections: [{ title: 'Operating Systems', description: '20 questions · Easy, Medium, and Hard', order: 0, timeLimit: 0, questions: testQuestions }],
      targetBatches: [], targetDepartments: [], targetCourses: [], targetSections: [],
      shuffleQuestions: false,
      shuffleOptions: false,
      showResultImmediately: true,
      allowReview: true,
      allowedAttempts: 0,
      proctoring: { enforceFullscreen: false, blockCopyPaste: false, detectTabSwitch: false },
      securityPolicy: {},
      status: 'published',
      created_by_id: creator?.id,
      instructions: ['Choose one answer for each question.', 'Your result and explanations are available after submission.', 'You may retake this practice test.'],
    });
    const savedAssessment = await assessmentRepo.save(assessment);
    console.log(JSON.stringify({ assessmentId: savedAssessment.id, code, questionCount: savedQuestions.length, difficultyCounts: { easy: 7, medium: 5, hard: 8 } }));
  } finally {
    await app.close();
  }
}

seed().catch(error => { console.error(error?.message || error); process.exitCode = 1; });
