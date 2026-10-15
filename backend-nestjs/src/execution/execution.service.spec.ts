import { ExecutionService, Status } from './execution.service';

describe('ExecutionService', () => {
  let service: ExecutionService;

  const originalProvider = process.env.CODE_EXECUTION_PROVIDER;
  beforeAll(() => {
    process.env.CODE_EXECUTION_PROVIDER = 'legacy';
    service = new ExecutionService();
  });

  afterAll(() => {
    if (originalProvider === undefined) delete process.env.CODE_EXECUTION_PROVIDER;
    else process.env.CODE_EXECUTION_PROVIDER = originalProvider;
  });

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const runCode = (
    language: string,
    code: string,
    testCases: any[],
    config?: any,
  ) => service.executeCode(language, code, testCases, config || {});

  const singleTest = (
    language: string,
    code: string,
    input: string,
    expected: string,
  ) => runCode(language, code, [{ id: 1, input, expected }]);

  // ─── Python Tests ─────────────────────────────────────────────────────────

  describe('Python', () => {
    it('should run Hello World', async () => {
      const results = await singleTest(
        'python',
        'print("Hello World")',
        '',
        'Hello World',
      );
      expect(results[0].passed).toBe(true);
      expect(results[0].status).toBe(Status.ACCEPTED);
    });

    it('should read from stdin', async () => {
      const code = `n = int(input())\nprint(n * 2)`;
      const results = await singleTest('python', code, '5', '10');
      expect(results[0].passed).toBe(true);
    });

    it('should handle multiple test cases', async () => {
      const code = `n = int(input())\nprint(n * 2)`;
      const testCases = [
        { id: 1, input: '5', expected: '10' },
        { id: 2, input: '3', expected: '6' },
        { id: 3, input: '0', expected: '0' },
      ];
      const results = await runCode('python', code, testCases);
      expect(results.every((r) => r.passed)).toBe(true);
      expect(results.length).toBe(3);
    });

    it('should detect wrong answer', async () => {
      const code = `print("wrong")`;
      const results = await singleTest('python', code, '', 'correct');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.WRONG_ANSWER);
    });

    it('should detect runtime error', async () => {
      const code = `x = 1 / 0`;
      const results = await singleTest('python', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.RUNTIME_ERROR);
    });

    it('should detect timeout', async () => {
      const code = `while True: pass`;
      const results = await runCode(
        'python',
        code,
        [{ id: 1, input: '', expected: '' }],
        { timeLimit: 1000 }, // 1 second
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.TIME_LIMIT_EXCEEDED);
    }, 10000);

    it('should handle multi-line output', async () => {
      const code = `print("line1")\nprint("line2")\nprint("line3")`;
      const results = await singleTest(
        'python',
        code,
        '',
        'line1\nline2\nline3',
      );
      expect(results[0].passed).toBe(true);
    });

    it('should handle trailing whitespace comparison', async () => {
      const code = `print("hello  ")`;
      const results = await singleTest('python', code, '', 'hello');
      // Trailing whitespace per line is trimmed
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── JavaScript Tests ─────────────────────────────────────────────────────

  describe('JavaScript', () => {
    it('should run Hello World', async () => {
      const code = `console.log("Hello World");`;
      const results = await singleTest('javascript', code, '', 'Hello World');
      expect(results[0].passed).toBe(true);
      expect(results[0].status).toBe(Status.ACCEPTED);
    });

    it('should read from stdin via readline', async () => {
      const code = `
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
const lines = [];
rl.on('line', (line) => lines.push(line));
rl.on('close', () => {
  const n = parseInt(lines[0]);
  console.log(n * 2);
});
`;
      const results = await singleTest('javascript', code, '7', '14');
      expect(results[0].passed).toBe(true);
    });

    it('should detect runtime error', async () => {
      const code = `throw new Error("test error");`;
      const results = await singleTest('javascript', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.RUNTIME_ERROR);
    });

    it('should detect timeout', async () => {
      const code = `while(true) {}`;
      const results = await runCode(
        'javascript',
        code,
        [{ id: 1, input: '', expected: '' }],
        { timeLimit: 1000 },
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.TIME_LIMIT_EXCEEDED);
    }, 10000);
  });

  // ─── C++ Tests ────────────────────────────────────────────────────────────

  describe('C++', () => {
    it('should compile and run Hello World', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    cout << "Hello World" << endl;
    return 0;
}`;
      const results = await singleTest('cpp', code, '', 'Hello World');
      expect(results[0].passed).toBe(true);
      expect(results[0].status).toBe(Status.ACCEPTED);
    });

    it('should read from stdin', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
    return 0;
}`;
      const results = await singleTest('cpp', code, '5', '10');
      expect(results[0].passed).toBe(true);
    });

    it('should handle multiple test cases', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a >> b;
    cout << a + b << endl;
    return 0;
}`;
      const testCases = [
        { id: 1, input: '3 5', expected: '8' },
        { id: 2, input: '0 0', expected: '0' },
        { id: 3, input: '-1 1', expected: '0' },
      ];
      const results = await runCode('cpp', code, testCases);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('should detect compilation error', async () => {
      const code = `
#include <iostream>
int main() {
    cout << "missing namespace" << endl;
    return 0;
}`;
      const results = await singleTest('cpp', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.COMPILATION_ERROR);
      expect(results[0].error).toBeDefined();
    });

    it('should detect wrong answer', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    cout << "wrong" << endl;
    return 0;
}`;
      const results = await singleTest('cpp', code, '', 'correct');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.WRONG_ANSWER);
    });

    it('should detect runtime error (segfault)', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    int* p = nullptr;
    *p = 42;
    return 0;
}`;
      const results = await singleTest('cpp', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.RUNTIME_ERROR);
    });

    it('should detect timeout', async () => {
      const code = `
#include <iostream>
using namespace std;
int main() {
    while(true) {}
    return 0;
}`;
      const results = await runCode(
        'cpp',
        code,
        [{ id: 1, input: '', expected: '' }],
        { timeLimit: 1000 },
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.TIME_LIMIT_EXCEEDED);
    }, 20000);

    it('should handle STL (vectors, sort)', async () => {
      const code = `
#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;
int main() {
    int n;
    cin >> n;
    vector<int> v(n);
    for (int i = 0; i < n; i++) cin >> v[i];
    sort(v.begin(), v.end());
    for (int i = 0; i < n; i++) {
        if (i > 0) cout << " ";
        cout << v[i];
    }
    cout << endl;
    return 0;
}`;
      const results = await singleTest(
        'cpp',
        code,
        '5\n3 1 4 1 5',
        '1 1 3 4 5',
      );
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── C Tests ──────────────────────────────────────────────────────────────

  describe('C', () => {
    it('should compile and run Hello World', async () => {
      const code = `
#include <stdio.h>
int main() {
    printf("Hello World\\n");
    return 0;
}`;
      const results = await singleTest('c', code, '', 'Hello World');
      expect(results[0].passed).toBe(true);
      expect(results[0].status).toBe(Status.ACCEPTED);
    });

    it('should read from stdin with scanf', async () => {
      const code = `
#include <stdio.h>
int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", n * 2);
    return 0;
}`;
      const results = await singleTest('c', code, '5', '10');
      expect(results[0].passed).toBe(true);
    });

    it('should detect compilation error', async () => {
      const code = `
#include <stdio.h>
int main() {
    undeclared_function();
    return 0;
}`;
      const results = await singleTest('c', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.COMPILATION_ERROR);
    });
  });

  // ─── Java Tests ───────────────────────────────────────────────────────────
  let hasJava = false;
  try {
    const { execSync } = require('child_process');
    execSync('javac -version', { stdio: 'ignore' });
    hasJava = true;
  } catch {
    hasJava = false;
  }

  const describeJava = hasJava ? describe : describe.skip;

  describeJava('Java', () => {
    it('should compile and run Hello World', async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello World");
    }
}`;
      const results = await singleTest('java', code, '', 'Hello World');
      expect(results[0].passed).toBe(true);
      expect(results[0].status).toBe(Status.ACCEPTED);
    });

    it('should read from stdin with Scanner', async () => {
      const code = `
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(n * 2);
    }
}`;
      const results = await singleTest('java', code, '5', '10');
      expect(results[0].passed).toBe(true);
    });

    it('should handle class named Solution', async () => {
      const code = `
public class Solution {
    public static void main(String[] args) {
        System.out.println("Hello from Solution");
    }
}`;
      const results = await singleTest('java', code, '', 'Hello from Solution');
      expect(results[0].passed).toBe(true);
    });

    it('should handle multiple test cases', async () => {
      const code = `
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int a = sc.nextInt();
        int b = sc.nextInt();
        System.out.println(a + b);
    }
}`;
      const testCases = [
        { id: 1, input: '3 5', expected: '8' },
        { id: 2, input: '0 0', expected: '0' },
        { id: 3, input: '-1 1', expected: '0' },
      ];
      const results = await runCode('java', code, testCases);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('should detect compilation error', async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        System.out.println(undeclaredVariable);
    }
}`;
      const results = await singleTest('java', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.COMPILATION_ERROR);
      expect(results[0].error).toBeDefined();
    });

    it('should detect runtime error (exception)', async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        int[] arr = new int[5];
        System.out.println(arr[10]);
    }
}`;
      const results = await singleTest('java', code, '', 'anything');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.RUNTIME_ERROR);
    });

    it('should detect wrong answer', async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        System.out.println("wrong");
    }
}`;
      const results = await singleTest('java', code, '', 'correct');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.WRONG_ANSWER);
    });

    it('should detect timeout', async () => {
      const code = `
