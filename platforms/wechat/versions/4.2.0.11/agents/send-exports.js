/** Boundary: independent 4.2.0.11 static ABI adaptation; live validation pending. */
/** Boundary: closed RPC surface for the single-target send agent. */
rpc.exports={inspect,prepare,sendText,prepareImage,sendImage,requestStatus(id){const result=requests.get(id);return result?{requestId:id,status:result.status,createdAt:result.createdAt,...(result.completedAt?{completedAt:result.completedAt}:{}),...(result.receipt?{receipt:result.receipt}:{})}:null;}};
