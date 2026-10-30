/** Boundary: independent 4.2.0.11 static ABI adaptation; live validation pending. */
/** Boundary: exact-version single-target binding, native queue and account proofs. */
// Weixin 4.2.0.11 x64: separately relocated native coroutine and text/image ABI.
// Static evidence: artifacts/research/compat-4.2/send-*.json.
// This binary starts unvalidated; prior-version sends are not evidence for this version.
'use strict';
const PREFIX={
 '47310':'48 89 d0 48 8b 91 18 03 00 00 48 85 d2 74 1a', '311990':'55 41 57 41 56 56 57 53 48 81 ec c8 01 00 00',
 '2060':'56 48 83 ec 20 48 8b 71 08 48 85 f6 74 23 f0 ff 4e 08',
 '4a40e0':'56 57 48 83 ec 28 8b 05 d4 a8 86 0b 65 48 8b 14 25 58 00 00 00',
 '45d10':'48 8b 05 19 71 cc 0b c3',
 '47220':'56 48 83 ec 40 48 89 ce','384730':'48 89 d0 48 8b 51 30 48 85 d2 74 14',
 '479bd0':'55 56 57 48 81 ec 90 00 00 00','1049bf0':'55 41 57 41 56 41 54 56 57 53 48 81 ec f0 05 00 00',
 '88ad0':'41 57 41 56 56 57 53 48 83 ec 20','2010':'48 83 ec 28 48 8b 41 18 48 83 f8 10',
 '571fd20':'55 41 57 41 56 41 55 41 54 56 57 53 48 81 ec 18 03 00 00',
 '2cc2350':'55 41 57 41 56 41 55 41 54 56 57 53 48 81 ec 78 05 00 00',
 'a55060':'55 56 57 53 48 81 ec 58 01 00 00 48 8d ac 24 80 00 00 00',
 '7a60':'48 83 ec 28 48 8b 41 18 48 83 f8 08',
 '10dcd0':'55 48 83 ec 30 48 8d 6c 24 30 48 c7 45 f8 fe ff ff ff 48 8b 09',
};
const tasks=new Map();let nextTask=0;
const requests=new Map(),callbacks=new Map();
const imageResources=new Map();
const VERIFIED_DLL_SHA256='745cdf2955fa5128cdb00c056c97571156a5f107406a9bb15ac0754f3246b201';
let textValidationAllowed=false,textValidationUsed=false;
let binding=null,sendValidated=false,imageSendValidated=false,imageValidationAllowed=false,imageRuntimeBlocked=false,preparing=false;
const isIndividualId=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.:-]{0,255}$/.test(value)&&!value.startsWith('gh_')&&!/^u_[a-f0-9]{16}$/.test(value)&&!['filehelper','weixin','newsapp','fmessage','medianote','qqmail','qmessage','tmessage','floatbottle','shakeapp','facebookapp','feedsapp','voiceinputapp','notification_messages','brandsessionholder'].includes(value);
const isTargetId=value=>value==='filehelper'||isIndividualId(value);
function moduleVerified(){const m=Process.getModuleByName('Weixin.dll');if(Process.arch!=='x64'||!m.path.replaceAll('\\','/').includes('/4.2.0.11/Weixin.dll'))throw Error('E_VERSION');return m;}
function fn(r,ret,args){const m=moduleVerified(),p=m.base.add(r);if(!Process.findRangeByAddress(p)?.protection.includes('x'))throw Error('E_CODE_REGION');const expected=PREFIX[r.toString(16)]?.split(' ').filter(Boolean).map(x=>parseInt(x,16));if(!expected?.length)throw Error('E_PROLOGUE_MISSING:'+r.toString(16));const actual=new Uint8Array(p.readByteArray(expected.length));if(!expected.every((b,i)=>b===actual[i]))throw Error('E_PROLOGUE:'+r.toString(16));return new NativeFunction(p,ret,args,{abi:'win64',scheduling:'cooperative'});}
function pair(){const p=Memory.alloc(16);p.writePointer(ptr(0));p.add(8).writePointer(ptr(0));return p;}
function release(p){fn(0x2060,'void',['pointer'])(p);p.writePointer(ptr(0));p.add(8).writePointer(ptr(0));}
function text(p){const n=p.add(16).readU64().toNumber(),c=p.add(24).readU64().toNumber();if(!Number.isSafeInteger(n)||n>1024||c<n||c>65536)return null;return(c<16?p:p.readPointer()).readUtf8String(n);}
function accountIdentity(owner){
 const p=owner.readPointer(),range=Process.findRangeByAddress(p),m=moduleVerified();
 if(p.isNull()||owner.add(8).readPointer().isNull()||!range?.protection.includes('r')||p.add(0x88).compare(range.base.add(range.size))>0||!p.readPointer().equals(m.base.add(0x90d4f88)))throw Error('E_ACCOUNT_TYPE');
 const self=text(p.add(0x48));if(!isIndividualId(self))throw Error('E_ACCOUNT_ID');
 return {account:p.toString(),self};
}
function verifyBoundAccount(){
 if(!binding)throw Error('E_BINDING');const owner=pair();
 try{fn(0x47220,'pointer',['pointer'])(owner);const proof=accountIdentity(owner);if(proof.account!==binding.account||proof.self!==binding.self)throw Error('E_ACCOUNT_CHANGED');return proof;}finally{release(owner);}
}
function lookup(targetId,displayName){
 const account=pair(),after=pair(),registry=pair(),service=pair(),contact=pair(),username=Memory.alloc(32);
 fn(0x88ad0,'pointer',['pointer','pointer'])(username,Memory.allocUtf8String(targetId));
 let phase='account';
 try{
  fn(0x47220,'pointer',['pointer'])(account);
  if(account.readPointer().isNull())throw Error('E_ACCOUNT');
  const identity=accountIdentity(account);
  phase='registry';fn(0x384730,'pointer',['pointer','pointer'])(account.readPointer(),registry);
  if(registry.readPointer().isNull())throw Error('E_REGISTRY');
  phase='service';fn(0x479bd0,'pointer',['pointer','pointer'])(registry.readPointer(),service);
  if(service.readPointer().isNull())throw Error('E_SERVICE');
  phase='contact';fn(0x1049bf0,'pointer',['pointer','pointer','pointer'])(service.readPointer(),contact,username);
  const value=contact.readPointer();if(value.isNull())throw Error('E_CONTACT_NOT_FOUND');
  const id=text(value.add(8)),remark=text(value.add(0x78))===displayName,nickname=text(value.add(0xd8))===displayName;
  fn(0x47220,'pointer',['pointer'])(after);const current=accountIdentity(after);
  if(current.account!==identity.account||current.self!==identity.self)throw Error('E_ACCOUNT_CHANGED');
  return {chatId:id,displayName,displayNameMatches:remark||nickname,remarkMatches:remark,nicknameMatches:nickname,...identity};
 }catch(error){throw Error(phase+': '+error);}
 finally{fn(0x2010,'void',['pointer'])(username);for(const p of [contact,service,registry,after,account])release(p);}
}
function queue(callback){
 const key=String(++nextTask),runner=pair(),job=pair(),function64=Memory.alloc(64),source=Memory.alloc(32);
 function64.writeByteArray(new Uint8Array(64));
 const record={objects:new Map(),callbacks:[],source,sourceText:Memory.allocUtf8String('WXcc native reverse research'),sourceFunction:Memory.allocUtf8String('authorized_contact_lookup'),ran:false};
 tasks.set(key,record);
 const vtable=Memory.alloc(5*8);record.vtable=vtable;
 const create=()=>{const p=Memory.alloc(16);p.writePointer(vtable);record.objects.set(p.toString(),p);return p;};
 const clone=new NativeCallback((_self,_destination)=>create(),'pointer',['pointer','pointer'],'win64');
 const invoke=new NativeCallback(()=>{if(record.ran||record.cancelled)return;record.ran=true;try{const value=callback(()=>record.cancelled===true);record.completed=true;record.complete(value);}catch(error){record.error=String(error);record.reject?.(error);}},'void',['pointer'],'win64');
 const type=new NativeCallback(()=>ptr(0),'pointer',['pointer'],'win64');
 const destroy=new NativeCallback((self,_heap)=>{setTimeout(()=>{record.objects.delete(self.toString());if(record.objects.size===0){if(!record.ran)record.reject?.(Error('E_TASK_REJECTED: native executor did not run callback'));tasks.delete(key);}},1000);},'void',['pointer','bool'],'win64');
 record.callbacks.push(clone,invoke,type,destroy);
 [clone,clone,invoke,type,destroy].forEach((p,i)=>vtable.add(i*8).writePointer(p));
 function64.add(0x38).writePointer(create());
 source.writePointer(record.sourceText);source.add(8).writePointer(record.sourceFunction);source.add(16).writeU32(1);source.add(24).writePointer(invoke);
 return new Promise((resolve,reject)=>{
  record.resolve=resolve;record.reject=reject;
  record.complete=value=>resolve(value);
  const failQueue=error=>{record.cancelled=true;record.error=String(error);const failure=Error(String(error));if(record.ran)failure.code='E_TASK_STARTED_UNKNOWN';reject(failure);};
  try{
   const mainContext=fn(0x45d10,'pointer',[])();if(mainContext.isNull())throw Error('E_MAIN_CONTEXT');
   fn(0x47310,'pointer',['pointer','pointer'])(mainContext,runner);if(runner.readPointer().isNull())throw Error('E_RUNNER');
   fn(0x311990,'pointer',['pointer','pointer','pointer','pointer','uint32'])(runner.readPointer(),job,source,function64,1);
   if(!function64.add(0x38).readPointer().isNull())throw Error('E_FUNCTION_NOT_TRANSFERRED');
  }catch(error){failQueue(error);}
  finally{
   let cleanupError=null;for(const p of [job,runner]){try{release(p);}catch(error){cleanupError??=error;}}
   if(cleanupError)failQueue(cleanupError);
  }
 });
}
function currentTask() {const p=pair();fn(0x4a40e0,'pointer',['pointer'])(p);if(p.readPointer().isNull())throw Error('E_NATIVE_TASK_SCOPE');return p;}
function inspect() {
 moduleVerified();for(const key of Object.keys(PREFIX))fn(parseInt(key,16),'void',[]);
 return {pid:Process.id,generation:binding?.generation??null,version:'4.2.0.11',dllSha256:VERIFIED_DLL_SHA256,self:binding?.self??null,accountVerified:binding!==null,ready:binding!==null&&!imageRuntimeBlocked,sendValidated,imageSendValidated,imageValidationAllowed,imageProloguesVerified:true,imageEntryRva:'0x2cc2350',chatId:binding?.chatId??null,sessionId:binding?.sessionId??null,displayName:binding?.displayName??null,prologuesVerified:true,pendingTasks:tasks.size,pendingCallbacks:callbacks.size,entryRva:'0x571fd20',dispatch:'Weixin native coroutine queue',foregroundRequired:false};
}
async function prepare(config) {
 if(binding||preparing)throw Error('E_ALREADY_BOUND');
 if(!config||config.pid!==Process.id||!isTargetId(config.chatId)||!isIndividualId(config.self)||config.sessionId!==config.chatId||typeof config.displayName!=='string'||!config.displayName.trim()||config.displayName.length>4096||/[\0\r\n]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(config.displayName)||config.chatId===config.displayName||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(config.generation??''))throw Error('E_BINDING_SCOPE');
 preparing=true;try{
 const proof=await queue(()=>{const task=currentTask();try{return {...lookup(config.chatId,config.displayName),taskState:task.readPointer().add(0x388).readU32(),nativeThreadId:Process.getCurrentThreadId()};}finally{release(task);}});
 if(proof.self!==config.self||proof.chatId!==config.chatId||!proof.displayNameMatches)throw Error('E_TARGET_IDENTITY');
 binding={pid:Process.id,generation:config.generation,self:config.self,chatId:config.chatId,sessionId:config.chatId,displayName:config.displayName,account:proof.account};
 // The host may reuse a recorded real send validation for this exact binary. Target/account proof is fresh for every prepare.
 sendValidated=config.validatedBinarySha256===VERIFIED_DLL_SHA256;
 textValidationAllowed=config.allowTextValidation===true&&config.chatId==='filehelper'&&!sendValidated;
 imageSendValidated=config.validatedImageBinarySha256===VERIFIED_DLL_SHA256;
 imageValidationAllowed=config.allowImageValidation===true&&config.chatId==='filehelper';
 return {...inspect(),identityProof:{username:proof.chatId,nicknameMatches:proof.nicknameMatches,remarkMatches:proof.remarkMatches,taskState:proof.taskState,nativeThreadId:proof.nativeThreadId}};
 }finally{preparing=false;}
}
