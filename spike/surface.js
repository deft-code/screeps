// Static surface analysis for the TCreep migration (TypeScript compiler API).
// Run: node spike/surface.js [--json]
//
// Answers four questions the design in docs/tcreep-design.md depends on:
//   1. which `this.X` members the legacy creep code uses and which of those are raw
//      Creep API (they need forwarders on TCreep);
//   2. which member names collide between the wrapper classes and the mixin chain;
//   3. which `this.X` references are already dangling today;
//   4. per live role, the transitive set of files reached through `this.X` calls.
// Re-run after each conversion step; "unresolved" must stay empty.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const SRC = path.join(__dirname, '..', 'src');
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8');
const ls = re => fs.readdirSync(SRC).filter(f => re.test(f)).sort();

// Raw game API on Creep (from @types/screeps) + RoomObject.
const CREEP_API = new Set(('attack attackController body build cancelOrder carry carryCapacity claimController ' +
  'dismantle drop fatigue generateSafeMode getActiveBodyparts harvest heal hits hitsMax id memory move moveByPath ' +
  'moveTo my name notifyWhenAttacked owner pickup pull rangedAttack rangedHeal rangedMassAttack repair ' +
  'reserveController room say saying signController spawning store suicide ticksToLive transfer upgradeController ' +
  'withdraw pos effects').split(' '));
// Infrastructure that stays on the game prototypes (cache.ts, debug.ts, roomobj.ts).
const INFRA = new Set('tick cache log dlog errlog warn debug toString effectTTL effectLvl constructor'.split(' '));

const mainjs = read('main.js');
const mods = [...mainjs.match(/const mods = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1] + '.js');
const chain = ['creep.ts', 'creep.role.ts', 'creep.move.ts', 'creep.carry.ts', 'creep.harvest.ts', 'creep.build.ts', 'creep.repair.ts'];
const tsroles = ls(/^role\..*\.ts$/);
const wrapper = ['mycreep.ts', 'job.creep.ts', 'job.role.ts', ...ls(/^job\..*\.ts$/).filter(f => !['job.creep.ts', 'job.role.ts'].includes(f))];
const LIVE = {
  startup: ['role.bootstrap.js'], reboot: ['role.reboot.js', 'role.bootstrap.js'], worker: ['role.worker.js'],
  ctrl: ['role.ctrl.js'], hauler: ['role.hauler.js'], hub: ['role.hub.ts'], asrc: ['role.src.ts'], bsrc: ['role.src.ts'],
  farmer: ['job.farmer.ts'],
};

