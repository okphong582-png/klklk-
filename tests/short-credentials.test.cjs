const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const credentials=require('../credentials.cjs');
test('new key and password are independent 16-character unambiguous random values with unchanged pair framing',async()=>{
 const pairs=new Set();
 for(let i=0;i<1000;i++){
  const c=credentials.generate();assert.match(c.key,/^[A-HJ-NP-Z2-9]{16}$/);assert.match(c.password,/^[A-HJ-NP-Z2-9]{16}$/);assert.notEqual(c.key,c.password);
  const frame='mizze-pair-v1\n16:'+c.key+'\n16:'+c.password;
  assert.equal(await credentials.hash(c.key,c.password),crypto.createHash('sha256').update(frame).digest('hex'));
  pairs.add(c.key+':'+c.password);
 }
 assert.equal(pairs.size,1000);
 assert.doesNotThrow(()=>credentials.normalize('MZ10-LEGACY-KEY-123456','Legacy-password-0123456789'));
 assert.throws(()=>credentials.normalize('ABCD2345','WXYZ678'));
});
