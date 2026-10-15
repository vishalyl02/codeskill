import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, In } from 'typeorm';
import { Question as QuestionEntity } from '../database/entities/question.entity';
import { QuestionBank as QuestionBankEntity } from '../database/entities/question-bank.entity';
import { AuditLog as AuditLogEntity } from '../database/entities/audit-log.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { CreateQuestionBankDto } from './dto/create-question-bank.dto';
import { CacheService } from '../redis/cache.service';
import * as XLSX from 'xlsx';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(QuestionEntity)
    private readonly questionRepository: Repository<QuestionEntity>,
    @InjectRepository(QuestionBankEntity)
    private readonly questionBankRepository: Repository<QuestionBankEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository: Repository<AuditLogEntity>,
    private readonly cacheService: CacheService,
  ) {}

  private normalizeCategories(categories: string[]): string[] {
    return [
      ...new Set(categories.map((category) => category.trim()).filter(Boolean)),
    ];
  }

  async findAll(query: QueryQuestionsDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const qb = this.questionRepository.createQueryBuilder('question')
      .leftJoinAndSelect('question.createdBy', 'createdBy')
      .leftJoinAndSelect('question.approvedBy', 'approvedBy');

    if (query.status && query.status !== 'all') {
      qb.andWhere('question.status = :status', { status: query.status });
    } else {
      qb.andWhere('question.status != :archived', { archived: 'archived' });
    }

    if (query.topic && query.topic.trim()) {
      qb.andWhere(
        "(question.topic = :topic OR (question.metadata->'categories') ? :topic)",
        { topic: query.topic.trim() },
      );
    }

    const questionType = query.questionType;
    if (questionType && questionType !== 'all') {
      const groups = [
        ['MCQ', 'single_choice'],
        ['MULTIPLE_CHOICE', 'multiple_choice'],
        ['TRUE_FALSE', 'true_false'],
        ['CODE_OUTPUT', 'code_output'],
        ['DSA', 'coding', 'algorithmic'],
      ];
      const types = groups.find((group) => group.includes(questionType)) || [
        questionType,
      ];
      qb.andWhere('question.questionType IN (:...questionTypes)', {
        questionTypes: types,
      });
    }

    if (query.subtopic && query.subtopic.trim()) {
      qb.andWhere('question.subtopic = :subtopic', { subtopic: query.subtopic.trim() });
    }

    if (query.difficulty && query.difficulty !== 'all') {
      qb.andWhere('question.difficulty = :difficulty', { difficulty: query.difficulty });
    }

    if (query.aiGenerated !== undefined && query.aiGenerated !== '') {
      qb.andWhere('question.aiGenerated = :aiGenerated', { aiGenerated: query.aiGenerated === 'true' });
    }

    if (query.search && query.search.trim()) {
      const search = `%${query.search.trim()}%`;
      qb.andWhere(new Brackets(qbInner => {
        qbInner.where('question.question ILIKE :search', { search })
               .orWhere('question.topic ILIKE :search', { search })
               .orWhere('question.subtopic ILIKE :search', { search })
               .orWhere(`EXISTS (SELECT 1 FROM unnest(question.tags) AS t WHERE t ILIKE :search)`);
      }));
    }

    const [questions, total] = await qb
      .orderBy('question.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    questions.forEach((q) => {
      if (q.questionType === 'TRUE_FALSE') {
        let isFalse = q.correctAnswer === 1;
        if (Array.isArray(q.options) && q.correctAnswer !== undefined) {
          const chosen = String(q.options[q.correctAnswer] || '').trim().toLowerCase();
          if (chosen === 'false') {
            isFalse = true;
          } else if (chosen === 'true') {
            isFalse = false;
          }
        }
        q.options = ['True', 'False'];
        q.correctAnswer = isFalse ? 1 : 0;
        q.correctAnswers = [q.correctAnswer];
      }
    });

    const pendingCount = await this.questionRepository.count({ where: { status: 'pending' } });
    const approvedCount = await this.questionRepository.count({ where: { status: 'approved' } });

    return {
      questions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      stats: {
        total,
        pending: pendingCount,
        approved: approvedCount,
      },
    };
  }

  async findById(id: string, isStudent = false) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      throw new BadRequestException('Invalid question ID');
    }

    const question = await this.questionRepository.findOne({ where: { id } });
    if (!question || question.status === 'archived') {
      throw new NotFoundException('Question not found');
    }

    if (question.questionType === 'TRUE_FALSE') {
      let isFalse = question.correctAnswer === 1;
      if (Array.isArray(question.options) && question.correctAnswer !== undefined) {
        const chosen = String(question.options[question.correctAnswer] || '').trim().toLowerCase();
        if (chosen === 'false') {
          isFalse = true;
        } else if (chosen === 'true') {
          isFalse = false;
        }
      }
      question.options = ['True', 'False'];
      question.correctAnswer = isFalse ? 1 : 0;
      question.correctAnswers = [question.correctAnswer];
    }

    // Question Leakage Prevention: NEVER send answers or hidden data to students
    if (isStudent) {
      const {
        correctAnswer,
        correctAnswers,
        explanation,
        expectedOutput,
        referenceSolutions,
        metadata,
        ...studentSafeQuestion
      } = question as any;

      if (studentSafeQuestion.testCases) {
        studentSafeQuestion.testCases = studentSafeQuestion.testCases.filter(
          (tc: any) => !tc.isHidden,
        );
      }

      return studentSafeQuestion;
    }

    return question;
  }

  async create(
    dto: CreateQuestionDto,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const {
      options: rawOptions,
      categories,
      visibility,
      contestOnly,
      ...rest
    } = dto;
    const type = String(dto.questionType || 'single_choice');
    const isChoice = [
      'single_choice',
      'multiple_choice',
      'MCQ',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
    ].includes(type);

    let options: string[] = [];
    let correctAnswers: number[] = dto.correctAnswers || [];
    let correctAnswer = dto.correctAnswer ?? 0;

    if (type === 'TRUE_FALSE') {
      const source =
        Array.isArray(rawOptions) && rawOptions.length > 0
          ? rawOptions
          : ['True', 'False'];

      if (source.length !== 2) {
        throw new BadRequestException(
          'True/False questions must contain exactly two options: True and False',
        );
      }

      const optTexts = source.map((o: any) =>
        (typeof o === 'string' ? o : o?.text || '').trim(),
      );
      const lowerTexts = optTexts.map((t) => t.toLowerCase());

      if (lowerTexts[0] === lowerTexts[1]) {
        throw new BadRequestException(
          'True/False questions cannot have duplicate options',
        );
      }

      if (
        !lowerTexts.includes('true') ||
        !lowerTexts.includes('false')
      ) {
        throw new BadRequestException(
          'True/False questions must contain True and False options',
        );
      }

      options = ['True', 'False'];

      let selectedAnswer: number | null = null;
      const flagged = source
        .map((o: any, i: number) => {
          if (typeof o === 'object' && o?.isCorrect) {
            return lowerTexts[i] === 'false' ? 1 : 0;
          }
          return -1;
        })
        .filter((i: number) => i >= 0);

      if (flagged.length > 1) {
        throw new BadRequestException(
          'True/False questions cannot have more than one correct answer',
        );
      } else if (flagged.length === 1) {
        selectedAnswer = flagged[0];
      }

      if (dto.correctAnswer !== undefined) {
        if (dto.correctAnswer !== 0 && dto.correctAnswer !== 1) {
          throw new BadRequestException(
            'correctAnswer for True/False must be 0 (True) or 1 (False)',
          );
        }
        selectedAnswer = dto.correctAnswer;
      }

      if (dto.correctAnswers !== undefined && dto.correctAnswers.length > 0) {
        if (dto.correctAnswers.length > 1) {
          throw new BadRequestException(
            'True/False questions cannot have more than one correct answer',
          );
        }
        if (dto.correctAnswers[0] !== 0 && dto.correctAnswers[0] !== 1) {
          throw new BadRequestException(
            'correctAnswers for True/False must contain 0 (True) or 1 (False)',
          );
        }
        selectedAnswer = dto.correctAnswers[0];
      }

      if (selectedAnswer === null) {
        selectedAnswer = 0;
      }

      correctAnswer = selectedAnswer;
      correctAnswers = [selectedAnswer];
    } else if (isChoice) {
      const source = Array.isArray(rawOptions) ? rawOptions : [];
      options = source.map((o: any) => (typeof o === 'string' ? o : o?.text || ''));
      const flagged = source
        .map((o: any, i: number) => (typeof o === 'object' && o?.isCorrect ? i : -1))
        .filter((i: number) => i >= 0);
      if (flagged.length > 0) {
        correctAnswers = flagged;
        correctAnswer = flagged[0];
      }
      if (options.length < 2 || options.some((o) => !o.trim())) {
        throw new BadRequestException(
          'Choice questions need at least 2 non-empty options',
        );
      }
      if (correctAnswer < 0 || correctAnswer >= options.length) {
        throw new BadRequestException(
          `correctAnswer must be a valid zero-based index between 0 and ${options.length - 1}`,
        );
      }
    }

    if (!(dto.question || dto.title)) {
      throw new BadRequestException('Question text is required');
    }
    if (dto.marks !== undefined && dto.marks <= 0) {
      throw new BadRequestException('Marks must be greater than 0');
    }

    const status = dto.status ?? 'approved';
    const metadata = {
      ...(categories !== undefined
        ? { categories: this.normalizeCategories(categories) }
        : {}),
      ...(visibility !== undefined ? { visibility } : {}),
      ...(contestOnly !== undefined ? { contestOnly } : {}),
    };
    const isApproved = ['approved', 'active', 'published'].includes(status);
    const newQuestion = this.questionRepository.create({
      ...rest,
      ...(categories !== undefined
        ? {
            topic: this.normalizeCategories(categories)[0] || 'General',
          }
        : {}),
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      question: dto.question || dto.title,
      options,
      correctAnswer,
      correctAnswers,
      created_by_id: adminUser.id || adminUser._id,
      status,
      ...(isApproved
        ? {
            approved_by_id: adminUser.id || adminUser._id,
            approvedAt: new Date(),
          }
        : {}),
    } as any) as unknown as QuestionEntity;

    const question = await this.questionRepository.save(newQuestion);
    await this.cacheService.invalidatePrefix('problems:');

    const auditLog = this.auditLogRepository.create({
      actorId: adminUser.id || adminUser._id,
      actorEmail: adminUser.email,
      action: 'CREATE_QUESTION',
      target: question.id,
      targetType: 'Question',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        topic: question.topic,
        difficulty: question.difficulty,
      },
    });
    await this.auditLogRepository.save(auditLog);

    return question;
  }

  async update(
    id: string,
    dto: UpdateQuestionDto,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const question = await this.questionRepository.findOne({ where: { id } });
    if (!question || question.status === 'archived') {
      throw new NotFoundException('Question not found');
    }

    const type = String(dto.questionType || question.questionType || 'single_choice');
    const isChoice = [
      'single_choice',
      'multiple_choice',
      'MCQ',
      'MULTIPLE_CHOICE',
      'TRUE_FALSE',
    ].includes(type);

    if (type === 'TRUE_FALSE') {
      const rawOptions = dto.options !== undefined ? dto.options : question.options;
      const source =
        Array.isArray(rawOptions) && rawOptions.length > 0
          ? rawOptions
          : ['True', 'False'];

      if (source.length !== 2) {
        throw new BadRequestException(
          'True/False questions must contain exactly two options: True and False',
        );
      }

      const optTexts = source.map((o: any) =>
        (typeof o === 'string' ? o : o?.text || '').trim(),
      );
      const lowerTexts = optTexts.map((t) => t.toLowerCase());

      if (lowerTexts[0] === lowerTexts[1]) {
        throw new BadRequestException(
          'True/False questions cannot have duplicate options',
        );
      }

      if (
        !lowerTexts.includes('true') ||
        !lowerTexts.includes('false')
      ) {
        throw new BadRequestException(
          'True/False questions must contain True and False options',
        );
      }

      dto.options = ['True', 'False'];

      let selectedAnswer: number | null = null;
      if (dto.options !== undefined && Array.isArray(rawOptions)) {
        const flagged = rawOptions
          .map((o: any, i: number) => {
            if (typeof o === 'object' && o?.isCorrect) {
              return lowerTexts[i] === 'false' ? 1 : 0;
            }
            return -1;
          })
          .filter((i: number) => i >= 0);

        if (flagged.length > 1) {
          throw new BadRequestException(
            'True/False questions cannot have more than one correct answer',
          );
        } else if (flagged.length === 1) {
          selectedAnswer = flagged[0];
        }
      }

      if (dto.correctAnswer !== undefined) {
        if (dto.correctAnswer !== 0 && dto.correctAnswer !== 1) {
          throw new BadRequestException(
            'correctAnswer for True/False must be 0 (True) or 1 (False)',
          );
        }
        selectedAnswer = dto.correctAnswer;
      }

      if (dto.correctAnswers !== undefined && dto.correctAnswers.length > 0) {
        if (dto.correctAnswers.length > 1) {
          throw new BadRequestException(
            'True/False questions cannot have more than one correct answer',
          );
        }
        if (dto.correctAnswers[0] !== 0 && dto.correctAnswers[0] !== 1) {
          throw new BadRequestException(
            'correctAnswers for True/False must contain 0 (True) or 1 (False)',
          );
        }
        selectedAnswer = dto.correctAnswers[0];
      }

      if (selectedAnswer !== null) {
        dto.correctAnswer = selectedAnswer;
        dto.correctAnswers = [selectedAnswer];
      } else {
        const existingAns = question.correctAnswer === 1 ? 1 : 0;
        dto.correctAnswer = existingAns;
        dto.correctAnswers = [existingAns];
      }
    } else if (isChoice) {
      if (dto.options !== undefined) {
        const rawOptions = dto.options;
        const source = Array.isArray(rawOptions) ? rawOptions : [];
        const options = source.map((o: any) =>
          typeof o === 'string' ? o : o?.text || '',
        );
        const flagged = source
          .map((o: any, i: number) => (typeof o === 'object' && o?.isCorrect ? i : -1))
          .filter((i: number) => i >= 0);

        if (flagged.length > 0 && dto.correctAnswer === undefined) {
          dto.correctAnswers = flagged;
          dto.correctAnswer = flagged[0];
        }

        if (options.length < 2 || options.some((o) => !o.trim())) {
          throw new BadRequestException(
            'Choice questions need at least 2 non-empty options',
          );
        }

        const effectiveCorrectAnswer =
          dto.correctAnswer !== undefined ? dto.correctAnswer : question.correctAnswer;
        if (
          effectiveCorrectAnswer !== undefined &&
          (effectiveCorrectAnswer < 0 || effectiveCorrectAnswer >= options.length)
        ) {
          throw new BadRequestException(
            `correctAnswer must be a valid zero-based index between 0 and ${options.length - 1}`,
          );
        }
        dto.options = options;
      } else if (dto.correctAnswer !== undefined) {
        const currentOptions = question.options || [];
        if (
          currentOptions.length > 0 &&
          (dto.correctAnswer < 0 || dto.correctAnswer >= currentOptions.length)
        ) {
          throw new BadRequestException(
            `correctAnswer must be a valid index between 0 and ${currentOptions.length - 1}`,
          );
        }
      }
    }

    if (dto.title && !dto.question) {
      dto.question = dto.title;
    }

    const { categories, visibility, contestOnly, ...updates } = dto;
    const existingCategories: unknown = question.metadata?.categories;
    if (categories !== undefined) {
      const topics = this.normalizeCategories(categories);
      question.metadata = { ...question.metadata, categories: topics };
      updates.topic = topics[0] || 'General';
    } else if (
      updates.topic !== undefined &&
      Array.isArray(existingCategories)
    ) {
      question.metadata = {
        ...question.metadata,
        categories: this.normalizeCategories([
          updates.topic,
          ...existingCategories
            .slice(1)
            .filter(
              (category: unknown): category is string =>
                typeof category === 'string',
            ),
        ]),
      };
    }
    if (visibility !== undefined) {
      question.metadata = { ...question.metadata, visibility };
    }
    if (contestOnly !== undefined) {
      question.metadata = { ...question.metadata, contestOnly };
    }
    Object.assign(question, updates);
    await this.questionRepository.save(question);
    await this.cacheService.invalidatePrefix('problems:');

    const auditLog = this.auditLogRepository.create({
      actorId: adminUser.id || adminUser._id,
      actorEmail: adminUser.email,
      action: 'UPDATE_QUESTION',
      target: question.id,
      targetType: 'Question',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: { updates: dto },
    });
    await this.auditLogRepository.save(auditLog);

    return question;
  }

  async delete(id: string, adminUser: any, ip = '', userAgent = '') {
    const question = await this.questionRepository.findOne({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');

    question.status = 'archived';
    await this.questionRepository.save(question);
    await this.cacheService.invalidatePrefix('problems:');

    const auditLog = this.auditLogRepository.create({
      actorId: adminUser.id || adminUser._id,
      actorEmail: adminUser.email,
      action: 'DELETE_QUESTION',
      target: question.id,
      targetType: 'Question',
      ipAddress: ip,
      userAgent: userAgent,
    });
    await this.auditLogRepository.save(auditLog);

    return { success: true, message: 'Question successfully archived' };
  }

  async review(
    id: string,
    status: 'approved' | 'rejected',
    reason = '',
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const question = await this.questionRepository.findOne({ where: { id } });
    if (!question) throw new NotFoundException('Question not found');

    question.status = status;
    if (status === 'approved') {
      question.approved_by_id = adminUser.id || adminUser._id;
      question.approvedAt = new Date();
      question.rejectedReason = undefined;
    } else {
      question.rejectedReason =
        reason || 'Declined during administrative review';
    }

    await this.questionRepository.save(question);
    await this.cacheService.invalidatePrefix('problems:');

    const auditLog = this.auditLogRepository.create({
      actorId: adminUser.id || adminUser._id,
      actorEmail: adminUser.email,
      action: status === 'approved' ? 'APPROVE_QUESTION' : 'REJECT_QUESTION',
      target: question.id,
      targetType: 'Question',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: { reason },
    });
    await this.auditLogRepository.save(auditLog);

    return question;
  }

  async getTopicsDistribution(subject?: string) {
    if (subject?.trim()) {
      const rows = await this.questionRepository.query(
        `SELECT DISTINCT subtopic AS topic
         FROM questions
         WHERE status = 'approved'
           AND subtopic IS NOT NULL
           AND BTRIM(subtopic) <> ''
           AND (topic = $1 OR (metadata->'categories') ? $1)
         ORDER BY subtopic`,
        [subject.trim()],
      );
      return rows.map((row: { topic: string }) => row.topic);
    }

    const query = await this.questionRepository.query(`
      SELECT 
        category as topic,
        COUNT(*) as total,
        SUM(CASE WHEN difficulty = 'easy' THEN 1 ELSE 0 END) as easy,
        SUM(CASE WHEN difficulty = 'medium' THEN 1 ELSE 0 END) as medium,
        SUM(CASE WHEN difficulty = 'hard' THEN 1 ELSE 0 END) as hard,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM questions
      CROSS JOIN LATERAL (
        SELECT DISTINCT value AS category
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(metadata->'categories') = 'array' AND metadata->'categories' <> '[]'::jsonb
            THEN metadata->'categories'
            ELSE jsonb_build_array(COALESCE(topic, 'Unassigned'))
          END
        )
      ) AS categories
      WHERE status != 'archived'
      GROUP BY category
      ORDER BY total DESC
    `);

    return query.map((t: any) => ({
      topic: t.topic,
      total: Number(t.total) || 0,
      easy: Number(t.easy) || 0,
      medium: Number(t.medium) || 0,
      hard: Number(t.hard) || 0,
      approved: Number(t.approved) || 0,
      pending: Number(t.pending) || 0,
    }));
  }

  // --- Question Bank Collection Methods ---

  async findAllBanks(topic?: string) {
    const qb = this.questionBankRepository.createQueryBuilder('bank')
      .leftJoinAndSelect('bank.createdBy', 'createdBy');
    
    if (topic) {
      qb.where('bank.topic = :topic', { topic });
    }

    const banks = await qb.orderBy('bank.createdAt', 'DESC').getMany();

    // Map questions for frontend if we were populated before
    for (const bank of banks) {
      if (bank.questions && bank.questions.length > 0) {
        const qEntities = await this.questionRepository.find({
          where: { id: In(bank.questions) },
          select: { id: true, question: true, topic: true, difficulty: true, marks: true, options: true }
        });
        (bank as any).questions = qEntities;
      }
    }

    return banks;
  }

  async findBankById(id: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) throw new BadRequestException('Invalid ID');

    const bank = await this.questionBankRepository.findOne({
      where: { id },
      relations: { createdBy: true }
    });

    if (!bank) throw new NotFoundException('Question Bank not found');

    if (bank.questions && bank.questions.length > 0) {
      const qEntities = await this.questionRepository.find({
        where: { id: In(bank.questions) },
      });
      (bank as any).questions = qEntities;
    }

    return bank;
  }

  async createBank(dto: CreateQuestionBankDto, adminUser: any) {
    const bank = this.questionBankRepository.create({
      ...dto,
      questions: dto.questions || [],
      createdBy_id: adminUser.id || adminUser._id,
    });
    return this.questionBankRepository.save(bank);
  }

  async updateBank(id: string, dto: Partial<CreateQuestionBankDto>) {
    const bank = await this.questionBankRepository.findOne({ where: { id } });
    if (!bank) throw new NotFoundException('Question Bank not found');

    if (dto.questions) bank.questions = dto.questions;
    if (dto.name) bank.name = dto.name;
    if (dto.description !== undefined) bank.description = dto.description;
    if (dto.topic) bank.topic = dto.topic;
    if (dto.isPublic !== undefined) bank.isPublic = dto.isPublic;
    if (dto.tags) bank.tags = dto.tags;

    return this.questionBankRepository.save(bank);
  }

  async deleteBank(id: string) {
    const res = await this.questionBankRepository.delete(id);
    if (res.affected === 0) throw new NotFoundException('Question Bank not found');
    return { success: true, message: 'Question Bank removed' };
  }

  // --- Bulk Question Import (XLSX / CSV) ---

  async parseAndValidateQuestionsImport(fileBuffer: Buffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new BadRequestException(
        'The uploaded spreadsheet contains no sheets.',
      );
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      throw new BadRequestException(
        'The uploaded spreadsheet contains no data rows.',
      );
    }

    const normalizeHeader = (str: string) =>
      str.toLowerCase().replace(/[\s\-_.]/g, '');

    const findField = (row: any, aliases: string[]) => {
      const keys = Object.keys(row);
      const normalizedAliases = aliases.map(normalizeHeader);
      for (const key of keys) {
        if (normalizedAliases.includes(normalizeHeader(key))) {
          const val = row[key];
          return typeof val === 'string' ? val.trim() : String(val).trim();
        }
      }
      return '';
    };

    const parsedRows: any[] = [];
    const fileQuestionSet = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const question = findField(row, [
        'question',
        'question_text',
        'question_statement',
        'problem_statement',
        'problem',
        'title',
      ]);
      const rawQuestionType =
        findField(row, ['question_type', 'type', 'qtype']) || 'single_choice';
      const topic =
        findField(row, ['topic', 'subject', 'category']) || 'General';
      const subtopic = findField(row, ['subtopic', 'sub_topic', 'chapter']);
      const difficulty = (
        findField(row, ['difficulty', 'level']) || 'medium'
      ).toLowerCase();

      const rawMarks = findField(row, ['marks', 'mark', 'score', 'points']);
      const marks = rawMarks ? Number(rawMarks) : 1;

      const rawNeg = findField(row, [
        'negative_marks',
        'negative_mark',
        'negative',
        'penalty',
      ]);
      const negativeMarks = rawNeg ? Number(rawNeg) : 0;

      const optA = findField(row, [
        'option_a',
        'optiona',
        'option_1',
        'opt_a',
        'a',
      ]);
      const optB = findField(row, [
        'option_b',
        'optionb',
        'option_2',
        'opt_b',
        'b',
      ]);
      const optC = findField(row, [
        'option_c',
        'optionc',
        'option_3',
        'opt_c',
        'c',
      ]);
      const optD = findField(row, [
        'option_d',
        'optiond',
        'option_4',
        'opt_d',
        'd',
      ]);
      const optE = findField(row, [
        'option_e',
        'optione',
        'option_5',
        'opt_e',
        'e',
      ]);

      const correctAnswerRaw = findField(row, [
        'correct_answer',
        'correct',
        'answer',
        'key',
        'ans',
      ]);
      const explanation = findField(row, [
        'explanation',
        'solution',
        'rationale',
      ]);
      const codeSnippet = findField(row, [
        'code_snippet',
        'code',
        'snippet',
        'starter_code',
        'startercode',
      ]);
      const language = findField(row, ['language', 'lang']) || 'general';
      const rawTags = findField(row, ['tags', 'tag']);
      const tags = rawTags
        ? rawTags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

      // Algorithmic / Coding specific columns
      const constraints = findField(row, [
        'constraints',
        'constraint',
        'limits',
      ]);
      const timeLimitRaw = findField(row, [
        'time_limit',
        'timelimit',
        'time_limit_ms',
      ]);
      const timeLimit =
        timeLimitRaw && !isNaN(Number(timeLimitRaw))
          ? Number(timeLimitRaw)
          : 2000;
      const memoryLimitRaw = findField(row, [
        'memory_limit',
        'memorylimit',
        'memory_limit_mb',
      ]);
      const memoryLimit =
        memoryLimitRaw && !isNaN(Number(memoryLimitRaw))
          ? Number(memoryLimitRaw)
          : 256;

      // Extract test cases
      const testCases: Array<{
        input: string;
        output: string;
        isHidden?: boolean;
        explanation?: string;
      }> = [];
      for (let tcIdx = 1; tcIdx <= 10; tcIdx++) {
        const inp = findField(row, [
          `test_input_${tcIdx}`,
          `testinput${tcIdx}`,
          `input_${tcIdx}`,
          `in_${tcIdx}`,
        ]);
        const out = findField(row, [
          `test_output_${tcIdx}`,
          `testoutput${tcIdx}`,
          `output_${tcIdx}`,
          `out_${tcIdx}`,
        ]);
        if (inp || out) {
          testCases.push({
            input: inp,
            output: out,
            isHidden: tcIdx > 2,
          });
        }
      }
      let testCaseJsonError = false;
      const rawTestCasesJson = findField(row, [
        'test_cases',
        'testcases',
        'testcase',
        'tests',
      ]);
      if (rawTestCasesJson) {
        try {
          const parsedTc = JSON.parse(rawTestCasesJson);
          if (Array.isArray(parsedTc)) {
            testCases.push(...parsedTc);
          } else {
            testCaseJsonError = true;
          }
        } catch (e) {
          testCaseJsonError = true;
        }
      }

      const typeKey = rawQuestionType.toLowerCase().replace(/[\s-]/g, '_');
      const TYPE_MAP: Record<string, string> = {
        single_choice: 'single_choice',
        mcq: 'single_choice',
        single: 'single_choice',
        multiple_choice: 'multiple_choice',
        multiple: 'multiple_choice',
        msq: 'multiple_choice',
        true_false: 'true_false',
        truefalse: 'true_false',
        tf: 'true_false',
        coding: 'coding',
        algorithmic: 'coding',
        algorithm: 'coding',
        code: 'coding',
        dsa: 'coding',
      };
      const mappedType = TYPE_MAP[typeKey];
      const isCoding = mappedType === 'coding' || testCases.length > 0;
      const unknownType = !isCoding && !mappedType;

      // True/False is stored as a two-option single choice question
      const isTrueFalse = !isCoding && mappedType === 'true_false';
      const questionType = isCoding
        ? 'coding'
        : isTrueFalse
          ? 'single_choice'
          : mappedType || typeKey;

      parsedRows.push({
        rowNumber: i + 2,
        question,
        questionType,
        unknownType,
        rawQuestionType,
        testCaseJsonError,
        rawMarks,
        rawNeg,
        topic,
        subtopic,
        difficulty: ['easy', 'medium', 'hard'].includes(difficulty)
          ? difficulty
          : 'medium',
        marks,
        negativeMarks,
        optA: isTrueFalse ? 'True' : optA,
        optB: isTrueFalse ? 'False' : optB,
        optC: isTrueFalse ? '' : optC,
        optD: isTrueFalse ? '' : optD,
        optE: isTrueFalse ? '' : optE,
        correctAnswerRaw,
        explanation,
        codeSnippet,
        language,
        tags,
        constraints,
        timeLimit,
        memoryLimit,
        testCases,
        isCoding,
      });
    }

    const allFileQuestions = parsedRows.map((r) => r.question).filter(Boolean);
    const existingDbQuestions = await this.questionRepository.find({
      where: {
        question: In(allFileQuestions),
      },
      select: { question: true, topic: true },
    });

    const dbQuestionMap = new Set(
      existingDbQuestions.map(
        (q) => `${q.topic.toLowerCase()}:::${q.question.toLowerCase().trim()}`,
      ),
    );

    const errors: { row: number; question?: string; error: string }[] = [];
    const validRows: any[] = [];
    let duplicatesInFile = 0;
    let willUpdateCount = 0;
    let willInsertCount = 0;
    let invalid = 0;

    for (const row of parsedRows) {
      const rowErrors: string[] = [];

      if (!row.question) {
        rowErrors.push('Question statement is missing');
      } else {
        const questionKey = `${row.topic.toLowerCase()}:::${row.question.toLowerCase().trim()}`;
        if (fileQuestionSet.has(questionKey)) {
          rowErrors.push(
            'Duplicate question statement within the uploaded file',
          );
          duplicatesInFile++;
        } else {
          fileQuestionSet.add(questionKey);
          if (dbQuestionMap.has(questionKey)) {
            row.isUpdate = true;
            willUpdateCount++;
          } else {
            row.isUpdate = false;
            willInsertCount++;
          }
        }
      }

      if (!row.topic) {
        rowErrors.push('Topic is required');
      }

      if (row.unknownType) {
        rowErrors.push(
          `Unsupported question type '${row.rawQuestionType}' (use single_choice, multiple_choice, true_false or coding)`,
        );
      }

      if (row.rawMarks && (isNaN(row.marks) || row.marks <= 0)) {
        rowErrors.push('Marks must be a positive number');
      }
      if (row.rawNeg && (isNaN(row.negativeMarks) || row.negativeMarks < 0)) {
        rowErrors.push('Negative marks must be zero or a positive number');
      }

      if (row.isCoding) {
        if (row.testCaseJsonError) {
          rowErrors.push('test_cases column is not a valid JSON array');
        }
        const usable = (row.testCases || []).filter(
          (t: any) => t && String(t.output ?? t.expectedOutput ?? '').trim(),
        );
        if (usable.length === 0) {
          rowErrors.push(
            'Coding questions require at least one test case with expected output',
          );
        }
      }

      const isChoice = ['single_choice', 'multiple_choice'].includes(
        row.questionType,
      );
      let formattedOptions: Array<{
        text: string;
        isCorrect: boolean;
        explanation?: string;
      }> = [];

      if (isChoice) {
        // Enforce min 2 options
        const rawOptions = [
          { key: 'A', text: row.optA },
          { key: 'B', text: row.optB },
          { key: 'C', text: row.optC },
          { key: 'D', text: row.optD },
          ...(row.optE ? [{ key: 'E', text: row.optE }] : []),
        ].filter((o) => o.text && o.text.trim());

        if (rawOptions.length < 2) {
          rowErrors.push(
            'Multiple choice questions require at least 2 populated options',
          );
        }

        if (!row.correctAnswerRaw) {
          rowErrors.push('Correct answer is missing');
        } else {
          const rawAnswerParts = row.correctAnswerRaw
            .toUpperCase()
            .split(/[,/|]/)
            .map((s: string) => s.trim());

          formattedOptions = rawOptions.map((opt, idx) => {
            const matchesKey = rawAnswerParts.includes(opt.key);
            const matchesNumeric = rawAnswerParts.includes(String(idx + 1));
            const matchesText = rawAnswerParts.some(
              (ans: string) => ans.toLowerCase() === opt.text.toLowerCase(),
            );
            return {
              text: opt.text,
              isCorrect: matchesKey || matchesNumeric || matchesText,
            };
          });

          const correctCount = formattedOptions.filter(
            (o) => o.isCorrect,
          ).length;
          if (correctCount === 0) {
            rowErrors.push(
              `Correct answer '${row.correctAnswerRaw}' did not match any of options (A, B, C, D)`,
            );
          } else if (row.questionType === 'single_choice' && correctCount > 1) {
            rowErrors.push(
              'Single choice question cannot have multiple correct answers',
            );
          }
        }
      }

      if (rowErrors.length > 0) {
        invalid++;
        errors.push({
          row: row.rowNumber,
          question: row.question || `Row ${row.rowNumber}`,
          error: rowErrors.join('. '),
        });
      } else {
        validRows.push({
          rowNumber: row.rowNumber,
          question: row.question,
          questionType: row.questionType,
          topic: row.topic,
          subtopic: row.subtopic || undefined,
          difficulty: row.difficulty,
          marks: row.marks,
          negativeMarks: row.negativeMarks,
          options: isChoice ? formattedOptions : undefined,
          explanation: row.explanation || undefined,
          codeSnippet: row.codeSnippet || undefined,
          language: row.language !== 'general' ? row.language : undefined,
          tags: row.tags,
          constraints: row.constraints,
          timeLimit: row.timeLimit,
          memoryLimit: row.memoryLimit,
          testCases: row.testCases,
          isUpdate: row.isUpdate,
          status: 'approved',
        });
      }
    }

    return {
      summary: {
        totalRows: parsedRows.length,
        validCount: validRows.length,
        invalidCount: invalid,
        duplicateCount: duplicatesInFile,
        toInsertCount: willInsertCount,
        toUpdateCount: willUpdateCount,
      },
      validRows,
      errors,
    };
  }

  async confirmQuestionsImport(
    validRows: any[],
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    if (!validRows || validRows.length === 0) {
      throw new BadRequestException('No valid question rows to import.');
    }

    const docs = validRows.map((r) => {
      let optionsList: string[] = [];
      let correctAnswerIndex = 0;
      if (Array.isArray(r.options)) {
        optionsList = r.options.map((o: any) =>
          typeof o === 'string' ? o : o.text || '',
        );
        const correctIdx = r.options.findIndex(
          (o: any) => typeof o === 'object' && o.isCorrect,
        );
        correctAnswerIndex = correctIdx >= 0 ? correctIdx : 0;
      }

      const isCodingRow = r.questionType === 'coding';
      const correctIndices = Array.isArray(r.options)
        ? r.options
            .map((o: any, idx: number) =>
              typeof o === 'object' && o.isCorrect ? idx : -1,
            )
            .filter((idx: number) => idx >= 0)
        : [];
      const normalizedTestCases = (r.testCases || [])
        .map((t: any, idx: number) => ({
          id: String(t.id ?? idx + 1),
          input: String(t.input ?? ''),
          expectedOutput: String(t.expectedOutput ?? t.output ?? ''),
          isHidden: t.isHidden ?? idx >= 2,
          weight: Number(t.weight) > 0 ? Number(t.weight) : 1,
        }))
        .filter((t: any) => t.expectedOutput.trim());
      const constraintList = Array.isArray(r.constraints)
        ? r.constraints
        : String(r.constraints || '')
            .split('\n')
            .map((c: string) => c.trim())
            .filter(Boolean);

      return {
        question: r.question,
        questionType: r.questionType || 'single_choice',
        topic: r.topic,
        subtopic: r.subtopic || '',
        difficulty: r.difficulty || 'medium',
        marks: r.marks || 1,
        negativeMarks: r.negativeMarks || 0,
        options: optionsList,
        correctAnswer: correctAnswerIndex,
        correctAnswers: correctIndices,
        explanation: r.explanation || '',
        codeSnippet: r.codeSnippet || '',
        language: r.language || 'general',
        tags: r.tags || [],
        status: 'approved',
        createdBy_id: adminUser?.id || adminUser?._id,
        approvedBy_id: adminUser?.id || adminUser?._id,
        approvedAt: new Date(),
        ...(isCodingRow
          ? {
              problemStatement: r.question,
              constraints: constraintList,
              timeLimit: r.timeLimit || 2000,
              memoryLimit: r.memoryLimit || 256,
              testCases: normalizedTestCases,
            }
          : {}),
        metadata: {
          importedVia: 'bulk_csv',
          originalRow: r.rowNumber,
        },
      };
    });

    let totalUpserted = 0;
    let totalModified = 0;

    for (const doc of docs) {
      const existing = await this.questionRepository.findOne({
        where: { question: doc.question, topic: doc.topic }
      });
      if (existing) {
        Object.assign(existing, doc);
        await this.questionRepository.save(existing);
        totalModified++;
      } else {
        const newDoc = this.questionRepository.create(doc as any);
        await this.questionRepository.save(newDoc);
        totalUpserted++;
      }
    }

    await this.cacheService.invalidatePrefix('problems:');
    const totalProcessed = docs.length;

    const auditLog = this.auditLogRepository.create({
      actorId: adminUser?.id || adminUser?._id,
      actorEmail: adminUser?.email || 'admin',
      action: 'BULK_IMPORT_QUESTIONS_UPSERT',
      target: 'Question',
      targetType: 'Question',
      ipAddress: ip,
      userAgent: userAgent,
      metadata: {
        totalProcessed,
        newlyInserted: totalUpserted,
        updated: totalModified,
        sampleTopics: [...new Set(docs.map((d) => d.topic))].slice(0, 5),
      },
    });
    await this.auditLogRepository.save(auditLog);

    return {
      success: true,
      message: `Successfully processed ${totalProcessed} questions (${totalUpserted} newly inserted, ${totalModified} updated).`,
      count: totalProcessed,
      insertedCount: totalUpserted,
      updatedCount: totalModified,
    };
  }

  async autoImportQuestions(
    fileBuffer: Buffer,
    adminUser: any,
    ip = '',
    userAgent = '',
  ) {
    const preview = await this.parseAndValidateQuestionsImport(fileBuffer);
    if (!preview.validRows || preview.validRows.length === 0) {
      throw new BadRequestException(
        preview.errors?.[0]?.error || 'No valid question rows found in file.',
      );
    }
    const commit = await this.confirmQuestionsImport(
      preview.validRows,
      adminUser,
      ip,
      userAgent,
    );
    return {
      success: true,
      message: commit.message,
      summary: {
        ...preview.summary,
        insertedCount: commit.insertedCount,
        updatedCount: commit.updatedCount,
      },
      validCount: preview.validRows.length,
      invalidCount: preview.summary.invalidCount,
      errors: preview.errors,
    };
  }
}
