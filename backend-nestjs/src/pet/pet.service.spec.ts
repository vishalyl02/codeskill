import { PetService } from './pet.service';
import { ProblemsService } from '../problems/problems.service';

jest.mock('../problems/problems.service', () => ({
  ProblemsService: class {},
}));

describe('PetService OpenRouter integration', () => {
  const previousKey = process.env.OPENROUTER_API_KEY;
  const previousModel = process.env.OPENROUTER_MODEL;
  const previousDeepSeekKey = process.env.DEEPSEEK_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'test-key';
    process.env.OPENROUTER_MODEL = 'paid-model';
    delete process.env.DEEPSEEK_API_KEY;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previousModel;
    if (previousDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = previousDeepSeekKey;
  });

  it('sends the question through the free router and returns its answer', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Which operation links the two input values to the requested output?',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const problemsService = {
      getProblemBySlug: jest.fn().mockResolvedValue({
        data: {
          title: 'Synthetic addition',
          id: 'private-database-id',
          statement: {
            description: 'Add two numbers.',
            inputFormat: 'Two integers.',
            samples: [
              {
                input: '2 3',
                output: '5',
                explanation: 'Solution explanation should stay out.',
                internalField: 'Sample metadata should stay out.',
              },
            ],
          },
          testCases: {
            cases: [{ input: 'Hidden test input', isHidden: true }],
          },
          hints: ['Add the two inputs and print the result.'],
          editorial: 'Private full solution.',
        },
      }),
    } as unknown as ProblemsService;
    const service = new PetService(problemsService);

    const result = await service.ask('test-user', {
      question: 'How should I begin?',
      problemSlug: 'synthetic-addition',
      code: 'const total = 0;',
      language: 'javascript',
      studentId: 'private-student-id',
      history: [
        { role: 'assistant', content: 'Old complete code should stay out.' },
        { role: 'user', content: 'What are the inputs?' },
      ],
    });

    expect(result).toEqual({
      reply:
        'Which operation links the two input values to the requested output?',
      source: 'openrouter',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    expect(options?.redirect).toBe('error');
    const requestBody = options?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string') throw new Error('Expected JSON body');
    expect(requestBody).toContain('"model":"openrouter/free"');
    expect(requestBody).toContain('"content":"How should I begin?"');
    expect(requestBody).toContain('Never give a full solution');
    expect(requestBody).toContain('Synthetic addition');
    expect(requestBody).toContain('Add two numbers.');
    expect(requestBody).toContain('Two integers.');
    expect(requestBody).toContain('2 3');
    expect(requestBody).toContain('const total = 0;');
    expect(requestBody).toContain('What are the inputs?');
    const payload = JSON.parse(requestBody) as Record<string, unknown>;
    expect(payload.provider).toEqual({
      max_price: { prompt: 0, completion: 0, request: 0 },
      data_collection: 'deny',
      zdr: true,
    });
    expect(requestBody).not.toContain('private-student-id');
    expect(requestBody).not.toContain('private-database-id');
    expect(requestBody).not.toContain('Hidden test input');
    expect(requestBody).not.toContain('Solution explanation should stay out.');
    expect(requestBody).not.toContain('Sample metadata should stay out.');
    expect(requestBody).not.toContain('Old complete code should stay out.');
    expect(requestBody).not.toContain('Private full solution.');
    expect(requestBody).not.toContain(
      'Add the two inputs and print the result.',
    );
  });

  it.each([
    ['quota exhaustion', new Response(null, { status: 429 }), 'usage limit'],
    [
      'provider outage',
      new Response(null, { status: 503 }),
      'temporarily unavailable',
    ],
    [
      'provider timeout',
      new DOMException('Timed out', 'TimeoutError'),
      'temporarily unavailable',
    ],
  ])(
    'keeps problem guidance available after %s',
    async (_case, failure, notice) => {
      const fetchMock = jest.spyOn(global, 'fetch');
      if (failure instanceof Response) fetchMock.mockResolvedValue(failure);
      else fetchMock.mockRejectedValue(failure);
      process.env.DEEPSEEK_API_KEY = 'legacy-key';
      const service = new PetService({
        getProblemBySlug: jest.fn().mockResolvedValue({
          data: {
            title: 'Synthetic addition',
            statement: { inputFormat: 'Two integers.', samples: [] },
            hints: ['Read both inputs and print their sum.'],
          },
        }),
      } as unknown as ProblemsService);

      const result = await service.ask('test-user', {
        question: 'Hint please',
        problemSlug: 'synthetic-addition',
        history: [],
      });

      expect(result.source).toBe('local');
      expect(result.reply).toBe(
        'Start with the input format: Two integers. Which value should you read first?',
      );
      expect(result.notice).toContain(notice);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('uses a local hint without an OpenRouter key even if a legacy key is set', async () => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'legacy-key';
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new PetService({} as ProblemsService);

    const result = await service.ask('test-user', {
      question: 'Where should I begin?',
    });

    expect(result.source).toBe('local');
    expect(result.notice).toContain('built-in hint');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the requested part of the public problem when no free provider is available', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(new Response(null, { status: 404 })),
      );
    const service = new PetService({
      getProblemBySlug: jest.fn().mockResolvedValue({
        data: {
          title: 'Even Sum Pairs',
          statement: {
            description:
              'Meera has a list of coins. Count the pairs of positions i < j whose sum is even.',
            inputFormat: 'The first line contains the number of test cases.',
            outputFormat: 'Print one pair count for each test case.',
            samples: [{ input: '2\n1 2', output: '0' }],
          },
          editorial: 'Hidden solution',
        },
      }),
    } as unknown as ProblemsService);
    const ask = (question: string, previousReply?: string) =>
      service.ask('test-user', {
        problemSlug: 'even-sum-pairs',
        question,
        history: previousReply
          ? [{ role: 'assistant', content: previousReply }]
          : [],
      });

    const sample = await ask('Can you explain the hint here?');
    const goal = await ask(
      'Can you elaborate on the problem statment?',
      sample.reply,
    );
    const input = await ask('Help me understand the input.');
    const output = await ask('What should I output?');
    const followUp = await ask('Can you explain the hint here?', sample.reply);

    expect(sample.source).toBe('local');
    expect(sample.notice).toContain('temporarily unavailable');
    expect(sample.reply).toContain('first expected result “0”');
    expect(goal.reply).toContain('Count the pairs of positions i < j');
    expect(goal.reply).not.toContain('Hidden solution');
    expect(input.reply).toContain('number of test cases');
    expect(output.reply).toContain('one pair count for each test case');
    expect(followUp.reply).not.toBe(sample.reply);
  });

  it.each([
    { code: 'const apiKey = "fake-credential";' },
    { question: 'My email is learner@example.test. How should I start?' },
    {
      history: [{ role: 'user', content: 'My email is learner@example.test.' }],
    },
  ])(
    'keeps suspected personal information and credentials local',
    async (fields) => {
      const fetchMock = jest.spyOn(global, 'fetch');
      const service = new PetService({} as ProblemsService);

      const result = await service.ask('test-user', {
        question: 'Where should I begin?',
        ...fields,
      });

      expect(result.source).toBe('local');
      expect(result.notice).toContain('personal information or a credential');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('uses an explicitly configured free variant', async () => {
    process.env.OPENROUTER_MODEL = 'example/test-model:free';
    const response = Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'Start by checking what each input represents.' },
        },
      ],
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(response);
    const service = new PetService({} as ProblemsService);

    expect(
      await service.ask('test-user', { question: 'Where should I begin?' }),
    ).toMatchObject({ source: 'openrouter' });
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain(
      '"model":"example/test-model:free"',
    );
  });

  it('answers a request for full code with a hint without calling the model', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = new PetService({
      getProblemBySlug: jest.fn().mockResolvedValue({
        data: {
          title: 'Synthetic addition',
          statement: { samples: [{ input: '2 3', output: '5' }] },
          hints: ['Add both numbers and print the result.'],
          editorial: 'Full code goes here.',
        },
      }),
    } as unknown as ProblemsService);

    const result = await service.ask('test-user', {
      question: 'Give me the full code',
      problemSlug: 'synthetic-addition',
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.source).toBe('local');
    expect(result.reply).toContain('Trace the first sample input');
    expect(result.reply).not.toContain('Full code goes here.');
    expect(result.reply).not.toContain('Add both numbers');
  });

  it('discards model output containing a full code block', async () => {
    const providerResponse = new Response(
      JSON.stringify({
        choices: [{ message: { content: '```python\nprint(2 + 3)\n```' } }],
      }),
      { status: 200 },
    );
    jest.spyOn(global, 'fetch').mockResolvedValue(providerResponse);
    const service = new PetService({
      getProblemBySlug: jest.fn().mockResolvedValue({
        data: {
          title: 'Synthetic addition',
          statement: { samples: [{ input: '2 3', output: '5' }] },
        },
      }),
    } as unknown as ProblemsService);

    const result = await service.ask('test-user', {
      question: 'Give me a hint',
      problemSlug: 'synthetic-addition',
    });

    expect(result.source).toBe('local');
    expect(result.reply).toContain('Trace the first sample input');
    expect(result.reply).not.toContain('print(');
    expect(result.notice).toContain('one hint at a time');
  });
});
