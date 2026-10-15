// Run on the existing backend host, against a staged execution-only release.
// No database writes, test users, migrations, or production environment output.
require('reflect-metadata');
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const assert=require('assert/strict');
const backend=process.env.BACKEND_DIR || '/opt/codeskill/backend-nestjs';
require('dotenv').config({path:path.join(backend,'.env'),quiet:true});
require('dotenv').config({path:process.env.JUDGE_ENV_FILE,override:true,quiet:true});
const release=process.env.JUDGE_RELEASE_DIR;
const {ConfigService}=require('@nestjs/config');
const {RedisService}=require(path.join(backend,'dist/redis/redis.service.js'));
const {redisConfig}=require(path.join(backend,'dist/config/index.js'));
const {Judge0Service}=require(path.join(release,'execution/judge0/judge0.service.js'));
const {PistonService}=require(path.join(release,'execution/piston/piston.service.js'));
const {ExecutionService,Status}=require(path.join(release,'execution/execution.service.js'));
const samples={
 c:'#include <stdio.h>\nint main(){int a,b;scanf("%d %d",&a,&b);printf("%d\\n",a+b);}',
 cpp:'#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}',
 java:'import java.util.*; public class Main { public static void main(String[] args){Scanner s=new Scanner(System.in);System.out.println(s.nextInt()+s.nextInt());}}',
 python:'a,b=map(int,input().split());print(a+b)',
 javascript:'const [a,b]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)',
 typescript:'const [a,b]:number[]=require("fs").readFileSync(0,"utf8").trim().split(/\\s+/).map(Number);console.log(a+b)'
};
let label='initialization';
async function main(){
 const redis=new RedisService(new ConfigService({redis:redisConfig()}));
 const primary=new Judge0Service(redis),fallback=new PistonService(redis);
 const namespace='deployment_probe_'+crypto.randomUUID().replace(/-/g,'');
 primary.pool.config.name=namespace+'_judge0';fallback.pool.config.name=namespace+'_piston';
 try{
  const client=redis.getClient();
  if(client.status!=='ready') await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Redis readiness')),10000);
   client.once('ready',()=>{clearTimeout(timer);resolve()});
  });
  await client.ping();
  for(const provider of ['judge0','piston']){
   process.env.CODE_EXECUTION_PROVIDER=provider;
   const exec=new ExecutionService(fallback,primary);
   for(const [lang,code] of Object.entries(samples)){
    label=provider+' '+lang;
    const [result]=await exec.executeCode(lang,code,[{id:1,input:'19 23',expected:'42'}]);
    assert.equal(result.status,Status.ACCEPTED);assert(result.passed);
    assert.equal(exec.executionMetrics().failovers,0);
    console.log('PASS backend adapter '+label);
   }
  }
  process.env.CODE_EXECUTION_PROVIDER='judge0';
  const exec=new ExecutionService(fallback,primary);
  for(const [name,lang,code,status] of [
   ['wrong answer','python','print(0)',Status.WRONG_ANSWER],
   ['compile error','cpp','int main( {',Status.COMPILATION_ERROR],
   ['runtime error','python','raise ValueError("test")',Status.RUNTIME_ERROR]
  ]){
   label=name;const [result]=await exec.executeCode(lang,code,[{id:1,input:'',expected:'42'}]);
   assert.equal(result.status,status);assert.equal(exec.executionMetrics().failovers,0);
   console.log('PASS backend verdict '+name+' without fallback');
  }
  const original=process.env.JUDGE0_BASE_URL;
  process.env.JUDGE0_BASE_URL='http://127.0.0.1:59999';
  const unavailable=new Judge0Service(redis);unavailable.pool.config.name=namespace+'_unavailable';
  process.env.JUDGE0_BASE_URL=original;
  try{
   label='primary connection failure fallback';
   const failover=new ExecutionService(fallback,unavailable);
   const [result]=await failover.executeCode('python',samples.python,[{id:1,input:'19 23',expected:'42'}]);
   assert(result.passed);assert.equal(failover.executionMetrics().failovers,1);
   console.log('PASS backend primary connection failure uses Piston');
  }finally{unavailable.onModuleDestroy()}
  fs.writeFileSync(path.join(release,'backend-verification.json'),JSON.stringify({passed:true,at:new Date().toISOString(),checks:16}));
 }finally{
  primary.onModuleDestroy();fallback.onModuleDestroy();await redis.onModuleDestroy();
 }
}
main().catch(()=>{console.error('FAIL backend adapter '+label);process.exitCode=1});
