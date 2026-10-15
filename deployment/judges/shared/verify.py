#!/usr/bin/env python3
"""Live smoke and negative tests. Do not publish credentials or response bodies."""
import base64, json, pathlib, time, urllib.request, urllib.error, subprocess
root=pathlib.Path('/opt/codeskill-judges')
token=(root/'config/auth-token').read_text().strip()
ip=dict(line.split('=',1) for line in (root/'.env').read_text().splitlines() if '=' in line)['JUDGE_BIND_IP']
providers=(root/'config/providers').read_text().strip().split(',') if (root/'config/providers').exists() else ['judge0','piston']
urls={'judge0':f'http://{ip}:2358','piston':f'http://{ip}:2001/api/v2'}
urls={provider:url for provider,url in urls.items() if provider in providers}
headers={'judge0':{'X-Auth-Token':token},'piston':{'Authorization':'Bearer '+token}}
def call(provider,path,body=None,auth=True):
    h=headers[provider].copy() if auth else {}
    h['Content-Type']='application/json'
    req=urllib.request.Request(urls[provider]+path,data=json.dumps(body).encode() if body is not None else None,headers=h)
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            return r.status,json.load(r)
    except urllib.error.HTTPError as e:
        return e.code,{}
def check(ok,label):
    if not ok: raise RuntimeError('Verification failed: '+label)
    print('PASS '+label,flush=True)
for _ in range(90):
    try:
        if all(call(provider,'/languages' if provider=='judge0' else '/runtimes')[0]==200 for provider in providers): break
    except Exception: pass
    time.sleep(5)
else: raise RuntimeError('Judge APIs did not become ready')
runtimes=call('piston','/runtimes')[1] if 'piston' in providers else []
versions={r['language']:r['version'] for r in runtimes}
programs={
 'c':(50,'main.c','#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}',),
 'c++':(54,'main.cpp','#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}'),
 'python':(71,'main.py','a,b=map(int,input().split());print(a+b)'),
 'java':(62,'Main.java','import java.util.*; public class Main { public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}'),
 'javascript':(63,'main.js',"const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a+b);"),
 'typescript':(74,'solution.ts',"const [a,b]=require('fs').readFileSync(0,'utf8').trim().split(/\\s+/).map(Number);console.log(a+b);")}
def run(provider,lang,source=None,stdin='19 23\n',memory=262144,timeout=3):
    id,name,code=programs[lang]
    source=source if source is not None else code
    if provider=='piston':
        status,data=call(provider,'/execute',dict(language=lang,version=versions[lang],files=[dict(name=name,content=source)],stdin=stdin,run_memory_limit=memory*1024,compile_memory_limit=268435456,run_timeout=int(timeout*1000),compile_timeout=10000))
        check(status==200,'Piston accepted '+lang)
        return data.get('run',{}).get('stdout',''),data
    enc=lambda s:base64.b64encode(s.encode()).decode()
    status,data=call(provider,'/submissions?base64_encoded=true',dict(language_id=id,source_code=enc(source),stdin=enc(stdin),memory_limit=memory,cpu_time_limit=timeout,wall_time_limit=timeout+2))
    check(status==201 and 'token' in data,'Judge0 accepted '+lang)
    for _ in range(100):
        time.sleep(.3)
        _,result=call(provider,'/submissions/'+data['token']+'?base64_encoded=true')
        if result.get('status',{}).get('id',0)>2:
            return base64.b64decode(result.get('stdout') or '').decode(errors='replace'),result
    raise RuntimeError('Judge0 polling timed out')
