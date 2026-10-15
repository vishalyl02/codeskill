# Preserve the backend's language IDs while advertising actual ARM tool versions.
gcc = `/usr/bin/gcc -dumpfullversion`.strip
java = `/usr/bin/javac -version 2>&1`.strip.sub('javac ', '')
node = `/usr/local/bin/node --version`.strip.delete_prefix('v')
python = `/usr/bin/python3 --version`.strip.sub('Python ', '')
typescript = `/usr/local/bin/tsc --version`.strip.sub('Version ', '')
languages = [
  {id: 50, name: "C (GCC #{gcc}, ARM64)", source_file: 'main.c', compile_cmd: '/usr/bin/gcc -O2 -std=c11 %s main.c -o main', run_cmd: './main'},
  {id: 54, name: "C++ (GCC #{gcc}, ARM64)", source_file: 'main.cpp', compile_cmd: '/usr/bin/g++ -O2 -std=c++17 %s main.cpp -o main', run_cmd: './main'},
  {id: 62, name: "Java (OpenJDK #{java}, ARM64)", source_file: 'Main.java', compile_cmd: '/usr/bin/javac -J-Xms16m -J-Xmx128m %s Main.java', run_cmd: '/usr/bin/java -Xms16m -Xmx96m -XX:ActiveProcessorCount=1 -XX:MaxMetaspaceSize=64m -XX:ReservedCodeCacheSize=32m Main'},
  {id: 63, name: "JavaScript (Node #{node}, ARM64)", source_file: 'main.js', run_cmd: '/usr/local/bin/node --max-old-space-size=96 main.js'},
  {id: 71, name: "Python (#{python}, ARM64)", source_file: 'main.py', run_cmd: '/usr/bin/python3 main.py'},
  {id: 74, name: "TypeScript (#{typescript}, ARM64)", source_file: 'main.ts', compile_cmd: '/usr/local/bin/tsc --target es2020 --skipLibCheck --typeRoots /usr/local/lib/node_modules/@types %s main.ts', run_cmd: '/usr/local/bin/node --max-old-space-size=96 main.js'}
]
ActiveRecord::Base.transaction do
  Language.unscoped.delete_all
  languages.each { |language| Language.create!(language.merge(is_archived: false)) }
end