public class Main {
    public static void main(String[] args) {
        while(true) {}
    }
}`;
      const results = await runCode(
        'java',
        code,
        [{ id: 1, input: '', expected: '' }],
        { timeLimit: 2000 },
      );
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.TIME_LIMIT_EXCEEDED);
    }, 20000);

    it('should handle collections and algorithms', async () => {
      const code = `
import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        List<Integer> list = new ArrayList<>();
        for (int i = 0; i < n; i++) list.add(sc.nextInt());
        Collections.sort(list);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (i > 0) sb.append(" ");
            sb.append(list.get(i));
        }
        System.out.println(sb.toString());
    }
}`;
      const results = await singleTest(
        'java',
        code,
        '5\n3 1 4 1 5',
        '1 1 3 4 5',
      );
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── Output Comparison Tests ──────────────────────────────────────────────

  describe('Output Comparison', () => {
    it('should pass with trailing newline', async () => {
      const code = `print("10")`;
      const results = await singleTest('python', code, '', '10\n');
      expect(results[0].passed).toBe(true);
    });

    it('should pass with trailing whitespace on lines', async () => {
      const code = `print("hello   ")`;
      const results = await singleTest('python', code, '', 'hello');
      expect(results[0].passed).toBe(true);
    });

    it('should fail on different content', async () => {
      const code = `print("10")`;
      const results = await singleTest('python', code, '', '20');
      expect(results[0].passed).toBe(false);
    });

    it('should handle multi-line comparison', async () => {
      const code = `print("1\\n2\\n3")`;
      const results = await singleTest('python', code, '', '1\n2\n3');
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── Input Normalization Tests ────────────────────────────────────────────

  describe('Input Normalization', () => {
    it('should handle structured JSON input', async () => {
      const code = `