function parse(f) {
  const kind = f.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  return ts.createSourceFile(f, read(f), ts.ScriptTarget.ES2019, true, kind);
}
// Class members (methods, accessors, fields) declared in the file, with the class name.
function defs(sf) {
  const out = new Map();
  const visit = node => {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const cls = node.name ? node.name.text : '<anon>';
      for (const m of node.members) {
        if (!m.name || ts.isConstructorDeclaration(m)) continue;
        const name = m.name.text;
        if (!name) continue;
        const kind = ts.isGetAccessor(m) ? 'get' : ts.isSetAccessor(m) ? 'set' : ts.isPropertyDeclaration(m) ? 'field' : 'method';
        out.set(name, { kind, cls });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}
// `this.X` member accesses anywhere in the file.
function uses(sf) {
  const out = new Map();
  const visit = node => {
    if (ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const k = node.name.text;
      out.set(k, (out.get(k) || 0) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const files = [...chain, ...tsroles, ...mods, ...wrapper];
const D = {}, U = {};
for (const f of files) { const sf = parse(f); D[f] = defs(sf); U[f] = uses(sf); }

const union = names => { const s = new Set(); for (const f of names) for (const k of D[f].keys()) s.add(k); return s; };
const chainDefs = union(chain), tsroleDefs = union(tsroles), modDefs = union(mods), wrapperDefs = union(wrapper);
const legacyDefs = new Set([...chainDefs, ...tsroleDefs, ...modDefs]);
const definers = name => files.filter(f => D[f].has(name));
const legacyFiles = [...chain, ...tsroles, ...mods];

// 1. Forwarders: raw API members reached through `this.` by legacy creep code.
const forwarders = new Map();
for (const f of legacyFiles) for (const [k, n] of U[f]) if (CREEP_API.has(k)) forwarders.set(k, (forwarders.get(k) || 0) + n);

// 2. Dangling: `this.X` in legacy code that nothing defines (already broken today).
const dangling = [];
for (const f of legacyFiles) for (const k of U[f].keys()) {
  if (CREEP_API.has(k) || INFRA.has(k) || legacyDefs.has(k) || wrapperDefs.has(k)) continue;
  dangling.push(`${f}: this.${k}`);
}

// 3. Collisions.
const fmt = k => `${k}: ` + definers(k).map(f => `${f}[${D[f].get(k).cls}.${D[f].get(k).kind}]`).join(', ');
const wrapperVsLegacy = [...wrapperDefs].filter(k => legacyDefs.has(k) && !INFRA.has(k)).map(fmt);
const modVsTs = [...modDefs].filter(k => chainDefs.has(k) || tsroleDefs.has(k)).map(fmt);
const multiMod = [...modDefs].filter(k => mods.filter(f => D[f].has(k)).length > 1).map(fmt);
const tsVsTs = [...new Set([...chainDefs, ...tsroleDefs])].filter(k => [...chain, ...tsroles].filter(f => D[f].has(k)).length > 1).map(fmt);

// 4. Live roles: transitive closure of legacy files reached through `this.X` calls.
function closure(start) {
  const seen = new Set(start), queue = [...start], members = new Set();
  while (queue.length) {
    const f = queue.shift();
    for (const k of U[f].keys()) {
      members.add(k);
      for (const g of definers(k)) if (!seen.has(g) && !wrapper.includes(g)) { seen.add(g); queue.push(g); }
    }
  }
  const unresolved = [...members].filter(k => !CREEP_API.has(k) && !INFRA.has(k) && !legacyDefs.has(k) && !wrapperDefs.has(k));
  return { files: [...seen], members: members.size, api: [...members].filter(k => CREEP_API.has(k)).length, unresolved };
}

const report = {
  counts: {
    mods: mods.length, chainFiles: chain.length, tsRoleFiles: tsroles.length, wrapperFiles: wrapper.length,
    distinctThisMembers: new Set(legacyFiles.flatMap(f => [...U[f].keys()])).size,
    chainDefs: chainDefs.size, tsRoleDefs: tsroleDefs.size, modDefs: modDefs.size, wrapperDefs: wrapperDefs.size,
    rawApiUsed: forwarders.size,
  },
  forwarders: [...forwarders].sort((a, b) => b[1] - a[1]),
  apiNotUsed: [...CREEP_API].filter(k => !forwarders.has(k)),
  collisions: { wrapperVsLegacy, modVsTs, multiMod, tsVsTs },
  dangling,
  live: Object.fromEntries(Object.entries(LIVE).map(([role, fs]) => [role, closure(fs)])),
};

if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
const p = (t, v) => console.log(`\n== ${t} ==\n${Array.isArray(v) ? (v.length ? v.join('\n') : '(none)') : JSON.stringify(v, null, 1)}`);
p('counts', report.counts);
p(`forwarders needed (${report.forwarders.length} raw Creep API members reached via this.)`, report.forwarders.map(([k, n]) => `${k} x${n}`));
p('Creep API members never used via this.', report.apiNotUsed);
p('collisions: wrapper classes vs legacy chain/mods', report.collisions.wrapperVsLegacy);
p('collisions: JS mods vs TS chain/roles (JS wins today)', report.collisions.modVsTs);
p('collisions: same name in several JS mods (last in mods[] wins)', report.collisions.multiMod);
p('collisions: same name in several TS chain/role files', report.collisions.tsVsTs);
p('dangling this.X in legacy code (already undefined today)', report.dangling);
for (const [role, c] of Object.entries(report.live)) {
  p(`live role ${role}: ${c.files.length} files, ${c.members} members (${c.api} raw API); unresolved: ${c.unresolved.join(', ') || 'none'}`, c.files);
}
