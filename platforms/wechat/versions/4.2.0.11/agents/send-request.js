/** Boundary: independent 4.2.0.11 static ABI adaptation; live validation pending. */
/** Boundary: request/target checks shared by independently assembled text and image adapters. */
function validateRequest(input,kind='text',validation=false) {
 if(!binding||input?.to!==binding.chatId)throw Error('E_CHAT_SCOPE');
 requireSendIdle();
 if(!sendValidated&&!(validation===true&&textValidationAllowed&&binding.chatId==='filehelper'))throw Error('E_SEND_BINARY_UNVERIFIED');
 if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.requestId)||input.requestId!==input.requestId.toLowerCase())throw Error('E_REQUEST_ID');
 if(kind==='image'){
  if(!imageSendValidated&&!(imageValidationAllowed&&binding.chatId==='filehelper'))throw Error('E_IMAGE_BINARY_UNVERIFIED');
  if(typeof input.imageResource!=='string'||!/^wxcc-image-[a-f0-9-]{36}$/.test(input.imageResource)||!/^[a-f0-9]{64}$/.test(input.imageSha256??''))throw Error('E_IMAGE_PATH');
  const resource=imageResources.get(input.imageResource);if(!resource||resource.sha256!==input.imageSha256||resource.used)throw Error('E_IMAGE_RESOURCE');
 }else{
  const content=input.text;
  if(typeof content!=='string'||!content.trim()||content.includes('\0')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(content)||unescape(encodeURIComponent(content)).length>1024)throw Error('E_TEXT');
 }
 if(requests.has(input.requestId))throw Error('E_REQUEST_DUPLICATE');
 if(requests.size>=10000)throw Error('E_REQUEST_LIMIT');
}
