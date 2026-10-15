import {
  BrainCircuit,
  BriefcaseBusiness,
  ChartNoAxesCombined,
  Code2,
  MessageCircle,
  Search,
  Sparkles,
} from "lucide-react";

export type FAQ = { question: string; answer: string };
export type FAQCategory = { name: string; icon: typeof Code2; questions: FAQ[] };

export const faqCategories: FAQCategory[] = [
  {
    name: "Placement",
    icon: BriefcaseBusiness,
    questions: [
      { question: "What is placement?", answer: "Placement is the process where employers connect with students nearing graduation to recruit for jobs or internships. It can include aptitude rounds, technical interviews, role-based tasks and HR discussions. Your college placement cell may coordinate schedules, eligibility rules and employer visits." },
      { question: "How should I prepare for campus placements?", answer: "Start with the roles you want, then build a steady plan for core subjects, problem solving, projects and communication. Keep your resume accurate and specific, practise explaining your work, and check your placement cell’s timelines and eligibility criteria early." },
      { question: "What should I put on a fresher resume?", answer: "Highlight education, relevant skills, projects, internships, achievements and leadership experience. Describe your own contribution and outcomes clearly. Keep it concise, check every link, and leave out claims you cannot explain or verify." },
      { question: "Do grades matter more than projects?", answer: "It depends on the employer and role. Some companies set a minimum academic cutoff; projects and internships help demonstrate practical ability. Meet eligibility requirements, then show both strong fundamentals and evidence of work you can discuss in depth." },
    ],
  },
  {
    name: "DSA",
    icon: Code2,
    questions: [
      { question: "What should I study for an SDE role?", answer: "Build a foundation in arrays, strings, hash maps, stacks, queues, trees, graphs, recursion, sorting, searching and dynamic programming. Also study your programming language, object-oriented design, databases, operating systems and networking. Practise explaining trade-offs while solving." },
      { question: "Where can I practise DSA?", answer: "Use CodeSkill’s Problems area for curated practice and timed assessments, and keep a personal list of problems you want to revisit. You can also practise on established coding platforms. Choose one main track, write solutions yourself, and review mistakes instead of jumping between many lists." },
      { question: "Where should I learn DSA from?", answer: "Pick one structured course, book or lecture series that explains the concepts and complexity, then reinforce each topic with implementation and problems. Learn the pattern behind a solution, write it from scratch, and revisit it later. Avoid collecting resources without following a plan." },
      { question: "How many LeetCode questions should I solve?", answer: "There is no magic target. A few hundred carefully reviewed problems can be more useful than a large count solved by memorising. Focus on topic coverage, varied difficulty, explaining your approach, and re-solving problems you initially missed." },
      { question: "Should I memorise solutions or patterns?", answer: "Learn reusable patterns such as two pointers, sliding windows, BFS/DFS and binary search, but understand when each applies. After solving, explain why it works, its complexity and edge cases. Memorised code without that reasoning rarely transfers to a new problem." },
    ],
  },
  {
    name: "Web Development",
    icon: Search,
    questions: [
      { question: "What should I learn to become a web developer?", answer: "Begin with HTML, CSS and JavaScript, then learn a frontend framework such as React. Add HTTP, APIs, Git, accessibility, testing and responsive design. For full-stack roles, learn a backend runtime, a database, authentication and deployment." },
      { question: "What makes a web development project stand out?", answer: "A focused problem, a working deployed product, thoughtful UX and a clear explanation of your contribution. Include a concise README, setup steps, screenshots, tests where appropriate, and a live demo or repository. Be ready to explain design decisions and limitations." },
      { question: "Do I need to learn both frontend and backend?", answer: "Not at first. Build a solid base in one area that matches the roles you want, then learn enough of the other side to understand the full request-to-data flow. Full-stack breadth helps, but depth in at least one part makes your skills easier to demonstrate." },
      { question: "How can I practise web development without design ideas?", answer: "Rebuild a small tool you already use, improve a campus workflow, or make a simple dashboard around data you care about. Keep the first version small, ask someone to try it, and iterate based on what confused them." },
    ],
  },
  {
    name: "AI Engineer",
    icon: BrainCircuit,
    questions: [
      { question: "What should I study to become an AI engineer?", answer: "Learn Python, data structures, linear algebra, probability and statistics, then study machine learning and deep learning fundamentals. Practise data preparation, evaluation, APIs and deployment. For applied AI roles, learn how to test reliability, latency, cost and safety—not just how to call a model." },
      { question: "Do I need advanced math for AI engineering?", answer: "You need enough linear algebra, probability, statistics and calculus to understand the methods you use. The required depth depends on the role: research positions often need more theory, while applied engineering roles also emphasise software design, data pipelines and evaluation." },
      { question: "What AI projects should I build for a portfolio?", answer: "Build a small, useful system with a clear user and measurable evaluation. Show the data source, baseline, quality checks, failure cases and deployment. A carefully tested retrieval or classification project is stronger evidence than a model demo with no explanation of how well it works." },
      { question: "Should I learn generative AI tools before machine learning basics?", answer: "You can experiment with current tools while learning the fundamentals, but understand the basics of data, evaluation and model behaviour. That foundation helps you tell when a tool is appropriate and how to catch unreliable results." },
    ],
  },
  {
    name: "Data Analyst",
    icon: ChartNoAxesCombined,
    questions: [
      { question: "What should I study for a Data Analyst role?", answer: "Start with spreadsheets, SQL, descriptive statistics and data visualisation. Learn to clean data, validate assumptions, choose useful metrics and communicate findings to a non-technical audience. Python or R is valuable for repeatable analysis and larger datasets." },
      { question: "How important is SQL for data analysts?", answer: "SQL is a core day-to-day skill in many analyst roles. Practise filtering, joins, grouping, subqueries and window functions, and learn to check for duplicate rows, nulls and unexpected changes in grain before trusting a result." },
      { question: "What belongs in a data analytics portfolio?", answer: "Show the question you investigated, the dataset and its limitations, your cleaning steps, analysis, visualisations and recommendations. Include enough detail for someone else to reproduce the work, and distinguish observed evidence from assumptions." },
      { question: "Which visualisation tool should I learn first?", answer: "Choose a tool that is common in the roles you are applying for or available to you, then practise selecting clear charts and explaining them. The tool matters less than accurate metrics, readable visuals and a useful decision supported by the analysis." },
    ],
  },
  {
    name: "Communication",
    icon: MessageCircle,
    questions: [
      { question: "How can I improve my communication for technical roles?", answer: "Practise explaining one idea at a time: state the problem, describe your approach, give the reason and check that the listener is following. Record a short explanation, listen for jargon or missing steps, and refine it. Clarity grows through repeated, specific practice." },
      { question: "How should I explain a project in an interview?", answer: "Set the context briefly, describe the problem and your personal contribution, then explain an important decision and the outcome. Be honest about what did not work and what you would change. Keep implementation details ready for follow-up questions." },
      { question: "What should I do if I do not understand a question?", answer: "Pause and ask a focused clarifying question. Repeat your understanding of the goal, constraints or expected output, then confirm before proceeding. Interviewers generally value careful reasoning more than a rushed answer to the wrong problem." },
    ],
  },
  {
    name: "Interviews",
    icon: Sparkles,
    questions: [
      { question: "What do companies ask in interviews?", answer: "It varies by role and employer. Software interviews may include coding, data structures, system or object-oriented design, project discussion and behavioural questions. Analyst interviews often include SQL, metrics and case questions; AI roles may add ML evaluation. Review the job description and practise explaining your reasoning." },
      { question: "How do I prepare for behavioural interview questions?", answer: "Prepare a few truthful examples about teamwork, ownership, conflict, learning and setbacks. Use a clear situation, action and outcome structure, explain your own role, and reflect on what you learned. Avoid memorised stories that do not answer the question asked." },
      { question: "What if I get stuck during a coding interview?", answer: "Share what you have established, ask about constraints if needed, and work through a small example. Consider a simpler correct approach before optimising. Talking through assumptions and testing edge cases gives the interviewer a clear view of your reasoning." },
      { question: "How should I make a weekly interview-prep plan?", answer: "Set a realistic schedule across problem solving, role-specific fundamentals, project review and mock interviews. Reserve time to revisit mistakes and rest. At the end of the week, adjust based on what you could explain confidently and what still needs practice." },
    ],
  },
];