for provider in urls:
    stdout,_=run(provider,'python',"import platform;print(platform.machine())",stdin='')
    check(stdout.strip()=='aarch64',provider+' native submission architecture')
    check(call(provider,'/languages' if provider=='judge0' else '/runtimes',auth=False)[0]==401,provider+' denies unauthenticated access')
    for lang in programs:
        stdout,result=run(provider,lang)
        check(stdout.strip()=='42',provider+' native '+lang+' stdin/output')
        if provider=='judge0': check(result['status']['id']==3,provider+' accepted result '+lang)
        else: check(result['run'].get('code')==0,provider+' exit status '+lang)
    # Student programs cannot see host/judge credentials or mount namespace files.
    code="""import os,socket
assert not any(x in os.environ for x in ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','POSTGRES_PASSWORD','REDIS_PASSWORD','AUTHN_TOKEN'])
for p in ['/judge0.conf','/api/environment','/opt/codeskill-judges/config/auth-token']:
 assert not os.path.exists(p)
for target in ['169.254.169.254','10.0.10.107','1.1.1.1']:
 s=socket.socket();s.settimeout(0.3)
 try:
  s.connect((target,80));raise Exception('network available')
 except OSError: pass
 finally: s.close()
print('ISOLATED')
"""
    stdout,_=run(provider,'python',code,stdin='')
    check(stdout.strip()=='ISOLATED',provider+' secret/filesystem/network isolation')
    stdout,result=run(provider,'python','while True: pass',stdin='',timeout=1)
    if provider=='judge0': check(result['status']['id']==5,provider+' execution timeout')
    else: check(result['run'].get('status')=='TO' or result['run'].get('signal') is not None,provider+' execution timeout')
    stdout,result=run(provider,'python',"x=bytearray(512*1024*1024);print('UNBOUNDED')",stdin='',memory=65536)
    check('UNBOUNDED' not in stdout,provider+' memory cap')
    if provider=='judge0': check(result['status']['id'] not in [3,13,14],provider+' bounded memory verdict')
    else: check(result['run'].get('code')!=0 or result['run'].get('signal') is not None,provider+' bounded memory verdict')
    fork_test="""import os,time,signal
children=[]
limited=False
try:
 for _ in range(90):
  try:
   pid=os.fork()
  except OSError:
   limited=True;break
  if pid==0:
   time.sleep(20);os._exit(0)
  children.append(pid)
finally:
 for pid in children:
  try:os.kill(pid,signal.SIGKILL)
  except ProcessLookupError:pass
 for pid in children:
  try:os.waitpid(pid,0)
  except ChildProcessError:pass
if limited:print('PROCESS_LIMITED')
"""
    stdout,_=run(provider,'python',fork_test,stdin='')
    check(stdout.strip()=='PROCESS_LIMITED',provider+' process cap')
    stdout,result=run(provider,'python',"print('X'*1000000)",stdin='')
    check(len(stdout)<=65537,provider+' output cap')
if 'piston' in providers:
    # Reject Piston zero/unlimited and oversized limits at API level.
    for value in [0,-1,536870912]:
        status,_=call('piston','/execute',dict(language='python',version=versions['python'],files=[dict(name='main.py',content='print(1)')],run_memory_limit=value))
        check(status==400,'Piston rejects unsafe memory '+str(value))
# A separate-host failure is exercised by the backend probe after integration.
if len(providers)==2:
    try:
        subprocess.run(['docker','compose','stop','judge0-api'],cwd=root,check=True,stdout=subprocess.DEVNULL)
        try:
            unavailable=call('judge0','/languages')[0]>=500
        except Exception: unavailable=True
        check(unavailable,'Judge0 outage is observable')
        stdout,_=run('piston','python')
        check(stdout.strip()=='42','Piston executes during Judge0 outage')
    finally:
        subprocess.run(['docker','compose','up','-d','judge0-api'],cwd=root,check=True,stdout=subprocess.DEVNULL)
for image in ['codeskill-'+provider+':arm64' for provider in providers]:
    arch=subprocess.check_output(['docker','image','inspect','--format','{{.Architecture}}',image],text=True).strip()
    check(arch=='arm64',image+' architecture')
(root/'verification.json').write_text(json.dumps(dict(passed=True,providers=providers,architecture='arm64',languages=list(programs),cgroup_version=2,tested_at=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),piston_versions=versions),indent=2))
print('ALL VERIFICATIONS PASSED',flush=True)
