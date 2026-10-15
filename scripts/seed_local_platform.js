// Repeatable demo fixtures, restricted to local CodeSkill PostgreSQL/Redis.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const backend = path.resolve(__dirname, '../backend-nestjs');
require(path.join(backend, 'node_modules/dotenv')).config({ path: path.join(backend, '.env'), quiet: true });
const { Client } = require(path.join(backend, 'node_modules/pg'));
const bcrypt = require(path.join(backend, 'node_modules/bcryptjs'));
const Redis = require(path.join(backend, 'node_modules/ioredis'));
const { problems } = require('./seed_local_problems');

async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.pathname !== '/codeskill' || process.env.NODE_ENV === 'production') throw Error('Seed restricted to local development codeskill database');
  const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(redisUrl.hostname)) throw Error('Seed requires local Redis');
  const db = new Client({ connectionString: url.toString() }); await db.connect();
  const schemas = new Map();
  const rows = (await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public'")).rows;
  for (const row of rows) { if (!schemas.has(row.table_name)) schemas.set(row.table_name, new Map()); schemas.get(row.table_name).set(row.column_name, row.data_type); }
  const accounts = [
    { email: 'admin.test@codeskill.local', name: 'Test Administrator', username: 'test-admin', uid: 'TEST-ADMIN', role: 'super_admin', isAdmin: true, password: 'Admin@123' },
    { email: 'student.test@codeskill.local', name: 'Test Student', username: 'test-student', uid: 'TEST-STUDENT', role: 'student', isAdmin: false, password: 'Student@123' },
    { email: 'candidate.test@codeskill.local', name: 'Assessment Candidate', username: 'test-candidate', uid: 'TEST001', role: 'student', isAdmin: false, isAssessmentStudent: true, password: 'Student@123' },
    { email: 'university.test@codeskill.local', name: 'Test University Administrator', username: 'test-university-admin', uid: 'TEST-UNIVERSITY', role: 'university_admin', isAdmin: false, password: 'University@123' },
    { email: 'company.test@codeskill.local', name: 'Test Recruiter', username: 'test-recruiter', uid: 'TEST-COMPANY', role: 'company_admin', isAdmin: false, password: 'Company@123' },
  ];
  const counts = {};
  // Keys are fixed fixture identities. No table is truncated or unrelated row changed.
  const put = async (table, key, body) => {
    const columns = schemas.get(table); if (!columns) throw Error(`Missing table ${table}`);
    const keys = Object.keys(key); const where = keys.map((k,i) => `"${k}"=$${i+1}`).join(' AND ');
    const found = (await db.query(`SELECT * FROM "${table}" WHERE ${where} LIMIT 1`, Object.values(key))).rows[0];
    const data = { ...body, ...key, id: found?.id || body.id || randomUUID() };
    if (table === 'users' && found) data.tokenVersion = (found.tokenVersion || 0) + 1;
    const names = Object.keys(data); if (names.some(n => !columns.has(n))) throw Error(`Unknown seed column in ${table}: ${names.filter(n => !columns.has(n)).join(',')}`);
    const values = names.map(n => columns.get(n) === 'jsonb' || columns.get(n) === 'json' ? JSON.stringify(data[n]) : data[n]);
    const result = await db.query(`INSERT INTO "${table}" (${names.map(n => `"${n}"`).join(',')}) VALUES (${names.map((_,i) => '$'+(i+1)).join(',')}) ON CONFLICT (id) DO UPDATE SET ${names.filter(n => n !== 'id').map(n => `"${n}"=EXCLUDED."${n}"`).join(',')} RETURNING *`, values);
    counts[table] = (counts[table] || 0) + 1; return result.rows[0];
  };
  try {
    await db.query('BEGIN');
    for (const account of accounts) {
      const saved = await put('users', { email: account.email }, { ...account, password: await bcrypt.hash(account.password, 10), isActive: true, isAssessmentStudent: !!account.isAssessmentStudent, forcePasswordChange: false, mfaEnabled: false, authProvider: 'local' });
      account.id = saved.id;
    }
    const [admin, student, candidate, professor, recruiter] = accounts;
    const university = await put('universities', { username: 'codeskill-test-university' }, { name: 'CodeSkill Test University', domain: 'codeskill.local', location: 'Local development', description: 'Demo university for local testing.', contactEmail: professor.email, isVerified: true, created_by_id: professor.id });
    const batch = await put('batches', { university_id: university.id, name: 'Computer Science 2027 — Demo' }, { department: 'Computer Science', graduationYear: 2027, inviteCode: 'CS-DEMO-2027', created_by_id: professor.id });
    await put('university_users', { university_id: university.id, user_id: professor.id }, { role: 'Admin', department: 'Computer Science', isActive: true });
    for (const learner of [student, candidate]) {
      await put('student_enrollments', { university_id: university.id, student_id: learner.id }, { batch_id: batch.id, rollNumber: learner.uid, isActive: true });
      await db.query('UPDATE users SET "studentProfile"=$1 WHERE id=$2', [JSON.stringify({ university: university.name, department: 'Computer Science', course: 'B.Tech', semester: 7, section: 'A', batch: batch.name, year: 2027 }), learner.id]);
    }
    const ids = [];
    for (const p of problems) {
      let legacy = (await db.query('SELECT id FROM problems WHERE slug=$1', [p.slug])).rows[0];
      if (!legacy) legacy = await put('problems', { slug: p.slug }, { title: p.title, description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints, examples: p.examples, difficulty: 'Easy', tags: p.tags, supportedLanguages: Object.keys(p.starterCode), starterCode: p.starterCode, testCases: p.cases, hints: p.hints, editorial: p.editorial, isPublished: true, visibility: 'Published' });
      let metadata = (await db.query('SELECT id FROM problem_metadata WHERE slug=$1', [p.slug])).rows[0];
      if (!metadata) {
        metadata = await put('problem_metadata', { slug: p.slug }, { id: legacy.id, title: p.title, difficulty: 'Easy', categories: p.tags, tags: p.tags, author_id: admin.id, visibility: 'Published' });
        await put('problem_statements', { metadata_id: metadata.id }, { description: p.description, inputFormat: p.inputFormat, outputFormat: p.outputFormat, constraints: p.constraints, samples: p.examples });
        await put('problem_configs', { metadata_id: metadata.id }, { supportedLanguages: Object.keys(p.starterCode), starterCode: p.starterCode, referenceSolution: p.referenceSolution });
        await put('problem_testcases', { metadata_id: metadata.id }, { cases: p.cases });
      }
      ids.push(metadata.id);
    }
    const additional = [
      { slug: 'demo-count-even-numbers', title: 'Count Even Numbers', input: '5\n1 2 3 4 6\n', output: '3', description: '<p>Read n followed by n integers. Print how many are even.</p>', tags: ['Arrays','Math'], code: 'import sys\na=list(map(int,sys.stdin.read().split()))\n# Count even values in a[1:1+a[0]].\n', solution: 'import sys\na=list(map(int,sys.stdin.read().split()))\nprint(sum(x%2==0 for x in a[1:1+a[0]]))', cases: [{input:'5\n1 2 3 4 6\n',output:'3',isHidden:false},{input:'3\n-2 0 7\n',output:'2',isHidden:true}] },
      { slug: 'demo-palindrome-check', title: 'Palindrome Check', input: 'level\n', output: 'YES', description: '<p>Read a word. Print YES if it reads the same forwards and backwards, otherwise NO.</p>', tags: ['Strings'], code: 's=input().strip()\n# Check whether s is a palindrome.\n', solution: 's=input().strip()\nprint("YES" if s==s[::-1] else "NO")', cases: [{input:'level\n',output:'YES',isHidden:false},{input:'hello\n',output:'NO',isHidden:false},{input:'a\n',output:'YES',isHidden:true}] },
    ];
    for (const p of additional) {
      const legacy = await put('problems', { slug: p.slug }, { title: p.title, description: p.description, inputFormat: 'Read from standard input.', outputFormat: 'Print only the requested answer.', examples: [{input:p.input,output:p.output}], tags:p.tags, difficulty:'Easy', visibility:'Published', isPublished:true, supportedLanguages:['python'], starterCode:{python:p.code}, testCases:p.cases, hints:['Start by understanding the sample input and output.'], timeLimit:3000,memoryLimit:256 });
      const metadata = await put('problem_metadata', { slug:p.slug }, { id:legacy.id,title:p.title,difficulty:'Easy',categories:p.tags,tags:p.tags,author_id:admin.id,visibility:'Published' });
      await put('problem_statements',{metadata_id:metadata.id},{description:p.description,inputFormat:'Read from standard input.',outputFormat:'Print only the requested answer.',constraints:'Input contains at most 1000 values or characters.',samples:[{input:p.input,output:p.output}]});
      await put('problem_configs',{metadata_id:metadata.id},{supportedLanguages:['python'],starterCode:{python:p.code},referenceSolution:{python:p.solution},timeLimit:3000,memoryLimit:256});
      await put('problem_testcases',{metadata_id:metadata.id},{cases:p.cases}); ids.push(metadata.id);
    }
    const questions = [];
    for (const [index, q] of [
      {question:'Which data structure uses FIFO ordering?',options:['Stack','Queue','Tree','Set'],correctAnswer:1,topic:'Data Structures',explanation:'A queue serves the earliest inserted item first.'},
      {question:'What is the time complexity of binary search on a sorted array?',options:['O(1)','O(log n)','O(n)','O(n²)'],correctAnswer:1,topic:'Algorithms',explanation:'Binary search halves the search space each step.'},
      {question:'Which SQL clause filters groups after aggregation?',options:['WHERE','ORDER BY','HAVING','LIMIT'],correctAnswer:2,topic:'Databases',explanation:'HAVING filters the groups produced by GROUP BY.'},
      {question:'Which component manages memory and processes?',options:['Kernel','Compiler','Editor','Browser'],correctAnswer:0,topic:'Operating Systems',explanation:'The kernel manages system resources.'},
      {question:'What does a mutex protect?',options:['Only files','Shared data from simultaneous access','Only networks','Browser rendering'],correctAnswer:1,topic:'Operating Systems',explanation:'Mutual exclusion allows one thread at a time into a critical section.'},
      {question:'Which HTTP status indicates a successful request?',options:['200','401','404','500'],correctAnswer:0,topic:'Web Development',explanation:'HTTP 200 indicates success.'},
    ].entries()) questions.push(await put('questions',{slug:`demo-mcq-${index+1}`},{...q,title:`Demo MCQ ${index+1}`,difficulty:'easy',marks:1,questionType:'single_choice',status:'approved',correctAnswers:[q.correctAnswer],tags:['Local demo'],created_by_id:admin.id,approved_by_id:admin.id,approvedAt:new Date()}));
    const coding = await put('questions',{slug:'demo-assessment-sum'},{title:'Sum of Two Numbers',question:'Read two integers and print their sum.',description:'Read two integers and print their sum.',problemStatement:'Read two integers and print their sum.',topic:'Coding',questionType:'coding',status:'approved',difficulty:'easy',marks:5,supportedLanguages:['python','cpp','java','javascript'],starterCode:Object.entries(problems[0].starterCode).map(([language,code])=>({language,code})),examples:problems[0].examples,testCases:problems[0].cases.map((t,i)=>({id:String(i+1),input:t.input,expectedOutput:t.output,isHidden:t.isHidden,weight:1})),timeLimit:3000,memoryLimit:256,created_by_id:admin.id,approved_by_id:admin.id,approvedAt:new Date()});
    await put('question_banks',{name:'Local Testing Question Bank',topic:'Computer Science'},{description:'MCQ and coding fixtures for local testing.',questions:[...questions.map(q=>q.id),coding.id],isPublic:true,tags:['Local demo'],createdBy_id:admin.id});
    const now = Date.now(), startTime=new Date(now-86400000), endTime=new Date(now+30*86400000);
    const assessmentCommon={status:'published',startTime,endTime,targetBatches:[],targetDepartments:[],targetCourses:[],targetSections:[],shuffleQuestions:false,shuffleOptions:false,showResultImmediately:true,allowReview:true,allowedAttempts:10,negativeMarking:false,proctoring:{enforceFullscreen:false,blockCopyPaste:false,detectTabSwitch:false},securityPolicy:{secureExamMode:'DISABLED',requireFullscreen:false,proctoringMode:'NONE'},created_by_id:admin.id,instructions:['Local testing assessment.','Results are available immediately.']};
    const mcq = await put('assessments',{code:'DEMO-MCQ-01'},{...assessmentCommon,title:'Computer Science Demo Quiz',description:'Six MCQs for testing the full assessment flow.',type:'mcq',category:'exam',durationMinutes:30,totalMarks:6,passingMarks:3,questions:questions.map(q=>q.id)});
    await put('assessments',{code:'DEMO-CODE-01'},{...assessmentCommon,title:'Coding Demo Assessment',description:'One coding problem with public and hidden test cases.',type:'coding',category:'exam',durationMinutes:45,totalMarks:5,passingMarks:3,questions:[coding.id]});
    await put('assessments',{code:'DEMO-MIXED-01'},{...assessmentCommon,title:'Mixed Demo Assessment',description:'MCQs and a coding problem in one assessment.',type:'mixed',category:'exam',durationMinutes:45,totalMarks:8,passingMarks:4,questions:[...questions.slice(0,3).map(q=>q.id),coding.id]});
    // A labeled completed fixture makes admin reports testable; primary student stays fresh.
    await put('assessment_attempts',{assessment_id:mcq.id,student_id:candidate.id},{studentUid:candidate.uid,studentName:candidate.name,studentEmail:candidate.email,status:'submitted',startedAt:new Date(now-3600000),submittedAt:new Date(now-1800000),questionOrder:questions.map(q=>q.id),responses:questions.map(q=>({questionId:q.id,selectedAnswer:q.correctAnswer,isCorrect:true,marksAwarded:1,status:'answered'})),score:6,highestScore:6,maxScore:6,percentage:100,passed:true,totalAttempted:6,totalCorrect:6,accuracy:100,attemptNumber:1});
    await put('contests',{slug:'local-practice-contest'},{title:'Local Practice Contest',description:'Four easy problems to test contest registration and submissions.',startTime,endTime,problems:ids,isPublished:true,isPrivate:false,resultsPublished:true,participants:[],antiCheatConfig:{enableFullscreen:false,enableCopyProtect:false,enablePasteProtect:false,enableDevToolsDetect:false,enableTabSwitchDetect:false,enableMultipleDeviceProtect:true,warningLimit:3,autoSubmitOnViolation:false}});
    const company = await put('companies',{username:'codeskill-demo-company'},{name:'CodeSkill Demo Company',industry:'Software',description:'Sample employer for local hiring workflows.',headquarters:'Remote',companySize:'11–50',isVerified:true,created_by_id:recruiter.id,techStack:['TypeScript','Python','PostgreSQL'],benefits:['Remote work','Learning budget']});
    await put('company_users',{company_id:company.id,user_id:recruiter.id},{role:'Admin',designation:'Recruiter',isActive:true});
    const job = await put('jobs',{company_id:company.id,title:'Demo Software Engineer'},{description:'Build reliable web applications. This is a local demonstration job.',skills:['TypeScript','Python','SQL'],experienceLevel:'Entry Level',location:'Remote',workplaceType:'Remote',employmentType:'Full-time',status:'Published',applicationDeadline:endTime,created_by_id:recruiter.id,salaryRange:{min:600000,max:1200000,currency:'INR'}});
    await put('applications',{job_id:job.id,user_id:student.id},{company_id:company.id,stage:'Applied',coverLetter:'Demo application created for local testing.'});
    const discussion = await put('discussions',{problemId:ids[0],title:'How should I handle negative inputs?'},{body:'I am testing the sample cases and want to make sure negative numbers are supported.',author_id:student.id,tags:['question'],replyCount:1});
    await put('discussion_replies',{discussion_id:discussion.id,author_id:admin.id},{body:'Read the values as signed integers and test the negative-input sample.'});
    await db.query('COMMIT');
    console.log(JSON.stringify({ fixtures:counts,accounts:accounts.map(({email,uid,role})=>({email,uid,role})),assessmentCodes:['DEMO-MCQ-01','DEMO-CODE-01','DEMO-MIXED-01'],batchInviteCode:'CS-DEMO-2027' },null,2));
  } catch(error) { await db.query('ROLLBACK'); throw error; } finally { await db.end(); }
  const redis = new Redis(redisUrl.toString(),{maxRetriesPerRequest:1});
  try {
    for (const pattern of ['problems:*','problem:*','contests:*','assessments:*','questions:*']) { let cursor='0'; do { const [next,keys]=await redis.scan(cursor,'MATCH',pattern,'COUNT',100); if(keys.length) await redis.del(...keys); cursor=next; } while(cursor!=='0'); }
  } finally { await redis.quit(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
