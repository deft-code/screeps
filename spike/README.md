# TCreep spike (compile-only)

Prototype for [docs/tcreep-design.md](../docs/tcreep-design.md). Nothing in
`src/` imports these files and the gulp tasks never compile or upload them.

```
npx tsc -p tsconfig.spike.json      # type-checks src/ + spike/ together, no output
node spike/surface.js               # member-surface / collision / dangling-reference report
```

| file | what it proves |
|---|---|
| `tobj.ts` | generic wrapper base (`TObj`), `Registry`, `RetireDaemon` sweep |
| `tcreep.ts` | name-keyed creep wrapper, `Pick<Creep,...>` declaration merge + runtime forwarders, tombstone lookup, retirement policy |
| `tstruct.ts` | id-keyed structure wrapper, per-tick claims, position-keyed memory, `@registerStruct` |
| `t.creep.ts` | `src/creep.ts` as plain functions plus a `CreepStats` wrapper view |
| `t.creep.role/move/carry/harvest/build/repair.ts` | the live mixin chain re-rooted at `TCreep` with the mechanical edits only |
| `t.mycreep.ts` | the fat `MyCreep`: registry, Task2 lifecycle, `walk*` movement, legacy JS mixins merged onto the wrapper prototype |
| `t.hub.ts` | one converted role (`role.hub.ts` + `job.hub.ts` as a single class) |

The `t.` prefix exists only so the copies can live next to the originals; the
real migration keeps the original module names.
