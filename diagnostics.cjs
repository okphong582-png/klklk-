'use strict';
// Never emit raw exception text, request URLs, stack traces or credential data.
function category(error){
 const code=error?.code,message=String(error?.message||'');
 if(Number.isInteger(code)&&code>=100&&code<=599)return 'telegram_http_'+code;
 if(code==='network'||code==='invalid_response')return 'telegram_'+code;
 if(/index not defined|no index defined/i.test(message))return 'firebase_index_missing';
 if(/permission|denied/i.test(String(code)+' '+message))return 'storage_permission_denied';
 if(/invalid_day|invalid time value/i.test(message))return 'report_date_invalid';
 if(/timeout|timed.out|deadline/i.test(String(code)+' '+message))return 'timeout';
 if(/network|disconnected|unavailable|econnreset|enotfound/i.test(String(code)+' '+message))return 'network_or_storage_unavailable';
 return 'operation_failed';
}
function logFailure(stage,error,attempt=1,logger=process.stderr){
 const known=new Set(['lease.renew','reports.background','telegram.poll','telegram.update','storage.offset','startup']);
 const transports=new Set(['UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_SOCKET','ETIMEDOUT','ECONNRESET','ENOTFOUND','AbortError','TimeoutError']);
 logger.write(JSON.stringify({event:'bot.retry',stage:known.has(stage)?stage:'operation',category:category(error),...(transports.has(error?.transport)?{transport:error.transport}:{}),attempt})+'\n');
}
module.exports={category,logFailure};