import sys
lines = sys.stdin.read().strip().split('\\n')
nums = lines[0].split()
target = lines[1]
print(' '.join(nums), target)
`;
      const testCase = {
        id: 1,
        input: { nums: [2, 7, 11, 15], target: 9 },
        expected: '2 7 11 15 9',
      };
      const results = await runCode('python', code, [testCase]);
      expect(results[0].passed).toBe(true);
    });

    it('should handle plain string input', async () => {
      const code = `print(input())`;
      const results = await singleTest('python', code, 'hello', 'hello');
      expect(results[0].passed).toBe(true);
    });
  });

  // ─── Security Tests ──────────────────────────────────────────────────────

  describe('Security', () => {
    it('should not expose environment variables', async () => {
      const code = `
import os
db_url = os.environ.get('DATABASE_URL', 'NOT_FOUND')
jwt_secret = os.environ.get('JWT_SECRET', 'NOT_FOUND')
print(f"{db_url}|{jwt_secret}")
`;
      const results = await singleTest(
        'python',
        code,
        '',
        'NOT_FOUND|NOT_FOUND',
      );
      expect(results[0].passed).toBe(true);
      // Make sure the actual values are not in the output
      expect(results[0].output).not.toContain('postgres');
      expect(results[0].output).not.toContain('supersecret');
    });
  });

  // ─── Unsupported Language ─────────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should handle unsupported language', async () => {
      const results = await singleTest('rust', 'fn main() {}', '', '');
      expect(results[0].passed).toBe(false);
      expect(results[0].status).toBe(Status.SYSTEM_ERROR);
    });
  });

  // ─── Concurrent Execution ────────────────────────────────────────────────

  describe('Concurrent Execution', () => {
    it('should handle 4 concurrent submissions', async () => {
      const cppCode = `
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    cout << n * 2 << endl;
    return 0;
}`;
      const pyCode = `n = int(input())\nprint(n * 2)`;

      const promises = [
        singleTest('cpp', cppCode, '5', '10'),
        singleTest('python', pyCode, '7', '14'),
        singleTest('cpp', cppCode, '3', '6'),
        singleTest('python', pyCode, '10', '20'),
      ];

      const allResults = await Promise.all(promises);
      for (const results of allResults) {
        expect(results[0].passed).toBe(true);
      }
    }, 30000);
  });
});
