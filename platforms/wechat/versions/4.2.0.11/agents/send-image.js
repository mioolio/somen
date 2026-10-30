/** Boundary: independent 4.2.0.11 static ABI adaptation; live validation pending. */
/** Boundary: image resource preparation and native image submission. Not sticker sending. */
// The native business entry accepts a resource key and resolves it into the app's
// HttpResource cache. It does not accept an ordinary local file path.
async function prepareImage(input){
 if(!binding||input?.to!==binding.chatId)throw Error('E_CHAT_SCOPE');
 requireSendIdle();
 if(!sendValidated||(!imageSendValidated&&!(imageValidationAllowed&&binding.chatId==='filehelper')))throw Error('E_IMAGE_BINARY_UNVERIFIED');
 if(!/^wxcc-image-[a-f0-9-]{36}$/.test(input.imageResource??'')||!/^[a-f0-9]{64}$/.test(input.imageSha256??'')||imageResources.has(input.imageResource)||imageResources.size>=1000)throw Error('E_IMAGE_RESOURCE');
 return await queue(isCancelled=>{
  const task=currentTask(),resource=Memory.alloc(32),empty=Memory.alloc(32),result=Memory.alloc(32);let constructed=0,returned=false;
  try{
   const proof=lookup(binding.chatId,binding.displayName);if(isCancelled())throw Error('E_TASK_CANCELLED');if(proof.self!==binding.self||proof.chatId!==binding.chatId||!proof.displayNameMatches||proof.account!==binding.account)throw Error('E_ACCOUNT_OR_TARGET_CHANGED');
   const ctor=fn(0x88ad0,'pointer',['pointer','pointer']);ctor(resource,Memory.allocUtf8String(input.imageResource));constructed=1;ctor(empty,Memory.allocUtf8String(''));constructed=2;
   if(isCancelled())throw Error('E_TASK_CANCELLED');verifyBoundAccount();
   fn(0xa55060,'pointer',['pointer','pointer','pointer'])(result,resource,empty);returned=true;
   const length=result.add(16).readU64().toNumber(),capacity=result.add(24).readU64().toNumber();
   if(!Number.isSafeInteger(length)||length<1||length>32767||!Number.isSafeInteger(capacity)||capacity<length||capacity>65536)throw Error('E_IMAGE_CACHE_PATH');
   const cachePath=(capacity<8?result:result.readPointer()).readUtf16String(length);
   if(typeof cachePath!=='string'||cachePath.includes('\0')||!/^[A-Za-z]:[\\/].*[\\/]HttpResource[\\/][a-f0-9]{32,64}$/i.test(cachePath)||cachePath.split(/[\\/]/).includes('..'))throw Error('E_IMAGE_CACHE_PATH');
   verifyBoundAccount();imageResources.set(input.imageResource,{sha256:input.imageSha256,used:false});
   return {pid:Process.id,generation:binding.generation,self:binding.self,chatId:binding.chatId,imageResource:input.imageResource,imageSha256:input.imageSha256,cachePath,automaticMessagesSent:0};
  }finally{
   let cleanupError=null;
   for(const [needed,rva,p] of [[returned,0x7a60,result],[constructed>=2,0x2010,empty],[constructed>=1,0x2010,resource]]){if(needed)try{fn(rva,'void',['pointer'])(p);}catch(error){cleanupError??=error;}}
   try{release(task);}catch(error){cleanupError??=error;}if(cleanupError){imageRuntimeBlocked=true;throw cleanupError;}
  }
 });
}
// Static call chain: native dispatcher 0x57149d0 -> image business 0x2cc2350 ->
// native image factory 0x1daeb20 -> MessageManager 0x17cf150. The entry owns no
// incoming pointers. Its 0x40-byte result owns only the std::string at +0x20; +0x10 is new metadata.
// Initial send-stage acceptance does not establish server delivery.
function nativeSendImage(input,entry,isCancelled){
 const recipient=Memory.alloc(32),path=Memory.alloc(32),result=Memory.alloc(0x40);
 result.writeByteArray(new Uint8Array(0x40));
 const keep={recipient,path,result,constructed:0};entry.keep=keep;
 const ctor=fn(0x88ad0,'pointer',['pointer','pointer']),dtor=fn(0x2010,'void',['pointer']);
 let resultReturned=false,receipt;
 try{
  const imageSend=fn(0x2cc2350,'pointer',['pointer','pointer','pointer','pointer']);
  ctor(recipient,Memory.allocUtf8String(input.to));keep.constructed=1;
  ctor(path,Memory.allocUtf8String(input.imageResource));keep.constructed=2;
  if(text(recipient)!==input.to||text(path)!==input.imageResource)throw Error('E_STRING_ROUNDTRIP');
  if(isCancelled())throw Error('E_TASK_CANCELLED');
  verifyBoundAccount();
  entry.nativeEntryCalled=true;
  imageSend(ptr(0),result,recipient,path);resultReturned=true;
  const accepted=result.readU8()===1;
  const resultMessage=text(result.add(0x20));
  receipt={requestId:input.requestId,status:accepted?'accepted':'failed',type:'image',chatId:binding.chatId,sessionId:binding.sessionId,native:true,nativeEntryCalled:true,entryRva:'0x2cc2350',deliveryConfirmed:false,...(accepted?{localId:result.add(8).readU64().toString(),createTime:result.add(0x18).readU64().toString(),extraNativeId:result.add(0x10).readU64().toString()}:{}),...(resultMessage?{resultMessage}:{})};
  if(accepted)imageSendValidated=true;
 }catch(error){
  entry.error=String(error);if(entry.nativeEntryCalled)imageRuntimeBlocked=true;
  receipt={requestId:input.requestId,status:entry.nativeEntryCalled?'unknown':'failed',type:'image',chatId:binding.chatId,sessionId:binding.sessionId,native:true,nativeEntryCalled:entry.nativeEntryCalled,deliveryConfirmed:false,error:entry.error};
 }finally{
  // Only a normal returned result has an established live string object.
  for(const [needed,p] of [[resultReturned,result.add(0x20)],[keep.constructed>=2,path],[keep.constructed>=1,recipient]]){if(needed)try{dtor(p);}catch(error){imageRuntimeBlocked=true;entry.error=String(error);receipt={...receipt,status:entry.nativeEntryCalled?'unknown':'failed',error:entry.error};}}
  if(!imageRuntimeBlocked)delete entry.keep;
 }
 entry.status=receipt.status;entry.completedAt=new Date().toISOString();entry.receipt=receipt;
 return receipt;
}
async function sendImage(input){
 validateRequest(input,'image');
 imageResources.get(input.imageResource).used=true;
 const entry={status:'executing',createdAt:new Date().toISOString(),nativeEntryCalled:false};requests.set(input.requestId,entry);
 try{return await queue(isCancelled=>{const task=currentTask();try{const proof=lookup(binding.chatId,binding.displayName);if(isCancelled())throw Error('E_TASK_CANCELLED');if(proof.self!==binding.self||proof.chatId!==binding.chatId||!proof.displayNameMatches||proof.account!==binding.account)throw Error('E_ACCOUNT_OR_TARGET_CHANGED');return nativeSendImage(input,entry,isCancelled);}finally{release(task);}});}
 catch(error){entry.error=String(error);entry.status=entry.nativeEntryCalled||error.code==='E_TASK_STARTED_UNKNOWN'?'unknown':'failed';if(entry.status==='unknown')imageRuntimeBlocked=true;return {requestId:input.requestId,status:entry.status,type:'image',chatId:binding.chatId,sessionId:binding.sessionId,native:true,error:entry.error};}
}
