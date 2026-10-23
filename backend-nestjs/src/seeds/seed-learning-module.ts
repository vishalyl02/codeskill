import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdminLearningService } from '../learning/services/admin-learning.service';
import { LearningAutoSeedService } from '../learning/services/learning-auto-seed.service';

async function bootstrap() {
  console.log('🚀 Seeding CodeSkill Rich Learning Platform Curriculum & Dummy Data...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const adminService = app.get(AdminLearningService);

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
      description: 'Completed the Foundations of Large Language Models course.',
      iconUrl: '/images/badges/ai-pioneer.svg',
      rarity: 'rare' as const,
      category: 'skills' as const,
      criteria: { type: 'course_completed', slug: 'ai-foundations-llm' },
    },
    {
      code: 'PROMPT_WIZARD',
      name: 'Prompt Wizard',
      description: 'Mastered Advanced Prompt Engineering, Few-Shot, and Chain-of-Thought reasoning.',
      iconUrl: '/images/badges/prompt-wizard.svg',
      rarity: 'epic' as const,
      category: 'mastery' as const,
      criteria: { type: 'course_completed', slug: 'advanced-prompt-engineering' },
    },
    {
      code: 'GENAI_ARCHITECT',
      name: 'GenAI Architect',
      description: 'Mastered Transformer mechanics, RoPE embeddings, KV-cache, and test-time reasoning models.',
      iconUrl: '/images/badges/genai-architect.svg',
      rarity: 'epic' as const,
      category: 'skills' as const,
      criteria: { type: 'course_completed', slug: 'genai-transformers-reasoning-models' },
    },
    {
      code: 'RAG_SPECIALIST',
      name: 'RAG Specialist',
      description: 'Engineered production RAG pipelines with Hybrid Search (BM25 + Dense) and Ragas evaluation.',
      iconUrl: '/images/badges/rag-specialist.svg',
      rarity: 'epic' as const,
      category: 'skills' as const,
      criteria: { type: 'course_completed', slug: 'enterprise-rag-vector-databases' },
    },
    {
      code: 'AGENTIC_ENGINEER',
      name: 'Agentic Systems Engineer',
      description: 'Mastered autonomous multi-agent orchestration, tool calling, and state graphs with LangGraph.',
      iconUrl: '/images/badges/agentic-engineer.svg',
      rarity: 'legendary' as const,
      category: 'mastery' as const,
      criteria: { type: 'course_completed', slug: 'agentic-ai-langchain-langgraph' },
    },
    {
      code: 'PYTHON_MASTER',
      name: 'Python Master',
      description: 'Mastered Python from fundamentals through OOP, decorators, and memory-efficient generators.',
      iconUrl: '/images/badges/python-master.svg',
      rarity: 'epic' as const,
      category: 'skills' as const,
      criteria: { type: 'path_completed', slug: 'python-complete-mastery' },
    },
    {
      code: 'JS_NINJA',
      name: 'JavaScript Ninja',
      description: 'Conquered JavaScript closures, the V8 event loop, and asynchronous concurrency.',
      iconUrl: '/images/badges/js-ninja.svg',
      rarity: 'epic' as const,
      category: 'skills' as const,
      criteria: { type: 'path_completed', slug: 'javascript-mastery' },
    },
    {
      code: 'PATH_CHAMPION',
      name: 'Path Champion',
      description: 'Completed an entire learning path curriculum and received a verified credential.',
      iconUrl: '/images/badges/path-champion.svg',
      rarity: 'epic' as const,
      category: 'mastery' as const,
      criteria: { type: 'path_completed' },
    },
    {
      code: 'ALGORITHM_MASTER',
      name: 'Algorithm Master',
      description: 'Mastered algorithmic foundations across searching, sorting, and dynamic programming.',
      iconUrl: '/images/badges/algo-master.svg',
      rarity: 'legendary' as const,
      category: 'skills' as const,
      criteria: { type: 'path_completed', slug: 'dsa-mastery' },
    },
  ];

  for (const b of badges) {
    try {
      await adminService.createBadge(b);
      console.log(`✓ Badge seeded: ${b.name}`);
    } catch {
      // Ignored if exists
    }
  }

  // ==========================================
  // 2. CERTIFICATE TEMPLATE
  // ==========================================
  try {
    await adminService.createCertificateTemplate({
      name: 'CodeSkill Verified Professional Credential',
      title: 'Certificate of Verified Technical Mastery',
      issuerName: 'Technical Training & Development Board',
      issuerTitle: 'Head of Technical Training & Development',
      issuerOrganization: 'CodeSkill · Chandigarh University',
      isDefault: true,
    });
    console.log('✓ Certificate template seeded.');
  } catch {
    // Ignored if exists
  }

  // ==========================================
  // 3. AI & PROMPT ENGINEERING PATH
  // ==========================================
  console.log('\n--- Seeding AI & Prompt Engineering Path ---');
  let aiCourse1, aiCourse2, aiCourse3, aiCourse4, aiCourse5;
  try {
    aiCourse1 = await adminService.createCourse({
      title: 'Foundations of Large Language Models & Generative AI',
      slug: 'ai-foundations-llm',
      description: 'Understand how LLMs work under the hood: BPE tokenization, context windows, attention mechanisms, and sampling parameters.',
      difficulty: 'beginner',
      estimatedMinutes: 60,
      status: 'published',
    });

    const aiMod1 = await adminService.createModule(aiCourse1.id, {
      title: 'Module 1: How LLMs Process Text',
      description: 'Tokens, Context Windows, and Temperature / Top-P sampling parameters.',
      order: 1,
    });

    // Lesson 1: Tokens and Parameters
    const aiL1 = await adminService.createLesson(aiMod1.id, {
      title: 'Tokens, Context Windows & Sampling Controls',
      slug: 'tokens-context-windows-sampling',
      order: 1,
      type: 'reading',
      content: `### How Large Language Models Process Information

Large Language Models (LLMs) such as GPT-4, Claude, and Gemini do not read raw strings or words directly. Instead, they operate on mathematical units called **Tokens**.

#### 1. What is a Token?
- In the English language, **1 token is roughly 4 characters or 0.75 words**.
- Common words (e.g., \`the\`, \`apple\`, \`function\`) are typically 1 single token.
- Rare words, code syntax, spaces, and punctuation may be split into multiple sub-word tokens using algorithms such as Byte-Pair Encoding (BPE).
- Example: The word \`unbelievable\` may be tokenized into \`["un", "believ", "able"]\`.

#### 2. The Context Window
The **Context Window** is the maximum total number of tokens (both input prompt + output generation) that a model can process in a single forward pass:
- If your conversation exceeds the context window, earlier tokens are truncated or dropped.
- Modern models offer windows from 8k up to 1M+ tokens, but larger contexts can suffer from the *"Lost in the Middle"* phenomenon where information in the middle of long prompts receives lower attention weight.

#### 3. Generation Hyperparameters

When interacting with an LLM API, you control creativity vs determinism using sampling parameters:

| Parameter | Range | Purpose | Recommended Setting |
| :--- | :--- | :--- | :--- |
| **Temperature** | 0.0 - 2.0 | Controls randomness in next-token selection. Lower values make output deterministic; higher values make it diverse. | **0.0 - 0.2** for Code & Math; **0.7 - 0.9** for Creative Writing |
| **Top-P (Nucleus Sampling)** | 0.0 - 1.0 | Dynamically selects tokens from the top cumulative probability mass. | **0.9 - 0.95** (alternative to temperature) |
| **Frequency Penalty** | -2.0 - 2.0 | Discourages the model from repeating the exact same words or phrases. | **0.0 - 0.5** to avoid repetitive loops |

> **Pro Tip**: To get reproducible, reliable JSON or code from an LLM, always set **\`temperature: 0.0\`** and specify an exact output schema.
`,
      learningObjectives: [
        'Understand the relationship between characters, words, and tokens',
        'Analyze context window limits and truncation risks',
        'Configure temperature and top_p for deterministic code and analysis tasks',
      ],
    });

    await adminService.createExercise(aiL1.id, {
      title: 'Knowledge Check: LLM Tokens & Hyperparameters',
      type: 'quiz',
      marks: 15,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'ai-q1',
            question: 'If you need an LLM to generate strictly valid JSON schema data for an API integration, which temperature setting is recommended?',
            options: [
              'temperature: 1.5 (maximizes creative formatting)',
              'temperature: 0.0 (maximizes determinism and adherence to schema)',
              'temperature: 2.0 (ensures all tokens have equal probability)',
              'temperature: -1.0 (reverses token probabilities)',
            ],
            correctAnswer: 1,
            explanation: 'A temperature of 0.0 selects the argmax (highest probability) token at every step, producing deterministic and consistent structured output.',
          },
          {
            id: 'ai-q2',
            question: 'Roughly how many English words does a 1,000-token prompt contain?',
            options: [
              'Approximately 250 words',
              'Approximately 750 words',
              'Approximately 2,000 words',
              'Exactly 1,000 words',
            ],
            correctAnswer: 1,
            explanation: 'On average, 1 token is approximately 0.75 words in English. Therefore, 1,000 tokens ≈ 750 words.',
          },
          {
            id: 'ai-q3',
            question: 'What happens when an LLM conversation exceeds its context window?',
            options: [
              'The model crashes and deletes user data',
              'The model charges double the API rate',
              'Older tokens are truncated, causing the model to forget earlier conversation context',
              'The model automatically increases its parameter size',
            ],
            correctAnswer: 2,
            explanation: 'Context windows are fixed-size attention buffers. Exceeding tokens necessitates truncation or sliding window summaries, losing earlier context.',
          },
          {
            id: 'ai-q3b',
            question: 'What does the Top-P (nucleus sampling) parameter control in LLM token generation?',
            options: [
              'The learning rate during fine-tuning',
              'The cumulative probability threshold that limits candidate tokens considered for sampling',
              'The length of the output in characters',
              'The number of GPU threads assigned to the request',
            ],
            correctAnswer: 1,
            explanation: 'Top-P dynamically cuts off the long tail of low-probability tokens by considering only the smallest set of tokens whose cumulative probability exceeds P (e.g. 0.9).',
          },
          {
            id: 'ai-q3c',
            question: 'What is a "System Prompt" (or System Role) designed to do in modern Chat Completion APIs?',
            options: [
              'Reboot the client operating system',
              'Set persistent persona, behavioral constraints, output schemas, and guardrails across the session',
              'Speed up Wi-Fi latency',
              'Store database credentials on disk',
            ],
            correctAnswer: 1,
            explanation: 'The system message defines the model persona, tone, guardrails, and instructions that govern how subsequent user messages are interpreted.',
          },
          {
            id: 'ai-q3d',
            question: 'Why does "Hallucination" occur in autoregressive Large Language Models?',
            options: [
              'Because the model intentionally lies to save compute',
              'Because the model generates statistically plausible continuation tokens without an inherent grounding in factual truth or internal world models',
              'Because the GPU overheats',
              'Because user input is encoded in UTF-8',
            ],
            correctAnswer: 1,
            explanation: 'Autoregressive LLMs predict the most statistically probable next token given context, which can produce fluent and convincing falsehoods when facts are lacking in context.',
          },
          {
            id: 'ai-q3e',
            question: 'Which sampling technique guarantees identical token output across multiple repeated calls with the same input prompt?',
            options: [
              'Greedy decoding (temperature = 0)',
              'High Top-K sampling with temperature 1.8',
              'Monte Carlo beam search with stochastic dropout',
              'Frequency penalty = 2.0',
            ],
            correctAnswer: 0,
            explanation: 'Greedy decoding (temperature 0) deterministically chooses the single token with the highest logit at every decoding step.',
          },
        ],
      },
    });

    // Lesson 2: In-Context Learning (Zero-Shot & Few-Shot)
    const aiL2 = await adminService.createLesson(aiMod1.id, {
      title: 'In-Context Learning: Zero-Shot vs Few-Shot Prompting',
      slug: 'zero-shot-vs-few-shot-prompting',
      order: 2,
      type: 'reading',
      content: `### Mastering In-Context Learning

**In-Context Learning (ICL)** is the ability of LLMs to understand tasks and adopt specific formats simply by seeing examples in the prompt, **without any fine-tuning or model weight updates**.

#### 1. Zero-Shot Prompting
In Zero-Shot prompting, you provide only the task instruction without any prior demonstration examples:

\`\`\`markdown
Classify the sentiment of the following customer review as POSITIVE, NEGATIVE, or NEUTRAL.

Review: "The package arrived 2 days earlier than scheduled and in pristine condition!"
Sentiment:
\`\`\`

- **When to use**: Straightforward tasks, standard summaries, translation, and common classification.

#### 2. Few-Shot Prompting
In Few-Shot prompting, you provide 2 to 5 exemplar pairs \`(Input, Output)\` that demonstrate the target reasoning pattern and output format:

\`\`\`markdown
Classify customer inquiries and extract the intent and urgency level in JSON format.

Inquiry: "My server crashed and production is down for all customers!"
Output: {"intent": "system_outage", "urgency": "critical", "route_to": "tier_3_devops"}

Inquiry: "Can you tell me if your pricing plan includes automated PDF invoices?"
Output: {"intent": "billing_inquiry", "urgency": "low", "route_to": "sales"}

Inquiry: "I cannot log in with my university email since this morning."
Output:
\`\`\`

#### Benefits of Few-Shot Demonstrations:
1. **Guaranteed Output Consistency**: The model mirrors the exact JSON structure of the examples.
2. **Domain Adaptation**: Teaches custom categorization or university-specific abbreviations instantly.
3. **Reduces Edge-Case Failures**: Providing an example of an ambiguous input guides the model on how to handle corner cases.
`,
      learningObjectives: [
        'Differentiate between zero-shot and few-shot prompt architectures',
        'Construct effective demonstration pairs to enforce strict schema outputs',
        'Select the appropriate prompting technique based on task complexity',
      ],
    });

    await adminService.createExercise(aiL2.id, {
      title: 'Prompt Engineering Exercise: Sentiment & Entity Extractor',
      type: 'quiz',
      marks: 15,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'ai-q4',
            question: 'Why is Few-Shot prompting superior to Zero-Shot when requesting custom structured JSON output?',
            options: [
              'Because Few-Shot permanently modifies the neural network weights on the server',
              'Because demonstration examples provide visual and structural templates that the attention mechanism mirrors directly',
              'Because Few-Shot uses fewer tokens than Zero-Shot',
              'Because Zero-Shot models cannot output JSON under any circumstances',
            ],
            correctAnswer: 1,
            explanation: 'The attention mechanism conditions next-token probabilities on the provided examples, faithfully reproducing the demonstrated schema.',
          },
          {
            id: 'ai-q5',
            question: 'What is "In-Context Learning" (ICL) in foundation language models?',
            options: [
              'Updating optimizer gradients using Backpropagation during inference',
              'The emergent ability of LLMs to solve tasks demonstrated purely in prompt context without altering any model parameters',
              'Translating prompt text into C++ code',
              'Connecting the model directly to physical hardware sensors',
            ],
            correctAnswer: 1,
            explanation: 'In-Context Learning occurs dynamically in the forward pass when the model adapts its generation based on examples provided in the context window.',
          },
          {
            id: 'ai-q6',
            question: 'How should Few-Shot examples be formatted for optimal parsing and attention tracking?',
            options: [
              'As a single run-on sentence with no punctuation',
              'Using consistent input/output delimiter labels (e.g. Input: ... Output: ... or Markdown code blocks)',
              'In reverse alphabetical order',
              'Using random character encodings',
            ],
            correctAnswer: 1,
            explanation: 'Consistent labels allow the self-attention heads to easily attend to the pattern across input-output demonstration pairs.',
          },
          {
            id: 'ai-q7',
            question: 'What is the primary risk of providing too many few-shot examples (e.g., 20+ examples)?',
            options: [
              'It burns up prompt token budget and can lead to recency bias where the model fixates only on the last example',
              'The server runs out of GPU VRAM immediately',
              'The model deletes its vocabulary',
              'The prompt triggers an automatic chargeback',
            ],
            correctAnswer: 0,
            explanation: 'Excessive examples increase inference costs, eat into context window limits, and can introduce recency bias.',
          },
          {
            id: 'ai-q8',
            question: 'When should you choose Zero-Shot prompting over Few-Shot prompting?',
            options: [
              'When you have zero internet access',
              'For standard, straightforward tasks (like general sentiment analysis or translation) where base model knowledge is already sufficient and token conservation is desired',
              'Only when using Python 2',
              'Never; Zero-Shot is always invalid',
            ],
            correctAnswer: 1,
            explanation: 'Zero-shot is fastest, uses the fewest tokens, and works remarkably well for common benchmarks and general language tasks.',
          },
          {
            id: 'ai-q9',
            question: 'What does "Label Imbalance" in Few-Shot demonstrations cause?',
            options: [
              'The model skews its predictions toward the class with more demonstration examples',
              'The model crashes with HTTP 500',
              'It produces zero output',
              'It switches languages randomly',
            ],
            correctAnswer: 0,
            explanation: 'LLMs are susceptible to majority-class bias; if 4 out of 5 examples are "Positive", the model is biased toward predicting "Positive".',
          },
          {
            id: 'ai-q10',
            question: 'Which delimiter pattern is safest to distinguish multiple few-shot exemplars in a prompt?',
            options: [
              'Invisible whitespace',
              'Clear separators such as "---" or XML tags like <example>...</example>',
              'Random emoji strings',
              'No separator at all',
            ],
            correctAnswer: 1,
            explanation: 'Clear demarcations prevent example bleed and help the model distinguish where one demonstration ends and the next begins.',
          },
        ],
      },
    });

    console.log(`✓ Course seeded: ${aiCourse1.title}`);
  } catch (err: any) {
    console.log(`AI Course 1 setup: ${err.message}`);
  }

  // Course 2: Advanced Prompt Engineering
  try {
    aiCourse2 = await adminService.createCourse({
      title: 'Advanced Prompt Engineering & Cognitive Patterns',
      slug: 'advanced-prompt-engineering',
      description: 'Master Chain-of-Thought (CoT), ReAct tool-calling frameworks, hallucination mitigation, and secure prompt architectures.',
      difficulty: 'intermediate',
      estimatedMinutes: 90,
      status: 'published',
    });

    const aiMod2 = await adminService.createModule(aiCourse2.id, {
      title: 'Module 1: Chain of Thought & Reasoning Frameworks',
      description: 'Cognitive decomposition, structured delimiters, and hallucination reduction.',
      order: 1,
    });

    const aiAdvL1 = await adminService.createLesson(aiMod2.id, {
      title: 'Chain-of-Thought (CoT) & Reasoning Architectures',
      slug: 'chain-of-thought-reasoning',
      order: 1,
      type: 'reading',
      content: `### Chain-of-Thought (CoT) Prompting

Standard LLM generation attempts to output the answer immediately in a single step. For multi-step arithmetic, logic puzzles, or system architecture tasks, this often leads to errors.

**Chain-of-Thought (CoT)** forces the model to break down complex problems into explicit intermediate calculation steps before providing the final conclusion.

#### 1. Zero-Shot CoT: The Magic Phrase
Adding the directive **\`"Let's think step by step:"\`** causes the model to generate its intermediate chain of reasoning, dramatically increasing accuracy on mathematical and algorithmic problems.

\`\`\`markdown
Problem: A student takes 3 coding exams. Exam 1 has 20 questions, Exam 2 has 30% more questions than Exam 1, and Exam 3 has 5 fewer questions than Exam 2. How many total questions did the student face?

Let's think step by step:
1. Exam 1 = 20 questions.
2. 30% of 20 = 0.3 * 20 = 6 questions. So Exam 2 = 20 + 6 = 26 questions.
3. Exam 3 = Exam 2 - 5 = 26 - 5 = 21 questions.
4. Total questions = Exam 1 + Exam 2 + Exam 3 = 20 + 26 + 21 = 67 questions.

Therefore, the student faced 67 total questions.
\`\`\`

#### 2. Delimiters and Prompt Structuring
To prevent prompt injections and clearly delineate instructions from user input, always use clear delimiters:

\`\`\`markdown
### ROLE & OBJECTIVE ###
You are a Principal Software Architect conducting code reviews for university submissions.

### CONSTRAINTS ###
- Analyze time and space complexity in Big-O notation.
- If the submission contains an infinite loop or memory leak, flag it as CRITICAL.
- Respond in valid markdown format.

### USER CODE SUBMISSION ###
\`\`\`javascript
function findDuplicates(arr) {
  let seen = new Set();
  return arr.filter(item => seen.has(item) ? true : (seen.add(item), false));
}
\`\`\`

### ANALYSIS & REVIEW ###
\`\`\`
`,
      learningObjectives: [
        'Apply Chain-of-Thought prompting to multi-step logic and mathematical tasks',
        'Use explicit delimiters (###, XML tags, or backticks) to separate instructions from untrusted input',
        'Prevent hallucinations by grounding prompts in verifiable context',
      ],
    });

    await adminService.createExercise(aiAdvL1.id, {
      title: 'Knowledge Check: Chain-of-Thought & Prompt Architecture',
      type: 'quiz',
      marks: 20,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'cot-q1',
            question: 'Why does Chain-of-Thought (CoT) prompting increase accuracy on multi-step reasoning problems?',
            options: [
              'It gives the model more computational time/tokens to develop intermediate states before generating the final answer',
              'It permanently enables GPU multi-threading on the server',
              'It bypasses the tokenizer directly',
              'It increases the context window size automatically',
            ],
            correctAnswer: 0,
            explanation: 'Each generated token becomes part of the prompt context for subsequent tokens. Generating reasoning steps explicitly allows subsequent tokens to attend to verified intermediate calculations.',
          },
          {
            id: 'cot-q2',
            question: 'Which of the following is the most secure method to prevent prompt injection when accepting untrusted user inputs?',
            options: [
              'Wrap user inputs with explicit delimiters (e.g., XML tags like <user_input>...</user_input> or ###) and instruct the system to treat content inside as data only',
              'Increase the temperature to 2.0',
              'Delete all consonants from the user prompt',
              'Only run prompts on weekdays',
            ],
            correctAnswer: 0,
            explanation: 'Structured delimiters establish a clear semantic boundary between instructions and raw data, preventing the LLM from executing user-provided commands.',
          },
          {
            id: 'cot-q3',
            question: 'What is the "ReAct" (Reasoning + Acting) pattern in agentic LLM architectures?',
            options: [
              'A frontend JavaScript library for rendering UI',
              'A paradigm combining verbal reasoning traces and task-specific actions (like querying APIs or databases) in an interleaved loop',
              'A model quantization scheme',
              'A prompt compression algorithm',
            ],
            correctAnswer: 1,
            explanation: 'ReAct interleaves reasoning ("Thought: I need to check the current inventory") with action ("Action: call search_database()") and observation ("Observation: 5 items left") until reaching a final answer.',
          },
          {
            id: 'cot-q4',
            question: 'What is the difference between Direct Prompt Injection and Indirect Prompt Injection?',
            options: [
              'Direct injection occurs via user prompt; indirect occurs when an LLM consumes compromised third-party data (e.g., website, email, PDF) containing malicious instructions',
              'Direct injection only works on Python models',
              'Indirect injection requires root access to the physical server',
              'There is no technical difference',
            ],
            correctAnswer: 0,
            explanation: 'Indirect prompt injection happens when external untrusted data ingested by the model (via web browsing, RAG, or email processing) contains adversarial commands that hijack the model behavior.',
          },
          {
            id: 'cot-q5',
            question: 'What is "Self-Consistency" prompting in complex reasoning benchmarks?',
            options: [
              'Asking the model once and accepting whatever it outputs',
              'Sampling multiple diverse reasoning paths from the model with temperature > 0 and selecting the most frequent answer via majority voting',
              'Checking if the server CPU is consistent',
              'Only using one prompt per session',
            ],
            correctAnswer: 1,
            explanation: 'Self-Consistency samples diverse reasoning paths and takes the plurality/majority vote of the final answers, significantly improving over standard greedy CoT.',
          },
          {
            id: 'cot-q6',
            question: 'What does "Tree of Thoughts" (ToT) allow an LLM to do that linear CoT cannot?',
            options: [
              'Render ASCII trees in Markdown',
              'Systematically explore multiple reasoning branches, evaluate progress at each step, and backtrack when an exploratory path hits a dead end',
              'Reduce GPU power consumption by 90%',
              'Eliminate all tokens',
            ],
            correctAnswer: 1,
            explanation: 'Tree of Thoughts generalizes CoT by enabling exploration of multiple thought paths, lookahead evaluations, and deliberate backtracking (via BFS or DFS).',
          },
          {
            id: 'cot-q7',
            question: 'Why should you include "If the information is not in the text, respond with \'I don\'t know\'" in RAG prompts?',
            options: [
              'To make the prompt longer',
              'To mitigate hallucination by giving the model an explicit, permitted refusal path instead of forcing it to guess',
              'To save internet bandwidth',
              'To force the model to shut down',
            ],
            correctAnswer: 1,
            explanation: 'Providing an explicit permission to abstain prevents the model from attempting to fulfill the query with fabricated information when the provided context lacks the answer.',
          },
        ],
      },
    });

    console.log(`✓ Course seeded: ${aiCourse2.title}`);
  } catch (err: any) {
    console.log(`AI Course 2 setup: ${err.message}`);
  }

  // ==========================================
  // Course 3: Generative AI Systems & Reasoning Models
  // ==========================================
  try {
    aiCourse3 = await adminService.createCourse({
      title: 'Generative AI & LLM Systems: Transformers to Reasoning Models (2026 Edition)',
      slug: 'genai-transformers-reasoning-models',
      description: 'Deep dive into transformer attention mechanics, Rotary Positional Embeddings (RoPE), KV-cache memory dynamics, Mixture of Experts (MoE), and test-time compute scaling reasoning models (OpenAI o1/o3, DeepSeek-R1 GRPO).',
      difficulty: 'intermediate',
      estimatedMinutes: 90,
      status: 'published',
    });

    const aiMod3_1 = await adminService.createModule(aiCourse3.id, {
      title: 'Module 1: Attention Mechanisms, RoPE & KV-Caching',
      description: 'Scaled dot-product attention, multi-head projections, RoPE context extrapolation, and KV-cache latency bottlenecks.',
      order: 1,
    });

    const aiL3_1 = await adminService.createLesson(aiMod3_1.id, {
      title: 'Self-Attention, Multi-Head Attention & Rotary Positional Embeddings (RoPE)',
      slug: 'self-attention-multi-head-rope',
      order: 1,
      type: 'reading',
      content: `### Deep Dive: Scaled Dot-Product Attention & RoPE

At the heart of every modern Generative AI model—from Llama 3 to GPT-4o and DeepSeek-V3—is the **Attention Mechanism**.

#### 1. Scaled Dot-Product Attention Formula

$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V$$

- **Queries ($Q$)**: What the current token is seeking in other tokens.
- **Keys ($K$)**: What properties the target token advertises about itself.
- **Values ($V$)**: The actual semantic information transferred if attention weight is high.
- **Scaling Factor $\\sqrt{d_k}$**: As dimension $d_k$ grows large, the dot products grow in magnitude, pushing the softmax function into regions with near-zero gradients. Dividing by $\\sqrt{d_k}$ stabilizes backpropagation.

#### 2. Why Absolute Positional Embeddings Failed
Early transformers used sinusoidal or learned absolute position embeddings added directly to input vectors:
$$\\vec{x}_i = \\text{Embedding}(w_i) + \\text{Position}(i)$$
**The Problem**: Absolute positions do not encode the relative geometric distance between tokens. Token distance $(i - j)$ is what matters for grammar and reasoning, not absolute position index.

#### 3. Rotary Position Embedding (RoPE)
Introduced by Su et al. (RoFormer) and adopted universally by modern LLMs:
- Instead of adding a vector, RoPE **rotates** the 2D feature pairs in the query and key vectors in complex vector space:
$$R_{\\Theta, m}^d = \\text{diag}\\left(R_{\\theta_1, m}, R_{\\theta_2, m}, \\dots, R_{\\theta_{d/2}, m}\\right)$$
- The inner product $\\langle R_m q, R_n k \\rangle$ depends **only on the relative distance $(m - n)$**.
- Allows context window scaling techniques such as **YaRN** and **Dynamic NTK-aware scaling** to extrapolate 8k training windows to 128k+ tokens during inference!
`,
      learningObjectives: [
        'Derive the Scaled Dot-Product Attention equation and justify the scaling factor',
        'Analyze why absolute position embeddings degrade at long contexts',
        'Explain how Rotary Position Embeddings (RoPE) preserve relative distances mathematically',
      ],
    });

    await adminService.createExercise(aiL3_1.id, {
      title: 'Knowledge Check: Attention Mechanics & RoPE',
      type: 'quiz',
      marks: 20,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'rope-q1',
            question: 'Why do modern LLMs divide the query-key dot product by sqrt(d_k) before applying the softmax function?',
            options: [
              'To reduce GPU memory allocation by half',
              'To prevent extremely large dot products that push the softmax function into vanishing gradient regimes',
              'To convert tokens from integer IDs into floating point values',
              'To enable multi-threading on CPU runners',
            ],
            correctAnswer: 1,
            explanation: 'For large vector dimensions d_k, variance of the dot product scales with d_k. Scaling by sqrt(d_k) keeps variance close to 1, preventing softmax saturation and vanishing gradients.',
          },
          {
            id: 'rope-q2',
            question: 'What is the key mathematical property of Rotary Position Embedding (RoPE)?',
            options: [
              'It permanently caches all token weights on disk',
              'The inner product between query at position m and key at position n depends solely on relative offset (m - n)',
              'It removes the need for Key and Value matrices completely',
              'It forces every prompt to be exactly 4,096 tokens',
            ],
            correctAnswer: 1,
            explanation: 'RoPE rotates representations such that their dot product is an invariant function of the relative distance (m - n), enabling natural relative attention and extrapolation.',
          },
        ],
      },
    });

    const aiL3_2 = await adminService.createLesson(aiMod3_1.id, {
      title: 'KV-Cache Memory Dynamics & Inference Throughput',
      slug: 'kv-cache-memory-dynamics',
      order: 2,
      type: 'reading',
      content: `### The KV-Cache: The Primary Bottleneck in LLM Serving

When generating tokens autoregressively, the model generates one token at a time:
$$x_{t} = \\text{Model}(x_1, x_2, \\dots, x_{t-1})$$

#### 1. Why Recomputation is Prohibitive ($O(N^2)$)
Without caching, predicting token $t=1000$ requires re-projecting Keys and Values for all 999 previous tokens through every transformer layer. Total operations would scale quadratically $O(N^2)$.

#### 2. How the KV-Cache Works
During generation, we save the computed Key ($K$) and Value ($V$) tensors for all previous tokens in GPU High-Bandwidth Memory (HBM). For the new token:
1. Only project the single new query $q_t$, key $k_t$, and value $v_t$.
2. Append $k_t$ and $v_t$ to the stored cache.
3. Compute attention against the cached keys and values in $O(N)$ time per token.

#### 3. KV Cache Memory Sizing Formula
$$\\text{Memory (Bytes)} = 2 \\times \\text{layers} \\times \\text{heads}_{KV} \\times d_{head} \\times \\text{seq\\_len} \\times \\text{batch\\_size} \\times \\text{bytes\\_per\\_elem}$$

> **Example**: Llama-3-70B (80 layers, 8 KV heads in Grouped-Query Attention, head dimension 128, FP16 precision = 2 bytes):
> For a sequence length of 8,192 tokens per request, the KV cache alone consumes:
> $$2 \\times 80 \\times 8 \\times 128 \\times 8192 \\times 1 \\times 2 \\approx 2.68\\text{ GB per concurrent user!}$$

#### 4. Modern KV-Cache Optimizations
- **Grouped-Query Attention (GQA)**: Shares a single Key-Value head across multiple Query heads (e.g., 8:1 ratio), cutting memory by 8x.
- **PagedAttention (vLLM)**: Treats GPU memory like OS virtual memory paging, eliminating internal memory fragmentation.
`,
      learningObjectives: [
        'Analyze why autoregressive token generation without caching requires O(N^2) compute',
        'Calculate exact KV-cache GPU memory requirements using the multi-head parameter formula',
        'Contrast Multi-Head Attention (MHA) with Grouped-Query Attention (GQA)',
      ],
    });

    await adminService.createExercise(aiL3_2.id, {
      title: 'Coding Exercise: KV-Cache Memory Calculator',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        python: `def calculate_kv_cache_gb(layers: int, kv_heads: int, head_dim: int, seq_len: int, batch_size: int, precision_bytes: int = 2) -> float:
    """
    Calculate the total KV-cache memory in Gigabytes (GB).
    Formula: 2 * layers * kv_heads * head_dim * seq_len * batch_size * precision_bytes / (1024 ** 3)
    """
    # Write your implementation here
    pass

# Test case
# Llama-3-70B: layers=80, kv_heads=8, head_dim=128, seq_len=8192, batch_size=1, precision=2 bytes
print(round(calculate_kv_cache_gb(80, 8, 128, 8192, 1, 2), 2))
`,
      },
      hints: [
        'Remember there is a factor of 2 because we cache BOTH Keys and Values.',
        'Divide total bytes by (1024 ** 3) to convert from bytes to Gigabytes (GiB).',
      ],
    });

    const aiMod3_2 = await adminService.createModule(aiCourse3.id, {
      title: 'Module 2: Reasoning Models & Test-Time Compute (o1, DeepSeek-R1)',
      description: 'The shift from pre-training scaling laws to test-time compute search, Tree-of-Thought backtracking, and GRPO reinforcement learning.',
      order: 2,
    });

    const aiL3_3 = await adminService.createLesson(aiMod3_2.id, {
      title: 'Test-Time Compute Scaling & Reasoning Paradigms (OpenAI o1, DeepSeek-R1)',
      slug: 'test-time-compute-reasoning-models',
      order: 1,
      type: 'reading',
      content: `### The Paradigm Shift: From Pre-Training Scaling to Test-Time Compute

For years, LLM improvements relied on **Pre-training Scaling Laws** (Kaplan et al., Chinchilla): training bigger models on more internet tokens.
In 2024–2026, industry frontier progress unlocked **Test-Time Compute Scaling**.

#### 1. What is Test-Time Compute?
Instead of forcing the model to generate the final answer in a single deterministic pass, the model is given a budget of **hidden reasoning tokens** to explore:
- Decomposing the problem into sub-problems.
- Self-verifying intermediate results and actively looking for contradictions.
- Backtracking when a logical path encounters an error.

#### 2. DeepSeek-R1 & GRPO (Group Relative Policy Optimization)
DeepSeek-R1 demonstrated that reasoning capabilities can emerge **directly from pure Reinforcement Learning (RL)** without human supervised warm-up:
- **No Critic Network**: Traditional PPO (Proximal Policy Optimization) requires a separate value/critic network that doubles GPU memory.
- **GRPO**: Generates a group of candidate outputs $\\{o_1, o_2, \\dots, o_G\\}$ for each question, scores them using deterministic rule-based verification (e.g. unit tests or math checks), and computes relative advantage:
$$A_i = \\frac{R_i - \\text{mean}(R)}{\\text{std}(R)}$$
- During training, models naturally exhibit the *"Aha Moment"*, learning to re-read problem statements and retry failed calculations autonomously!
`,
      learningObjectives: [
        'Differentiate between pre-training compute and test-time compute scaling laws',
        'Explain how Monte Carlo Tree Search (MCTS) and Chain-of-Thought search guide reasoning models',
        'Compare Group Relative Policy Optimization (GRPO) with traditional PPO RLHF',
      ],
    });

    await adminService.createExercise(aiL3_3.id, {
      title: 'Knowledge Check: Reasoning Models & Test-Time Compute',
      type: 'quiz',
      marks: 20,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'r1-q1',
            question: 'How does Group Relative Policy Optimization (GRPO) reduce GPU training memory compared to standard PPO?',
            options: [
              'It eliminates the need for a separate Critic/Value network by scoring groups of candidate rollouts against each other',
              'It quantizes the model to 1-bit weights',
              'It disables the attention mechanism completely during backward pass',
              'It runs only on CPU memory',
            ],
            correctAnswer: 0,
            explanation: 'GRPO computes advantages by standardizing rewards across a group of sampled responses for the same prompt, removing the parameter-heavy Critic model entirely.',
          },
          {
            id: 'r1-q2',
            question: 'What happens during test-time compute scaling in reasoning models like OpenAI o1 or DeepSeek-R1?',
            options: [
              'The server downloads additional model weights from the cloud',
              'The model spends additional inference tokens thinking, self-correcting, and searching reasoning branches before emitting the answer',
              'The user must pay double electricity rates',
              'The context window is reduced to zero',
            ],
            correctAnswer: 1,
            explanation: 'Test-time compute allows the model to explore multiple reasoning paths and verify intermediate steps, dramatically boosting complex math and coding accuracy.',
          },
        ],
      },
    });

    console.log(`✓ Course seeded: ${aiCourse3.title}`);
  } catch (err: any) {
    console.log(`AI Course 3 setup: ${err.message}`);
  }

  // ==========================================
  // Course 4: Enterprise RAG & Vector Databases
  // ==========================================
  try {
    aiCourse4 = await adminService.createCourse({
      title: 'Enterprise RAG & Vector Databases: Production Retrieval Architectures',
      slug: 'enterprise-rag-vector-databases',
      description: 'Master production Retrieval-Augmented Generation: semantic chunking, HNSW vector indexing, pgvector, hybrid search with BM25 + Dense RRF fusion, cross-encoder reranking, and Ragas evaluation.',
      difficulty: 'intermediate',
      estimatedMinutes: 100,
      status: 'published',
    });

    const aiMod4_1 = await adminService.createModule(aiCourse4.id, {
      title: 'Module 1: Chunking Strategies & Vector Embeddings',
      description: 'Semantic chunking, parent document retrieval, distance metrics, and HNSW graph indexing.',
      order: 1,
    });

    const aiL4_1 = await adminService.createLesson(aiMod4_1.id, {
      title: 'Semantic Chunking, Embeddings & Vector Similarity Metrics',
      slug: 'chunking-strategies-semantic-retrieval',
      order: 1,
      type: 'reading',
      content: `### Chunking & Vector Embeddings: The Foundation of RAG

Retrieval-Augmented Generation (RAG) is only as good as the context retrieved. The primary cause of RAG failure is **poor chunking**.

#### 1. The Chunking Spectrum
- **Fixed-Size Chunking (Naive)**: Splits every 500 characters. Slices sentences and tables in half, destroying context.
- **Recursive Character Chunking**: Recursively splits by paragraphs (\`\\n\\n\`), then sentences (\`\\n\`), then spaces (\` \`), keeping natural semantic blocks intact.
- **Semantic Chunking**: Computes embeddings for consecutive sentences. When the cosine distance between sentence $i$ and $i+1$ exceeds a threshold, a new chunk boundary is formed.
- **Parent Document / Small-to-Big Retrieval**: Index small sub-chunks (200 tokens) for precise vector matching, but return the larger parent section (1,500 tokens) to the LLM prompt.

#### 2. Vector Similarity Metrics
Given query embedding $\\vec{u}$ and document embedding $\\vec{v}$:

| Metric | Formula | Best Used For |
| :--- | :--- | :--- |
| **Cosine Similarity** | $\\frac{\\vec{u} \\cdot \\vec{v}}{\\|\\vec{u}\\| \\|\\vec{v}\\|}$ | Normalized embeddings (text-embedding-3, Cohere, BGE) |
| **Dot / Inner Product** | $\\vec{u} \\cdot \\vec{v}$ | Pre-normalized unit vectors (fastest compute) |
| **Euclidean Distance (L2)** | $\\sqrt{\\sum (u_i - v_i)^2}$ | Geometric spatial distance |
`,
      learningObjectives: [
        'Compare Fixed, Recursive, and Semantic Chunking trade-offs',
        'Implement Small-to-Big / Parent Document retrieval architecture',
        'Select the appropriate vector distance metric based on embedding normalization',
      ],
    });

    await adminService.createExercise(aiL4_1.id, {
      title: 'Knowledge Check: Chunking Strategies & Vector Metrics',
      type: 'quiz',
      marks: 15,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'rag-q1',
            question: 'Why is Parent Document (Small-to-Big) retrieval superior to naive fixed chunking in enterprise documentation?',
            options: [
              'It indexes small granular chunks for high search precision, but passes the broad parent context to the LLM for complete context awareness',
              'It permanently eliminates the need for vector embeddings',
              'It stores all documents in a plain CSV file',
              'It reduces English text to binary code',
            ],
            correctAnswer: 0,
            explanation: 'Small chunks yield sharp embedding similarity matches without noise, while returning the parent document provides the full background context needed to prevent hallucination.',
          },
        ],
      },
    });

    const aiMod4_2 = await adminService.createModule(aiCourse4.id, {
      title: 'Module 2: Advanced Hybrid Retrieval & RAG Evaluation',
      description: 'Hybrid search with Reciprocal Rank Fusion (RRF), Cross-Encoder reranking, and Ragas evaluation.',
      order: 2,
    });

    const aiL4_2 = await adminService.createLesson(aiMod4_2.id, {
      title: 'Hybrid Search (BM25 + Dense Vectors) & Reciprocal Rank Fusion (RRF)',
      slug: 'hybrid-search-bm25-reranking',
      order: 1,
      type: 'reading',
      content: `### Why Pure Vector Search Fails in Production

Dense vector embeddings excel at **conceptual matching** (e.g., matching *"headache remedies"* to *"aspirin dosage"*), but fail on:
- Exact SKU / Serial Numbers (e.g., \`CS-99482-X\`).
- Rare library function names (e.g., \`pthread_mutex_timedlock\`).
- Acronyms and compliance codes.

#### 1. Hybrid Search Architecture
To achieve production reliability, modern architectures execute **Hybrid Search**:
1. **Sparse Lexical Search**: BM25 / PostgreSQL Full-Text Search indexing exact keyword frequencies.
2. **Dense Semantic Search**: HNSW vector index in pgvector capturing meaning and intent.

#### 2. Reciprocal Rank Fusion (RRF)
How do we merge rankings from two completely different scoring scales (BM25 scores range 0–50; Cosine similarity ranges 0–1)?
**Reciprocal Rank Fusion (RRF)** uses rank positions instead of raw scores:
$$RRF\\_Score(d) = \\sum_{m \\in M} \\frac{1}{k + r_m(d)}$$
Where $r_m(d)$ is document $d$'s rank in retriever $m$, and $k$ is a smoothing constant (standard default $k=60$).

#### 3. Two-Stage Retrieval with Cross-Encoder Rerankers
- **Stage 1 (High Recall)**: Retrieve top 50 candidates using Hybrid Search (latency ~10ms).
- **Stage 2 (High Precision)**: Pass the top 50 pairs into a **Cross-Encoder Reranker** (e.g., BGE-Reranker-Large or Cohere Rerank) that performs joint attention across $(Query, Document)$ to yield the top 5 ultra-relevant chunks.
`,
      learningObjectives: [
        'Diagnose when dense vector search fails on exact keywords and identifiers',
        'Implement Reciprocal Rank Fusion (RRF) to merge disparate search scores',
        'Architect a two-stage retrieval pipeline using fast candidate generation + Cross-Encoder reranking',
      ],
    });

    await adminService.createExercise(aiL4_2.id, {
      title: 'Coding Exercise: Reciprocal Rank Fusion (RRF) Merger',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        python: `def reciprocal_rank_fusion(dense_ranks: list[str], sparse_ranks: list[str], k: int = 60) -> list[tuple[str, float]]:
    """
    Combine two ranked lists of document IDs using Reciprocal Rank Fusion.
    dense_ranks: ordered list of doc IDs from vector search (index 0 is rank 1)
    sparse_ranks: ordered list of doc IDs from BM25 search (index 0 is rank 1)
    Returns sorted list of (doc_id, rrf_score) in descending order of score.
    """
    scores = {}
    # Iterate through dense ranks
    for rank, doc_id in enumerate(dense_ranks, start=1):
        scores[doc_id] = scores.get(doc_id, 0.0) + (1.0 / (k + rank))
        
    # Iterate through sparse ranks
    for rank, doc_id in enumerate(sparse_ranks, start=1):
        scores[doc_id] = scores.get(doc_id, 0.0) + (1.0 / (k + rank))
        
    return sorted(scores.items(), key=lambda item: item[1], reverse=True)

# Test execution
dense = ["docA", "docB", "docC"]
sparse = ["docB", "docD", "docA"]
print(reciprocal_rank_fusion(dense, sparse))
`,
      },
      hints: [
        'Notice how docB appears near the top of both lists, so its combined RRF score will be highest.',
        'Use 1-indexed ranks (rank = index + 1).',
      ],
    });

    console.log(`✓ Course seeded: ${aiCourse4.title}`);
  } catch (err: any) {
    console.log(`AI Course 4 setup: ${err.message}`);
  }

  // ==========================================
  // Course 5: Agentic AI & LangChain / LangGraph Multi-Agent Orchestration
  // ==========================================
  try {
    aiCourse5 = await adminService.createCourse({
      title: 'Agentic AI & LangChain / LangGraph Multi-Agent Orchestration',
      slug: 'agentic-ai-langchain-langgraph',
      description: 'Build production autonomous agentic systems: ReAct loops, tool calling schemas, LangChain LCEL runnables, stateful multi-agent workflows with LangGraph, cycles, checkpointing, and human-in-the-loop control.',
      difficulty: 'advanced',
      estimatedMinutes: 120,
      status: 'published',
    });

    const aiMod5_1 = await adminService.createModule(aiCourse5.id, {
      title: 'Module 1: Autonomous Agent Architectures & Tool Calling',
      description: 'The ReAct pattern, function calling schemas, and LangChain Expression Language (LCEL).',
      order: 1,
    });

    const aiL5_1 = await adminService.createLesson(aiMod5_1.id, {
      title: 'The ReAct Pattern & Deterministic Tool Calling',
      slug: 'react-pattern-tool-calling',
      order: 1,
      type: 'reading',
      content: `### Moving from Passive LLMs to Autonomous Agents

A standard LLM is a stateless text-in, text-out predictor. An **Agent** is an LLM empowered with:
1. **Perception**: Ability to inspect environment state.
2. **Action**: Ability to execute deterministic tools (SQL queries, APIs, code runners, web scrapers).
3. **Feedback Loop**: Incorporating tool results into subsequent reasoning steps.

#### 1. The ReAct (Reason + Act) Loop
Yao et al. formalizes the continuous cycle:
$$\\text{Thought} \\rightarrow \\text{Action (Tool Call)} \\rightarrow \\text{Observation (Tool Output)} \\rightarrow \\text{Next Thought}$$

\`\`\`markdown
Question: What is the current price of stock XYZ multiplied by the prime minister's age?

Thought 1: I need to look up the current stock price of XYZ.
Action 1: call_api(service="finance", symbol="XYZ")
Observation 1: {"symbol": "XYZ", "price": 142.50}

Thought 2: Now I need to check the prime minister's current age.
Action 2: search_web(query="current prime minister age")
Observation 2: "Prime Minister was born in 1950, current age is 76."

Thought 3: Now I will multiply 142.50 by 76 using the calculator tool.
Action 3: calculate(expression="142.50 * 76")
Observation 3: 10830.0

Thought 4: I have all required values to answer the question.
Final Answer: The product is 10,830.
\`\`\`

#### 2. Native Function & Tool Calling Schemas
Modern LLMs (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro) are fine-tuned to emit structured JSON complying with JSON Schema specifications:
\`\`\`json
{
  "name": "execute_database_query",
  "description": "Executes read-only SQL queries on the student database",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "The SQL SELECT statement" },
      "timeout_seconds": { "type": "integer", "default": 5 }
    },
    "required": ["query"]
  }
}
\`\`\`
`,
      learningObjectives: [
        'Diagram the ReAct (Reason + Act + Observe) execution loop',
        'Construct valid JSON Schema definitions for LLM tool binding',
        'Handle tool execution errors gracefully with dynamic corrective prompts',
      ],
    });

    await adminService.createExercise(aiL5_1.id, {
      title: 'Knowledge Check: ReAct & Tool Calling Architecture',
      type: 'quiz',
      marks: 20,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'react-q1',
            question: 'What is the role of the "Observation" step in the ReAct pattern?',
            options: [
              'It provides the raw execution result of the chosen tool back into the LLM context so the agent can formulate its next thought',
              'It re-trains the neural network weights on the user machine',
              'It logs the user out of the platform',
              'It disables the GPU cooling fan',
            ],
            correctAnswer: 0,
            explanation: 'The observation feeds real-world environmental feedback into the model context window, allowing the agent to evaluate whether its action succeeded or if it must retry with a different approach.',
          },
        ],
      },
    });

    const aiMod5_2 = await adminService.createModule(aiCourse5.id, {
      title: 'Module 2: Stateful Multi-Agent Orchestration with LangGraph',
      description: 'Cyclic graphs, state persistence, supervisor pattern, and human-in-the-loop approvals.',
      order: 2,
    });

    const aiL5_2 = await adminService.createLesson(aiMod5_2.id, {
      title: 'LangGraph: State Graphs, Cyclic Execution & Human-in-the-Loop',
      slug: 'langgraph-state-graphs-cycles',
      order: 1,
      type: 'reading',
      content: `### Why DAGs Fail: The Need for Cyclic Graphs

Traditional orchestration engines (Airflow, basic LangChain chains) are **Directed Acyclic Graphs (DAGs)**: data flows strictly in one direction from node A to node B to node C.

**Autonomous agents are fundamentally non-linear**:
- A code generation agent writes code $\\rightarrow$ runs tests in sandbox $\\rightarrow$ tests fail $\\rightarrow$ **loops back** to re-write code until tests pass.
- Requires loops, conditional routing, state persistence, and interruptibility.
- **LangGraph** models the multi-agent system as a **Stateful Cyclic Graph**.

#### 1. Core LangGraph Primitives
1. **State**: A shared typed data structure (e.g. \`TypedDict\` or Pydantic model) that all nodes inspect and modify.
2. **Nodes**: Python functions representing agents or tools that receive the current state and return state mutations.
3. **Edges**: Direct links from one node to the next.
4. **Conditional Edges**: Decision functions that inspect state and dynamically choose the next node (e.g., if review == "approved" $\\rightarrow$ deploy, else $\\rightarrow$ revise).
5. **Checkpointer**: Persists state snapshots at every step (PostgresSaver / MemorySaver) enabling **Time-Travel Debugging** and long-running stateful sessions.
6. **Interrupts**: Pauses graph execution before sensitive actions (e.g., database deletions or financial transactions) for **Human-in-the-Loop Approval**.

#### 2. The Multi-Agent Supervisor Pattern
\`\`\`
                 ┌──────────────┐
                 │  Supervisor  │◄────────────┐
                 └──────┬───────┘             │
                        │ (Delegates Task)    │
         ┌──────────────┼──────────────┐      │
         ▼              ▼              ▼      │
   ┌───────────┐  ┌───────────┐  ┌──────────┐ │ (Returns Output)
   │  Coder    │  │  Auditor  │  │  Tester  │─┘
   └───────────┘  └───────────┘  └──────────┘
\`\`\`
`,
      learningObjectives: [
        'Analyze why cyclic graphs are essential for autonomous agent self-correction',
        'Implement LangGraph StateGraph, Nodes, Edges, and Conditional Edges',
        'Configure Checkpointers and Human-in-the-Loop interrupts for mission-critical actions',
      ],
    });

    await adminService.createExercise(aiL5_2.id, {
      title: 'Coding Exercise: Multi-Agent Conditional Router in Python',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        python: `from typing import Literal

def supervisor_router(state: dict) -> Literal["coder", "security_auditor", "deployer", "__end__"]:
    """
    Evaluate the multi-agent state dictionary and route to the next appropriate node:
    - If 'code' is empty -> 'coder'
    - If 'is_security_verified' is False -> 'security_auditor'
    - If 'test_status' != 'passed' -> 'coder' (retry coding)
    - If code is written, security is verified, and tests passed -> 'deployer'
    - If already deployed -> '__end__'
    """
    # Write your routing logic here
    pass

# Test cases
sample_state = {
    "code": "def solve(): return 42",
    "is_security_verified": True,
    "test_status": "passed",
    "is_deployed": False
}
print(supervisor_router(sample_state))  # Expected: 'deployer'
`,
      },
      hints: [
        'Check conditions in priority order: code existence -> tests passing -> security verification -> deployment state.',
      ],
    });

    console.log(`✓ Course seeded: ${aiCourse5.title}`);
  } catch (err: any) {
    console.log(`AI Course 5 setup: ${err.message}`);
  }

  // ==========================================
  // Publish AI Learning Paths
  // ==========================================
  // Path 1: Beginner AI & Prompt Engineering
  try {
    const aiPath1 = await adminService.createPath({
      title: 'Artificial Intelligence & Prompt Engineering Masterclass',
      slug: 'ai-prompt-engineering',
      description: 'Master Generative AI, LLM tokenomics, zero/few-shot in-context learning, Chain-of-Thought reasoning, and hallucination guardrails.',
      difficulty: 'beginner',
      estimatedHours: 10,
      tags: ['AI', 'Prompt Engineering', 'LLM', 'Generative AI', 'NLP'],
      iconUrl: '/images/tech/ai-brain.svg',
      status: 'published',
      courseIds: [aiCourse1?.id, aiCourse2?.id].filter((id): id is string => typeof id === 'string'),
    });
    console.log(`✓ Learning Path published: ${aiPath1?.title}`);
  } catch (err: any) {
    console.log(`AI Path 1 setup note: ${err.message}`);
  }

  // Path 2: Advanced Generative AI & Agentic Systems Architecture (2026 Masterclass)
  try {
    const aiPath2 = await adminService.createPath({
      title: 'Generative AI & Agentic Systems Architecture (2026 Masterclass)',
      slug: 'genai-agentic-architecture',
      description: 'The definitive enterprise masterclass covering Transformer KV-cache dynamics, Reasoning models (o1/R1), Production RAG, Vector DBs, and LangGraph multi-agent orchestration.',
      difficulty: 'advanced',
      estimatedHours: 25,
      tags: ['GenAI', 'LLM', 'Agentic AI', 'LangChain', 'LangGraph', 'RAG', 'Vector DB', 'Prompt Engineering'],
      iconUrl: '/images/tech/ai-brain.svg',
      status: 'published',
      courseIds: [aiCourse1?.id, aiCourse2?.id, aiCourse3?.id, aiCourse4?.id, aiCourse5?.id].filter(
        (id): id is string => typeof id === 'string',
      ),
    });
    console.log(`✓ Flagship Learning Path published: ${aiPath2?.title}`);
  } catch (err: any) {
    console.log(`AI Path 2 setup note: ${err.message}`);
  }

  // ==========================================
  // 4. PYTHON COMPLETE: BASICS TO ADVANCED
  // ==========================================
  console.log('\n--- Seeding Python Basics to Advanced Path ---');
  let pyCourse1, pyCourse2;

  try {
    pyCourse1 = await adminService.createCourse({
      title: 'Python Core Fundamentals & Data Structures',
      slug: 'python-core-fundamentals',
      description: 'Master Pythonic syntax, primitive types, mutability vs immutability, list comprehensions, and dictionaries.',
      difficulty: 'beginner',
      estimatedMinutes: 75,
      status: 'published',
    });

    const pyMod1 = await adminService.createModule(pyCourse1.id, {
      title: 'Module 1: Variables, Mutability & Comprehensions',
      description: 'Understanding Python memory models, references, and list comprehensions.',
      order: 1,
    });

    // Lesson 1: Mutability
    const pyL1 = await adminService.createLesson(pyMod1.id, {
      title: 'Python Memory Model: Mutable vs Immutable Objects',
      slug: 'python-mutability-references',
      order: 1,
      type: 'reading',
      content: `### Understanding Object Mutability in Python

In Python, everything is an **object**. Every object has an **identity (id)**, a **type**, and a **value**.

#### 1. Immutable Objects
An object whose internal state cannot be modified after creation is **immutable**.
- **Examples**: \`int\`, \`float\`, \`bool\`, \`str\`, \`tuple\`, \`frozenset\`.
- When you perform operations like concatenating strings or adding numbers, Python creates a brand-new object in memory.

\`\`\`python
a = (1, 2, 3)
# a[0] = 99  # TypeError: 'tuple' object does not support item assignment

s = "CodeSkill"
s += " University" # Creates a new string object in memory; original 'CodeSkill' is untouched
\`\`\`

#### 2. Mutable Objects
An object whose internal state can be changed in-place without altering its memory identity (\`id()\`) is **mutable**.
- **Examples**: \`list\`, \`dict\`, \`set\`, custom user classes.

\`\`\`python
nums1 = [10, 20, 30]
nums2 = nums1  # nums2 points to the SAME list in memory!

nums2.append(40)
print(nums1)  # [10, 20, 30, 40] - Modifying nums2 modified nums1!
print(nums1 is nums2)  # True (Identical memory address)
\`\`\`

> **Crucial Gotcha: Mutable Default Arguments**
> Never use a mutable object as a default argument in a function signature:
> \`def append_to(val, target=[]):\` # BUG: \`target\` is evaluated once at module load time!
> Always use \`target=None\` and initialize inside: \`target = target if target is not None else []\`.
`,
      learningObjectives: [
        'Differentiate between mutable and immutable Python data structures',
        'Analyze object references, shallow copies, and deep copies',
        'Avoid the classic mutable default argument pitfall',
      ],
    });

    await adminService.createExercise(pyL1.id, {
      title: 'Knowledge Check: Python References & Mutability',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'py-q1',
            question: 'Which of the following data types in Python is IMMUTABLE?',
            options: ['list', 'dict', 'set', 'tuple'],
            correctAnswer: 3,
            explanation: 'Tuples are immutable sequences. Once created, their items cannot be modified, added, or removed.',
          },
          {
            id: 'py-q2',
            question: 'What is the output of the following code: `a = [1]; b = a; b.append(2); print(len(a))`?',
            options: ['1', '2', 'Error', 'None'],
            correctAnswer: 1,
            explanation: 'b and a reference the same list in memory. Mutating b directly affects a, so len(a) is 2.',
          },
        ],
      },
    });

    // Lesson 2: List Comprehensions (Coding Exercise)
    const pyL2 = await adminService.createLesson(pyMod1.id, {
      title: 'List Comprehensions & Functional Filters',
      slug: 'python-list-comprehensions',
      order: 2,
      type: 'coding',
      content: `### Pythonic List Comprehensions

List comprehensions provide a concise, readable, and computationally fast syntax for transforming and filtering iterables.

#### General Syntax:
\`\`\`python
[expression for item in iterable if condition]
\`\`\`

#### Comparison with Standard Loops:
Instead of writing 5 lines of boilerplate:
\`\`\`python
# Imperative approach
evens = []
for x in range(10):
    if x % 2 == 0:
        evens.append(x ** 2)

# Pythonic Comprehension
evens = [x ** 2 for x in range(10) if x % 2 == 0]
\`\`\`

List comprehensions run in optimized C-level bytecode in CPython, outperforming standard \`.append()\` loops.
`,
      learningObjectives: [
        'Write expressive list and dictionary comprehensions',
        'Apply conditional filters to transform collections in O(N) time',
      ],
    });

    await adminService.createExercise(pyL2.id, {
      title: 'Practice: Square Even Numbers',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        python: `def square_evens(nums):\n    """\n    Return a new list containing squares of all even numbers from nums.\n    """\n    return [x ** 2 for x in nums if x % 2 == 0]\n\nprint(square_evens([1, 2, 3, 4, 5, 6]))\n`,
      },
      hints: ['Use [x ** 2 for x in nums if x % 2 == 0] to filter and square in one step.'],
    });

    console.log(`✓ Course seeded: ${pyCourse1.title}`);
  } catch (err: any) {
    console.log(`Python Course 1 setup: ${err.message}`);
  }

  // Python Course 2: Advanced Python (Decorators & Generators)
  try {
    pyCourse2 = await adminService.createCourse({
      title: 'Advanced Python: OOP, Decorators & Memory Generators',
      slug: 'python-advanced-oop-decorators',
      description: 'Master first-class functions, higher-order closures, Python decorators, and memory-efficient streaming with generators.',
      difficulty: 'advanced',
      estimatedMinutes: 90,
      status: 'published',
    });

    const pyMod2 = await adminService.createModule(pyCourse2.id, {
      title: 'Module 1: Metaprogramming & Streaming Iteration',
      description: 'Function wrappers, preservation of metadata with functools.wraps, and generator pipelines.',
      order: 1,
    });

    const pyAdvL1 = await adminService.createLesson(pyMod2.id, {
      title: 'Decorators and Higher-Order Closures',
      slug: 'python-decorators-closures',
      order: 1,
      type: 'reading',
      content: `### Mastering Python Decorators

A **Decorator** is a callable that takes a function as input, extends or modifies its behavior without directly changing its source code, and returns a new callable.

#### 1. First-Class Functions
In Python, functions are first-class citizens: they can be passed as arguments, assigned to variables, and returned from other functions.

#### 2. The Decorator Pattern & \`functools.wraps\`
\`\`\`python
import time
from functools import wraps

def time_execution(func):
    @wraps(func)  # Preserves func.__name__ and docstrings
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        duration = time.perf_counter() - start
        print(f"[{func.__name__}] executed in {duration:.4f}s")
        return result
    return wrapper

@time_execution
def process_submissions(count):
    """Processes online judge student submissions."""
    return sum(i for i in range(count))

process_submissions(1_000_000)
print(process_submissions.__name__)  # 'process_submissions' (not 'wrapper')
\`\`\`

#### Key Benefits of Decorators:
1. **Separation of Concerns**: Decouples cross-cutting concerns (authentication, rate limiting, logging, performance metrics) from business logic.
2. **DRY Principle**: Reuse validation across dozens of API endpoints with a single line: \`@require_admin\`.
`,
      learningObjectives: [
        'Construct function and method decorators using *args and **kwargs',
        'Preserve function introspection metadata with functools.wraps',
        'Implement production-ready execution timing and caching wrappers',
      ],
    });

    await adminService.createExercise(pyAdvL1.id, {
      title: 'Knowledge Check: Decorator Flow & Wrappers',
      type: 'quiz',
      marks: 15,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'dec-q1',
            question: 'Why is @functools.wraps(func) essential when building custom decorators?',
            options: [
              'It compiles the function into C code for speed',
              'It copies over original function metadata like __name__, __doc__, and annotations to the wrapper',
              'It automatically handles SQL injection vulnerabilities',
              'It forces the function to run synchronously',
            ],
            correctAnswer: 1,
            explanation: '@functools.wraps copies the original function attributes (name, docstring, annotations) to the wrapper, preventing loss of introspection.',
          },
        ],
      },
    });

    // Lesson 2: Generators
    const pyAdvL2 = await adminService.createLesson(pyMod2.id, {
      title: 'Generators & Memory-Efficient Streaming with yield',
      slug: 'python-generators-yield',
      order: 2,
      type: 'coding',
      content: `### Generators: Streaming Millions of Rows with O(1) Memory

Standard functions compute their entire return value and store it in RAM simultaneously. If you are reading a 50GB server log or generating 10 million Fibonacci numbers, this will trigger an Out-Of-Memory (OOM) crash.

**Generators** use the **\`yield\`** keyword to produce items lazily on demand, pausing execution state between calls and keeping memory overhead at constant **O(1)**.

#### Generator Example:
\`\`\`python
def fibonacci_stream(limit):
    a, b = 0, 1
    count = 0
    while count < limit:
        yield a
        a, b = b, a + b
        count += 1

# Generates values one at a time on demand:
for num in fibonacci_stream(6):
    print(num, end=" ")  # 0 1 1 2 3 5
\`\`\`
`,
      learningObjectives: [
        'Understand the Python iterator protocol (__iter__ and __next__)',
        'Implement memory-efficient data pipelines using the yield keyword',
      ],
    });

    await adminService.createExercise(pyAdvL2.id, {
      title: 'Practice: Custom Fibonacci Generator',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        python: `def fibonacci_list(n):\n    """\n    Generate the first n numbers of the Fibonacci sequence as a list.\n    """\n    def fib_gen(limit):\n        a, b = 0, 1\n        for _ in range(limit):\n            yield a\n            a, b = b, a + b\n    return list(fib_gen(n))\n\nprint(fibonacci_list(7))\n`,
      },
      hints: ['Use yield a inside a while or for loop, then advance with a, b = b, a + b.'],
    });

    console.log(`✓ Course seeded: ${pyCourse2.title}`);
  } catch (err: any) {
    console.log(`Python Course 2 setup: ${err.message}`);
  }

  // Create Python Path
  try {
    const pyPath = await adminService.createPath({
      title: 'Python Complete: From Zero to Advanced Architecture',
      slug: 'python-complete-mastery',
      description: 'Master Python from fundamentals to advanced enterprise engineering: memory models, list comprehensions, OOP, decorators, and memory-efficient generators.',
      difficulty: 'intermediate',
      estimatedHours: 16,
      tags: ['Python', 'Backend', 'Data Structures', 'OOP', 'Advanced'],
      iconUrl: '/images/tech/python.svg',
      status: 'published',
      courseIds: [pyCourse1?.id, pyCourse2?.id].filter((id): id is string => typeof id === 'string'),
    });
    console.log(`✓ Learning Path published: ${pyPath?.title}`);
  } catch (err: any) {
    console.log(`Python Path setup note: ${err.message}`);
  }

  // ==========================================
  // 5. JAVASCRIPT: FOUNDATIONS TO ASYNC
  // ==========================================
  console.log('\n--- Seeding JavaScript Foundations to Advanced Path ---');
  let jsCourse1, jsCourse2;

  try {
    jsCourse1 = await adminService.createCourse({
      title: 'JavaScript Foundations & ES6+ Scoping',
      slug: 'javascript-foundations',
      description: 'Master modern ECMAScript, let vs const, Temporal Dead Zone, lexical scoping, closures, and arrow functions.',
      difficulty: 'beginner',
      estimatedMinutes: 60,
      status: 'published',
    });

    const jsMod1 = await adminService.createModule(jsCourse1.id, {
      title: 'Module 1: Variables, Scope & Closures',
      description: 'Block scoping, the TDZ, and lexical closures.',
      order: 1,
    });

    const jsL1 = await adminService.createLesson(jsMod1.id, {
      title: 'Scope, Hoisting & The Temporal Dead Zone (TDZ)',
      slug: 'scope-hoisting-temporal-dead-zone',
      order: 1,
      type: 'reading',
      content: `### Scoping & Hoisting in Modern JavaScript

JavaScript executes in two phases: **Creation Phase** (memory allocation/hoisting) and **Execution Phase** (line-by-line interpretation).

#### 1. \`var\` vs \`let\` / \`const\`
- **\`var\`**: Function-scoped or globally-scoped. Hoisted and initialized with \`undefined\`.
- **\`let\` and \`const\`**: Block-scoped (enclosed within curly braces \`{ ... }\`). Hoisted to the top of the block, but **NOT** initialized.

#### 2. The Temporal Dead Zone (TDZ)
The **Temporal Dead Zone** is the period between entering a scope and the actual line where the variable is declared:
\`\`\`javascript
{
  // TDZ begins here for 'student'
  // console.log(student); // ReferenceError: Cannot access 'student' before initialization
  
  let student = "Aarav Sharma"; // TDZ ends here
  console.log(student); // "Aarav Sharma"
}
\`\`\`

#### 3. Closures
A **closure** is a function bundled together with references to its surrounding lexical environment:
\`\`\`javascript
function createCounter(initialValue = 0) {
  let count = initialValue; // Private variable encapsulated by closure
  return {
    increment() { count += 1; return count; },
    get() { return count; }
  };
}

const counter = createCounter(10);
console.log(counter.increment()); // 11
console.log(counter.get());       // 11
\`\`\`
`,
      learningObjectives: [
        'Differentiate between block scope, function scope, and global scope',
        'Diagnose and prevent Temporal Dead Zone ReferenceErrors',
        'Implement encapsulated private state using JavaScript closures',
      ],
    });

    await adminService.createExercise(jsL1.id, {
      title: 'Knowledge Check: JS Scoping & Closures',
      type: 'quiz',
      marks: 15,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'js-q1',
            question: 'What happens if you attempt to access a `let` variable before its line of declaration?',
            options: [
              'It returns undefined',
              'It throws a ReferenceError due to the Temporal Dead Zone (TDZ)',
              'It defaults to null',
              'It returns NaN',
            ],
            correctAnswer: 1,
            explanation: 'Variables declared with let/const are in the TDZ from the start of the block until declaration, throwing a ReferenceError if accessed prematurely.',
          },
          {
            id: 'js-q2',
            question: 'What is a closure in JavaScript?',
            options: [
              'A syntax error that closes the browser window',
              'A function that retains access to variables from its outer lexical scope even after the outer function has finished executing',
              'A method to encrypt passwords in localStorage',
              'A CSS property for closing modal popups',
            ],
            correctAnswer: 1,
            explanation: 'A closure is formed when an inner function remembers and has access to its lexical scope even when invoked outside that scope.',
          },
        ],
      },
    });

    console.log(`✓ Course seeded: ${jsCourse1.title}`);
  } catch (err: any) {
    console.log(`JS Course 1 setup: ${err.message}`);
  }

  // Course 2: Advanced JavaScript (Async & Event Loop)
  try {
    jsCourse2 = await adminService.createCourse({
      title: 'Advanced JavaScript: The Event Loop & Async Architecture',
      slug: 'javascript-advanced-async-event-loop',
      description: 'Master the V8 Call Stack, Macrotasks vs Microtasks, Promises, and non-blocking asynchronous architectures.',
      difficulty: 'advanced',
      estimatedMinutes: 90,
      status: 'published',
    });

    const jsMod2 = await adminService.createModule(jsCourse2.id, {
      title: 'Module 1: Concurrency Model & Asynchronous Execution',
      description: 'Call stack, microtask queue, macrotask queue, and Promise combinators.',
      order: 1,
    });

    const jsAdvL1 = await adminService.createLesson(jsMod2.id, {
      title: 'The Event Loop: Microtasks vs Macrotasks',
      slug: 'javascript-event-loop-microtasks',
      order: 1,
      type: 'reading',
      content: `### The JavaScript Concurrency Model & Event Loop

JavaScript is **single-threaded**: it has one Call Stack and executes one command at a time. Concurrency is handled by the browser/Node.js runtime via the **Event Loop**.

#### Execution Priority Order:
1. **Call Stack**: Executes synchronous code line-by-line until empty.
2. **Microtask Queue**: Executed IMMEDIATELY after the call stack empties and before rendering or macrotasks.
   - Includes: \`Promise.then()\`, \`Promise.catch()\`, \`queueMicrotask()\`, \`process.nextTick()\` (Node.js).
3. **Macrotask (Task) Queue**: Executed one task at a time after the microtask queue has completely drained.
   - Includes: \`setTimeout()\`, \`setInterval()\`, I/O, UI event handlers.

#### Predict the Output:
\`\`\`javascript
console.log("1 - Sync Start");

setTimeout(() => {
  console.log("2 - Timeout (Macrotask)");
}, 0);

Promise.resolve().then(() => {
  console.log("3 - Promise (Microtask)");
});

console.log("4 - Sync End");

// Output Order:
// 1 - Sync Start
// 4 - Sync End
// 3 - Promise (Microtask)
// 2 - Timeout (Macrotask)
\`\`\`

> **Rule of Thumb**: All microtasks are exhausted before the event loop picks up the next macrotask!
`,
      learningObjectives: [
        'Diagram the interplay between Call Stack, Microtask Queue, and Macrotask Queue',
        'Predict exact console log sequences involving synchronous code, timeouts, and promises',
        'Prevent UI freezes by avoiding microtask starvation loops',
      ],
    });

    await adminService.createExercise(jsAdvL1.id, {
      title: 'Knowledge Check: Event Loop Execution Order',
      type: 'quiz',
      marks: 20,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'ev-q1',
            question: 'Between a pending Promise.then() callback and a setTimeout(..., 0) callback, which one will execute first once the Call Stack is empty?',
            options: [
              'setTimeout callback because it was queued in timers',
              'Promise.then callback because it resides in the Microtask queue, which has higher priority',
              'Both execute simultaneously on two CPU cores',
              'It is random depending on network latency',
            ],
            correctAnswer: 1,
            explanation: 'Microtasks (Promises) always drain completely before the Event Loop processes the next task (setTimeout) from the Macrotask queue.',
          },
        ],
      },
    });

    // Lesson 2: Coding Exercise
    const jsAdvL2 = await adminService.createLesson(jsMod2.id, {
      title: 'Practice: Array Deduplication and Frequency Counter',
      slug: 'array-deduplication-frequency',
      order: 2,
      type: 'coding',
      content: `### Practice Exercise: Count Frequency of Elements

Implement a function \`getFrequency(arr)\` that accepts an array of strings or numbers and returns an object mapping each unique element to its frequency count.

#### Example:
- Input: \`["apple", "banana", "apple", "orange", "banana", "apple"]\`
- Output: \`{"apple": 3, "banana": 2, "orange": 1}\`
`,
      learningObjectives: ['Utilize ES6 Objects or Maps for O(N) frequency counting', 'Write clean functional reducers'],
    });

    await adminService.createExercise(jsAdvL2.id, {
      title: 'Array Frequency Function',
      type: 'coding',
      marks: 25,
      isMandatory: true,
      order: 1,
      starterCode: {
        javascript: `function getFrequency(arr) {\n  return arr.reduce((acc, item) => {\n    acc[item] = (acc[item] || 0) + 1;\n    return acc;\n  }, {});\n}\n\nconsole.log(getFrequency(["a", "b", "a", "c", "b", "a"]));\n`,
      },
      hints: ['Use Array.prototype.reduce with an accumulator object.'],
    });

    console.log(`✓ Course seeded: ${jsCourse2.title}`);
  } catch (err: any) {
    console.log(`JS Course 2 setup: ${err.message}`);
  }

  // Create JavaScript Path
  try {
    const jsPath = await adminService.createPath({
      title: 'Modern JavaScript: Foundations to Advanced Architecture',
      slug: 'javascript-mastery',
      description: 'Master modern ECMAScript, scoping, closures, the V8 event loop, microtasks, and resilient asynchronous design patterns.',
      difficulty: 'intermediate',
      estimatedHours: 14,
      tags: ['JavaScript', 'ES6+', 'Frontend', 'Async', 'Full Stack'],
      iconUrl: '/images/tech/javascript.svg',
      status: 'published',
      courseIds: [jsCourse1?.id, jsCourse2?.id].filter((id): id is string => typeof id === 'string'),
    });
    console.log(`✓ Learning Path published: ${jsPath?.title}`);
  } catch (err: any) {
    console.log(`JS Path setup note: ${err.message}`);
  }

  // ==========================================
  // 6. DATA STRUCTURES & ALGORITHMS PATH
  // ==========================================
  console.log('\n--- Seeding Data Structures & Algorithms Path ---');
  try {
    const dsaCourse = await adminService.createCourse({
      title: 'Arrays, Strings & Two-Pointer Techniques',
      slug: 'arrays-and-two-pointers',
      description: 'Master in-place array manipulation, sliding windows, two pointers, and prefix sums for interview excellence.',
      difficulty: 'intermediate',
      estimatedMinutes: 90,
      status: 'published',
    });

    const dsaMod = await adminService.createModule(dsaCourse.id, {
      title: 'Module 1: Two-Pointer & In-Place Space Optimization',
      description: 'Techniques for solving array problems with O(1) auxiliary space.',
      order: 1,
    });

    const dsaLesson = await adminService.createLesson(dsaMod.id, {
      title: 'Two-Pointer Technique Essentials',
      slug: 'two-pointer-technique-essentials',
      order: 1,
      type: 'reading',
      content: `### Two-Pointer Technique

The two-pointer technique uses two indices to traverse a data structure (typically a sorted array or string) towards each other or in the same direction.

#### Key Use Cases:
1. **Opposite Ends**: Pair with Target Sum, Palindrome verification, Inverting arrays.
2. **Fast & Slow**: Cycle detection, removing duplicates in-place.

\`\`\`javascript
function isPalindrome(str) {
  let left = 0;
  let right = str.length - 1;
  while (left < right) {
    if (str[left] !== str[right]) return false;
    left++;
    right--;
  }
  return true;
}
\`\`\`
`,
      learningObjectives: [
        'Recognize when to apply two-pointer traversal',
        'Analyze O(N) time and O(1) space efficiency',
      ],
    });

    await adminService.createExercise(dsaLesson.id, {
      title: 'Knowledge Check: Two Pointers',
      type: 'quiz',
      marks: 10,
      isMandatory: true,
      order: 1,
      quizConfig: {
        questions: [
          {
            id: 'dsa-q1',
            question: 'What is the auxiliary space complexity of the standard two-pointer array traversal?',
            options: ['O(N)', 'O(1)', 'O(log N)', 'O(N^2)'],
            correctAnswer: 1,
            explanation: 'Two pointers only maintain two index pointers in memory, requiring O(1) constant auxiliary space.',
          },
        ],
      },
    });

    await adminService.createPath({
      title: 'Data Structures & Algorithms in Practice',
      slug: 'dsa-mastery',
      description: 'Comprehensive study plan covering Arrays, Linked Lists, Stacks, Queues, Trees, Graphs, and Dynamic Programming.',
      difficulty: 'intermediate',
      estimatedHours: 24,
      tags: ['DSA', 'Algorithms', 'Problem Solving', 'Data Structures', 'Competitive Programming'],
      iconUrl: '/images/badges/algo-master.svg',
      status: 'published',
      courseIds: [dsaCourse.id],
    });
    console.log('✓ DSA Mastery path seeded.');
  } catch (err: any) {
    console.log(`DSA Path setup note: ${err.message}`);
  }

  try {
    const autoSeedService = app.get(LearningAutoSeedService);
    await autoSeedService.seedCurriculumIfNotExist();
  } catch (err: any) {
    console.log(`Auto seed error: ${err.message}`);
  }

  await app.close();
  console.log('\n🎉 Comprehensive Curriculum & Dummy Data Seeding Complete!');
  process.exit(0);
}

bootstrap();
