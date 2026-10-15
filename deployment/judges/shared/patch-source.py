#!/usr/bin/env python3
import pathlib, sys
root=pathlib.Path(sys.argv[1])
p=root/'sources/piston/api/src/api/v2.js'
s=p.read_text()
# Upstream skips zero and then uses it as an unlimited memory limit. Reject it.
s=s.replace('if (!constraint_value) {', 'if (constraint_value === undefined || constraint_value === null) {')
s=s.replace('if (constraint_value < 0) {','if (!Number.isFinite(constraint_value) || constraint_value <= 0) {')
p.write_text(s)
p=root/'sources/judge0/app/jobs/isolate_job.rb'
# cgroup-v2 Isolate accounts CPU via cpu.stat by default. The obsolete v1
# --cg-timing/--no-cg-timing switches would cause every execution to fail.
s=p.read_text()
s='\n'.join(line for line in s.split('\n') if '--cg-timing' not in line and '--no-cg-timing' not in line)
p.write_text(s)

# ARM ELF binaries need more space than the 64 KiB output cap. Keep the run
# output/request limit separate from a bounded 1 MiB compiler artifact limit.
p=root/'sources/judge0/app/jobs/isolate_job.rb'
s=p.read_text().replace('-f #{Config::MAX_MAX_FILE_SIZE}', '-f #{Config::MAX_COMPILE_FILE_SIZE}', 1)
p.write_text(s)
p=root/'sources/judge0/app/helpers/config.rb'
s=p.read_text().replace('module Config\n', 'module Config\n  MAX_COMPILE_FILE_SIZE = (ENV["MAX_COMPILE_FILE_SIZE"].presence || 1024).to_i\n', 1)
p.write_text(s)
# Isolate v2 accounts CPU and peak memory since box initialization. Judge0
# originally reuses one box for compilation and execution; reset it so compile
# resource usage cannot turn a fast accepted program into a runtime timeout.
p=root/'sources/judge0/app/jobs/isolate_job.rb'
s=p.read_text()
s="require 'tmpdir'\n"+s
s=s.replace('      run\n      verify', '      reset_run_sandbox if submission.language.compile_cmd.present?\n      run\n      verify', 1)
helper='''  def reset_run_sandbox
    stage = Dir.mktmpdir("judge0-compiled-")
    begin
      raise "Cannot preserve compiled files" unless system("sudo cp -a #{boxdir}/. #{stage}/")
      raise "Cannot reset compilation sandbox" unless system("isolate #{cgroups} -b #{box_id} --cleanup")
      initialize_workdir
      raise "Cannot restore compiled files" unless system("sudo cp -a #{stage}/. #{boxdir}/")
    ensure
      system("sudo rm -rf #{stage}")
    end
  end

'''
s=s.replace('  def initialize_workdir\n',helper+'  def initialize_workdir\n',1)
p.write_text(s)
