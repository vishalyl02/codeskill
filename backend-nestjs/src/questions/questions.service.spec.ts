jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => {},
}));

import { BadRequestException } from '@nestjs/common';
import { QuestionsService } from './questions.service';

describe('QuestionsService - True/False Questions Handling', () => {
  let service: QuestionsService;
  let mockQuestionRepo: any;
  let mockQuestionBankRepo: any;
  let mockAuditLogRepo: any;

  const mockAdminUser = { id: 'admin-uuid-1', email: 'admin@codeskill.com' };

  beforeEach(() => {
    mockQuestionRepo = {
      create: jest.fn((dto) => ({ id: 'question-uuid-1', ...dto })),
      save: jest.fn(async (entity) => ({ id: 'question-uuid-1', ...entity })),
      findOne: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      createQueryBuilder: jest.fn(),
      query: jest.fn(),
    };

    mockQuestionBankRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockAuditLogRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn().mockResolvedValue(true),
    };

    service = new QuestionsService(
      mockQuestionRepo,
      mockQuestionBankRepo,
      mockAuditLogRepo,
      { invalidatePrefix: jest.fn().mockResolvedValue(undefined) } as never,
    );
  });

  describe('create - True/False Questions', () => {
    it('should successfully create a True/False question with True as correct answer', async () => {
      const dto: any = {
        question: 'Is JavaScript single-threaded?',
        topic: 'JavaScript',
        difficulty: 'easy',
        questionType: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
        marks: 2,
      };

      const result = await service.create(dto, mockAdminUser);
      expect(result.options).toEqual(['True', 'False']);
      expect(result.correctAnswer).toBe(0);
      expect(result.correctAnswers).toEqual([0]);
    });

    it('should successfully create a True/False question with False as correct answer', async () => {
      const dto: any = {
        question: 'Is HTML a programming language?',
        topic: 'Web',
        difficulty: 'easy',
        questionType: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
        marks: 1,
      };

      const result = await service.create(dto, mockAdminUser);
      expect(result.options).toEqual(['True', 'False']);
      expect(result.correctAnswer).toBe(1);
      expect(result.correctAnswers).toEqual([1]);
    });

    it('should reject True/False question if more than 2 options are provided', async () => {
      const dto: any = {
        question: 'Invalid T/F question',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False', 'Maybe', 'Neither'],
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        'True/False questions must contain exactly two options: True and False',
      );
    });

    it('should reject True/False question if less than 2 options are provided', async () => {
      const dto: any = {
        question: 'Invalid T/F question',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: ['True'],
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject True/False question if options do not contain True and False', async () => {
      const dto: any = {
        question: 'Invalid T/F options',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: ['Yes', 'No'],
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        'True/False questions must contain True and False options',
      );
    });

    it('should reject True/False question if duplicate options are provided', async () => {
      const dto: any = {
        question: 'Duplicate T/F options',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: ['True', 'True'],
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        'True/False questions cannot have duplicate options',
      );
    });

    it('should reject True/False question if multiple correct answers are flagged', async () => {
      const dto: any = {
        question: 'Both marked correct',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: true },
        ],
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        'True/False questions cannot have more than one correct answer',
      );
    });

    it('should reject True/False question if correctAnswer index is out of bounds', async () => {
      const dto: any = {
        question: 'Invalid index',
        topic: 'General',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False'],
        correctAnswer: 2,
      };

      await expect(service.create(dto, mockAdminUser)).rejects.toThrow(
        'correctAnswer for True/False must be 0 (True) or 1 (False)',
      );
    });
  });

  describe('update - True/False Questions', () => {
    it('should update True/False question and toggle correct answer to False', async () => {
      mockQuestionRepo.findOne.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        question: 'Original Question',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False'],
        correctAnswer: 0,
        correctAnswers: [0],
        status: 'approved',
      });

      const updateDto: any = {
        question: 'Updated Question',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
        correctAnswer: 1,
      };

      const result = await service.update(
        '11111111-1111-1111-1111-111111111111',
        updateDto,
        mockAdminUser,
      );

      expect(result.options).toEqual(['True', 'False']);
      expect(result.correctAnswer).toBe(1);
      expect(result.correctAnswers).toEqual([1]);
    });

    it('should reject update if attempting to add 4 options to a True/False question', async () => {
      mockQuestionRepo.findOne.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        question: 'Original Question',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False'],
        correctAnswer: 0,
        status: 'approved',
      });

      const updateDto: any = {
        options: ['True', 'False', 'Option 3', 'Option 4'],
      };

      await expect(
        service.update(
          '11111111-1111-1111-1111-111111111111',
          updateDto,
          mockAdminUser,
        ),
      ).rejects.toThrow(
        'True/False questions must contain exactly two options: True and False',
      );
    });
  });

  describe('findById - Existing Data Normalization', () => {
    it('should normalize legacy True/False question with 4 options to exactly True and False', async () => {
      mockQuestionRepo.findOne.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        question: 'Legacy Question with 4 options',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False', 'Option C', 'Option D'],
        correctAnswer: 1, // False
        status: 'approved',
      });

      const result = await service.findById(
        '11111111-1111-1111-1111-111111111111',
        false,
      );

      expect(result.options).toEqual(['True', 'False']);
      expect(result.options).toHaveLength(2);
      expect(result.correctAnswer).toBe(1);
      expect(result.correctAnswers).toEqual([1]);
    });

    it('should preserve correct answer True (0) when normalizing legacy True/False question', async () => {
      mockQuestionRepo.findOne.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        question: 'Legacy Question',
        questionType: 'TRUE_FALSE',
        options: ['True', 'False', 'True', 'False'],
        correctAnswer: 0, // True
        status: 'approved',
      });

      const result = await service.findById(
        '11111111-1111-1111-1111-111111111111',
        false,
      );

      expect(result.options).toEqual(['True', 'False']);
      expect(result.correctAnswer).toBe(0);
    });
  });

  describe('Preserve Multiple Choice Questions', () => {
    it('should allow multiple choice question with 4 configurable options', async () => {
      const dto: any = {
        question: 'Which of the following are sorting algorithms?',
        topic: 'Algorithms',
        questionType: 'MULTIPLE_CHOICE',
        options: [
          { text: 'Merge Sort', isCorrect: true },
          { text: 'Quick Sort', isCorrect: true },
          { text: 'Binary Search', isCorrect: false },
          { text: 'DFS', isCorrect: false },
        ],
        marks: 4,
      };

      const result = await service.create(dto, mockAdminUser);
      expect(result.options).toEqual([
        'Merge Sort',
        'Quick Sort',
        'Binary Search',
        'DFS',
      ]);
      expect(result.correctAnswers).toEqual([0, 1]);
    });
  });
  describe('Topic categories and independent question types', () => {
    it('stores every topic in metadata, deduplicated, without a type tag', async () => {
      const question = await service.create({ question: 'Coding task', topic: 'Arrays', categories: ['Arrays', ' Trees ', 'Arrays'], questionType: 'DSA', marks: 1 }, mockAdminUser);
      expect(question.questionType).toBe('DSA');
      expect(question.topic).toBe('Arrays');
      expect(question.metadata.categories).toEqual(['Arrays', 'Trees']);
      expect(question).not.toHaveProperty('categories');
    });

    it('updates category metadata while preserving unrelated metadata', async () => {
      mockQuestionRepo.findOne.mockResolvedValue({ id: 'question-uuid-1', question: 'Task', questionType: 'DSA', topic: 'Arrays', options: [], metadata: { categories: ['Arrays'], imported: true } });
      await service.update('question-uuid-1', { categories: ['Trees', 'Graphs'], questionType: 'CODE_OUTPUT' }, mockAdminUser);
      expect(mockQuestionRepo.save).toHaveBeenCalledWith(expect.objectContaining({ questionType: 'CODE_OUTPUT', topic: 'Trees', metadata: { categories: ['Trees', 'Graphs'], imported: true } }));
    });

    it('keeps legacy topic-only creates compatible', async () => {
      const question = await service.create({ question: 'Task', topic: 'Strings', questionType: 'DSA' }, mockAdminUser);
      expect(question.topic).toBe('Strings');
      expect(question.metadata?.categories).toBeUndefined();
    });

    it.each([
      ['MCQ', ['MCQ', 'single_choice']],
      ['MULTIPLE_CHOICE', ['MULTIPLE_CHOICE', 'multiple_choice']],
      ['TRUE_FALSE', ['TRUE_FALSE', 'true_false']],
      ['CODE_OUTPUT', ['CODE_OUTPUT', 'code_output']],
      ['DSA', ['DSA', 'coding', 'algorithmic']],
    ])('filters %s across legacy and unified values', async (type, aliases) => {
      const qb = { leftJoinAndSelect: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), skip: jest.fn().mockReturnThis(), take: jest.fn().mockReturnThis(), getManyAndCount: jest.fn().mockResolvedValue([[], 0]) };
      mockQuestionRepo.createQueryBuilder.mockReturnValue(qb);
      await service.findAll({ questionType: type as string });
      expect(qb.andWhere).toHaveBeenCalledWith('question.questionType IN (:...questionTypes)', { questionTypes: aliases });
    });
  });

  describe('Subject-specific topic options', () => {
    it('returns distinct approved subtopics matching the selected subject', async () => {
      mockQuestionRepo.query.mockResolvedValue([
        { topic: 'Algebra' },
        { topic: 'Geometry' },
      ]);

      await expect(service.getTopicsDistribution('Mathematics')).resolves.toEqual([
        'Algebra',
        'Geometry',
      ]);
      expect(mockQuestionRepo.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'approved'"),
        ['Mathematics'],
      );
      expect(mockQuestionRepo.query.mock.calls[0][0]).toContain(
        "(topic = $1 OR (metadata->'categories') ? $1)",
      );
    });
  });

});
