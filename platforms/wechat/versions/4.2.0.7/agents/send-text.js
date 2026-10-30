/** Boundary: one-shot native text submission and its callback ownership. No retries. */
function nativeSend(input,entry,isCancelled) {
 if(isCancelled())throw Error('E_TASK_CANCELLED');
 const strings=Memory.alloc(72),correlation=Memory.alloc(32),handle=Memory.alloc(8),object=Memory.alloc(24);
 strings.writeByteArray(new Uint8Array(72));strings.add(64).writeU8(1);
 const keep={strings,correlation,handle,object,code:[],constructed:0};callbacks.set(input.requestId,keep);
 const result=new Promise(resolve=>{keep.resolve=resolve;});
 function finish(status,resultMessage) {if(entry.status!=='executing'&&entry.status!=='unknown')return;clearTimeout(keep.timer);entry.status=status;entry.completedAt=new Date().toISOString();entry.receipt={requestId:input.requestId,status,chatId:binding.chatId,sessionId:binding.sessionId,native:true,deliveryConfirmed:false,...(resultMessage?{resultMessage}:{})};if(status==='accepted')sendValidated=true;keep.resolve(entry.receipt);}
 const invoke=new NativeCallback((_self,value)=>{
  try{const success=value.readU8()!==0;const hasMessage=value.add(0x28).readU8()!==0;finish(success?'accepted':'failed',hasMessage?text(value.add(8)):undefined);}catch(error){entry.error=String(error);finish('unknown');}
 },'void',['pointer','pointer'],'win64');
 const destroy=new NativeCallback(()=>{keep.destroyed=true;setTimeout(()=>callbacks.delete(input.requestId),1000);},'void',['pointer'],'win64');
 keep.code.push(invoke,destroy);object.writeByteArray(new Uint8Array(24));object.writeS32(1);object.add(8).writePointer(invoke);object.add(16).writePointer(destroy);handle.writePointer(object);
 const ctor=fn(0x88ad0,'pointer',['pointer','pointer']),dtor=fn(0x2010,'void',['pointer']);
 try{
  const sendFunction=fn(0x570db60,'void',['pointer','pointer','pointer','pointer']);
  ctor(strings,Memory.allocUtf8String(input.to));keep.constructed=1;
  ctor(strings.add(32),Memory.allocUtf8String(input.text));keep.constructed=2;
  ctor(correlation,Memory.allocUtf8String(input.requestId));keep.constructed=3;
  if(text(strings)!==input.to||text(strings.add(32))!==input.text)throw Error('E_STRING_ROUNDTRIP');
  // Native constructors release the JS lock. Recheck cancellation after all native preparation, immediately before entry.
  if(isCancelled())throw Error('E_TASK_CANCELLED');
  verifyBoundAccount();
  entry.nativeEntryCalled=true;
  keep.timer=setTimeout(()=>finish('unknown'),12000);
  sendFunction(ptr(0),strings,correlation,handle);
 }catch(error){entry.error=String(error);finish(entry.nativeEntryCalled?'unknown':'failed');}
 finally{
  if(keep.constructed>=3)dtor(correlation);if(keep.constructed>=2)dtor(strings.add(32));if(keep.constructed>=1)dtor(strings);
  // The native entry consumes this owner: it moves the handle on success, and releases it on error.
  // Once entered (including an exception of unknown outcome), never release its callback a second time.
  if(!entry.nativeEntryCalled&&!handle.readPointer().isNull()){fn(0x10dcd0,'void',['pointer'])(handle);handle.writePointer(ptr(0));}
 }
 return result;
}
async function sendText(input) {return await sendTextOperation(input);}
async function sendTextOperation(input,validation=false) {
 validateRequest(input,'text',validation);
 const entry={status:'executing',createdAt:new Date().toISOString(),nativeEntryCalled:false};requests.set(input.requestId,entry);
 try{
  const pending=await queue(isCancelled=>{
   const task=currentTask();
   try{const proof=lookup(binding.chatId,binding.displayName);if(isCancelled())throw Error('E_TASK_CANCELLED');if(proof.self!==binding.self||proof.chatId!==binding.chatId||!proof.displayNameMatches||proof.account!==binding.account)throw Error('E_ACCOUNT_OR_TARGET_CHANGED');return {promise:nativeSend(input,entry,isCancelled)};}finally{release(task);}
  });
  return await pending.promise;
 }catch(error){entry.error=String(error);entry.status=entry.nativeEntryCalled||error.code==='E_TASK_STARTED_UNKNOWN'?'unknown':'failed';return {requestId:input.requestId,status:entry.status,chatId:binding.chatId,sessionId:binding.sessionId,native:true,error:entry.error};}
}
// Engineering-only one-shot proof. Never registered as an AI/model tool.
// Enabling this flag is confined to filehelper and does not mark the binary validated.
async function validateText(input){
 if(!binding||binding.chatId!=='filehelper'||!textValidationAllowed||textValidationUsed||sendValidated)throw Error('E_TEXT_VALIDATION_SCOPE');
 if(!input||Object.keys(input).some(key=>key!=='requestId')||!/^wxcc42-text-validation-[a-f0-9]{32}$/.test(input.requestId??''))throw Error('E_TEXT_VALIDATION_REQUEST');
 textValidationUsed=true;
 return await sendTextOperation({to:'filehelper',text:'WXccPlus 4.2.0.7 兼容性验证',requestId:input.requestId},true);
}
