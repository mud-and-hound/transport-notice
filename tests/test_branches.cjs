const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../docs/js/app.js'), 'utf8');
const storage = new Map();
const context = vm.createContext({
  console, Date, Intl, window: { matchMedia: () => ({}) },
  localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
});
vm.runInContext(source.replace(/init\(\);\s*$/, ''), context);
vm.runInContext(`
  S.branches = [{ brand: 'TEST', shop_id: '0004', code: '0004', name: 'PG-Test', alternate_name: 'สาขาทดสอบ' }];
  indexBranches();
`, context);
for (const term of ['0004', '4', 'PG', 'Test', 'สาขาทดสอบ']) {
  assert.ok(vm.runInContext(`scoreBranch(S.branches[0], [${JSON.stringify(term.toLowerCase())}])`, context) > 0, term);
}
assert.equal(vm.runInContext('scoreBranch(S.branches[0], ["missing"])', context), 0);
storage.set('tn.recent', JSON.stringify([
  { brand: 'TEST', shop_id: '0004', code: 'OLD', name: 'Old name' },
  { brand: 'REMOVED', shop_id: '1234', code: 'MISSING', name: 'Inactive branch' },
]));
assert.equal(vm.runInContext('recentBranches().length', context), 1);
assert.equal(vm.runInContext('recentBranches()[0].code', context), '0004');
storage.set('tn.sender', JSON.stringify({from_name:'ผู้ส่ง', from_brand:'TEST', from_shop_id:'0004', from_branch_code:'OLD'}));
assert.equal(vm.runInContext('blankRow().from_branch_code', context), '0004');
storage.set('tn.sender', JSON.stringify({from_name:'ผู้ส่ง', from_brand:'REMOVED', from_shop_id:'1234', from_branch_code:'OLD'}));
assert.equal(vm.runInContext('blankRow().from_branch_code', context), '');
assert.equal(vm.runInContext('blankRow().from_name', context), 'ผู้ส่ง');
vm.runInContext('delete S.branches[0].alternate_name; indexBranches();', context);
assert.equal(vm.runInContext('scoreBranch(S.branches[0], ["missing"])', context), 0);
console.log('Branch number/name/alternate-name search and current-master recent selections passed');
