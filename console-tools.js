// Shell access to the Screeps console for the gulp tasks `console`,
// `consoleTail` and `consoleLog` (see gulpfile.js and CLAUDE.md).
//
// Screeps only streams console output live over a websocket (there is no
// history API), so every task here connects a socket, subscribes to the user
// console channel and formats the lines it receives:
//   - compiled locations (`process:60:50`, `job.hub:12#run`) are mapped back to
//     `src/*.ts` with the sourcemaps that `gulp compile` writes to sourcemaps/
//   - the HTML the game console emits (room links, colours) is stripped
// Set SCREEPS_CONSOLE_RAW=1 to skip both and see exactly what the server sent.

'use strict'

const fs = require('fs')
const path = require('path')
const { ScreepsHttpClient } = require('screeps-api')
const { SourceMapConsumer } = require('source-map')

const ROOT = __dirname

// ---------------------------------------------------------------------------
// World / shard selection and client construction

const WORLDS = {
  season: { server: { season: true }, shard: 'shardSeason' },
  ptr: { server: { ptr: true }, shard: 'shard0' },
  mmo: { server: {}, shard: 'shard2' },
}

function envInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n)) throw new Error(`${name} must be an integer, got "${raw}"`)
  return n
}

function worldFromEnv() {
  const world = process.env.SCREEPS_WORLD || 'season'
  if (!WORLDS[world]) {
    throw new Error(`SCREEPS_WORLD must be one of ${Object.keys(WORLDS).join(', ')}; got "${world}"`)
  }
  return world
}

function shardFor(world) {
  return process.env.SCREEPS_SHARD || WORLDS[world].shard
}

function makeClient(credentials, world) {
  if (!credentials || !credentials.token) {
    throw new Error('credentials.js needs a `token` (screeps.com -> Account -> Auth tokens); password auth is not accepted by the official servers')
  }
  const api = new ScreepsHttpClient(Object.assign(
    { hostname: 'screeps.com', secure: true, token: credentials.token },
    WORLDS[world].server,
  ))
  api.appConfig.defaultShard = shardFor(world)
  // A tail should survive long outages; the backoff caps at wsReconnectMaxDelay (60s).
  api.appConfig.wsReconnectMaxRetries = 1e9
  return api
}

// ---------------------------------------------------------------------------
// Source location translation

// Tokens look like `module:line` optionally followed by `:col`. Stack traces
// from the game use `module:line:col`; debug.ts `location()` uses
// `module:line#func`. Module names may contain dots (job.hub, creep.move).
const LOCATION_RE = /(?<![\w./-])([A-Za-z_][\w.-]*):(\d+)(?::(\d+))?(?!\d)/g

const consumers = new Map() // module name -> Promise<SourceMapConsumer|null>

function consumerFor(mod) {
  if (!consumers.has(mod)) {
    const mapFile = path.join(ROOT, 'sourcemaps', `${mod}.js.map`)
    let pending
    if (!fs.existsSync(mapFile)) {
      pending = Promise.resolve(null)
    } else {
      pending = Promise.resolve()
        .then(() => new SourceMapConsumer(JSON.parse(fs.readFileSync(mapFile, 'utf8'))))
        .catch(() => null)
    }
    consumers.set(mod, pending)
  }
  return consumers.get(mod)
}

function cleanSource(source) {
  // gulp-sourcemaps records sources relative to sourcemaps/, e.g. "../src/process.ts"
  return source.replace(/^(\.\.\/)+/, '').replace(/\\/g, '/')
}

// Translate one compiled token. `col` is 1-based as printed by V8 or undefined.
async function translateToken(mod, line, col) {
  const consumer = await consumerFor(mod)
  if (!consumer) return null
  let pos
  if (col !== undefined) {
    pos = consumer.originalPositionFor({ line, column: col - 1 })
    if (pos.source == null) {
      pos = consumer.originalPositionFor({ line, column: col - 1, bias: SourceMapConsumer.LEAST_UPPER_BOUND })
    }
  } else {
    pos = consumer.originalPositionFor({ line, column: 0, bias: SourceMapConsumer.LEAST_UPPER_BOUND })
  }
  if (pos.source == null) return null
  const where = `${cleanSource(pos.source)}:${pos.line}`
  return col !== undefined ? `${where}:${pos.column + 1}` : where
}

// Rewrite every compiled location in `text` that has a sourcemap.
async function decodeLocations(text) {
  const matches = [...text.matchAll(LOCATION_RE)]
  if (matches.length === 0) return text
  const replacements = new Map()
  await Promise.all(matches.map(async (m) => {
    const [token, mod, lineStr, colStr] = m
    if (replacements.has(token)) return
    replacements.set(token, null)
    const translated = await translateToken(mod, parseInt(lineStr, 10), colStr === undefined ? undefined : parseInt(colStr, 10))
    if (translated) replacements.set(token, translated)
  }))
  return text.replace(LOCATION_RE, (token) => replacements.get(token) || token)
}

function destroyConsumers() {
  const pending = [...consumers.values()]
  consumers.clear()
  return Promise.all(pending.map(p => p.then(c => c && c.destroy()).catch(() => {})))
}

// ---------------------------------------------------------------------------
// Line formatting

const HTML_TAG_RE = /<\/?(a|span|font|b|i|u|br|div|p|pre|code|strong|em|small|hr)\b[^>]*>/gi

function stripHtml(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(HTML_TAG_RE, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
}

const raw = () => process.env.SCREEPS_CONSOLE_RAW === '1'

async function formatText(text) {
  if (raw()) return text
  return decodeLocations(stripHtml(String(text)))
}

function stamp(date = new Date()) {
  return date.toTimeString().slice(0, 8)
}

// Turn one websocket console event into printable lines.
// Returns [{kind: 'log'|'result'|'error', text}] already formatted.
async function eventLines(data) {
  const out = []
  if (data.error) out.push({ kind: 'error', text: `ERROR: ${await formatText(data.error)}` })
  if (data.messages) {
    for (const l of data.messages.log || []) out.push({ kind: 'log', text: await formatText(l) })
    for (const r of data.messages.results || []) out.push({ kind: 'result', text: `< ${await formatText(r)}` })
  }
  return out
}

// ---------------------------------------------------------------------------
// Rotating log file: logs/console-<world>.log, rotated to .1.log ... .<keep>.log

class RotatingLog {
  constructor(file, { maxBytes, keep }) {
    this.file = file
    this.maxBytes = maxBytes
    this.keep = keep
    fs.mkdirSync(path.dirname(file), { recursive: true })
    this.size = fs.existsSync(file) ? fs.statSync(file).size : 0
    this.lines = 0
  }

  rotatedName(i) {
    const ext = path.extname(this.file)
    return this.file.slice(0, -ext.length) + `.${i}` + ext
  }

  rotate() {
    if (this.keep <= 0) {
      fs.rmSync(this.file, { force: true })
    } else {
      fs.rmSync(this.rotatedName(this.keep), { force: true })
      for (let i = this.keep - 1; i >= 1; i--) {
        const from = this.rotatedName(i)
        if (fs.existsSync(from)) fs.renameSync(from, this.rotatedName(i + 1))
      }
      if (fs.existsSync(this.file)) fs.renameSync(this.file, this.rotatedName(1))
    }
    this.size = 0
  }

  write(line) {
    const data = line + '\n'
    const bytes = Buffer.byteLength(data)
    if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate()
    fs.appendFileSync(this.file, data)
    this.size += bytes
    this.lines++
  }
}

function openLog(world) {
  return new RotatingLog(path.join(ROOT, 'logs', `console-${world}.log`), {
    maxBytes: envInt('SCREEPS_LOG_MAX_BYTES', 5 * 1024 * 1024),
    keep: envInt('SCREEPS_LOG_KEEP', 5),
  })
}

// ---------------------------------------------------------------------------
// Task bodies

// Stream the console to stdout and the rotating log until SIGINT or `seconds`.
async function tail(credentials, { seconds = 0 } = {}) {
  const world = worldFromEnv()
  const shardFilter = process.env.SCREEPS_SHARD // only filter when the caller asked for one
  const api = makeClient(credentials, world)
  const log = openLog(world)

  let stopping = false
  let chain = Promise.resolve()
  const emit = (line) => {
    console.log(line)
    log.write(line)
  }
  // Format serially so lines keep their arrival order despite async sourcemap lookups.
  const queue = (fn) => { chain = chain.then(fn).catch(err => emit(`${stamp()} # formatter error: ${err && err.message}`)) }

  const note = (text) => emit(`${stamp()} # ${text}`)

  // Awaited so a bad token fails here with a clear error; the subscription itself is
  // queued until the socket has authenticated.
  await api.socket.subscribeUserConsole(({ data }) => {
    if (shardFilter && data.shard && data.shard !== shardFilter) return
    const tag = data.shard ? `[${data.shard}] ` : ''
    const at = stamp()
    queue(async () => {
      for (const { text } of await eventLines(data)) emit(`${at} ${tag}${text}`)
    })
  })
  api.socket.on('disconnected', () => { if (!stopping) note('websocket disconnected, reconnecting...') })
  api.socket.on('connected', () => { if (log.lines > 1) note('websocket connected') })
  api.socket.on('error', (err) => { if (!stopping) note(`websocket error: ${err && err.message}`) })

  await api.socket.connect()
  emit(`# ---- ${new Date().toISOString()} tail started world=${world}${shardFilter ? ` shard=${shardFilter}` : ''}${seconds ? ` for ${seconds}s` : ''} ----`)
  console.log(`# Streaming to ${path.relative(ROOT, log.file)}; ${seconds ? `stopping after ${seconds}s` : 'Ctrl+C to stop'}`)

  await new Promise((resolve) => {
    const stop = () => {
      if (stopping) return
      stopping = true
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
      chain.then(() => {
        api.socket.disconnect()
        note(`tail stopped, ${log.lines} lines in ${path.relative(ROOT, log.file)}`)
        return destroyConsumers()
      }).then(resolve, resolve)
      // Fallback in case a lingering handle keeps the event loop alive.
      setTimeout(() => process.exit(process.exitCode || 0), 1500).unref()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    if (seconds > 0) setTimeout(stop, seconds * 1000)
  })
}

// Send one expression and print the console output of the tick that answers it.
async function runCommand(credentials, expression, { timeoutMs = 30000, graceMs = 500 } = {}) {
  const world = worldFromEnv()
  const shard = shardFor(world)
  const api = makeClient(credentials, world)

  let sent = false
  let finish
  const finished = new Promise((resolve) => { finish = resolve })
  let chain = Promise.resolve()
  let printed = 0

  await api.socket.subscribeUserConsole(({ data }) => {
    if (data.shard && data.shard !== shard) return
    if (!sent) return // output from ticks before our expression was queued
    const hasResult = !!(data.messages && data.messages.results && data.messages.results.length)
    if (!printed && !hasResult) return // a tick that ran before the expression executed
    chain = chain.then(async () => {
      for (const { text } of await eventLines(data)) {
        console.log(text)
        printed++
      }
      if (hasResult) setTimeout(() => finish('ok'), graceMs)
    })
  })

  await api.socket.connect()
  const timer = setTimeout(() => finish('timeout'), timeoutMs)
  try {
    console.log(`> ${expression}`)
    sent = true
    await api.userConsole(expression, shard)
    const outcome = await finished
    await chain
    if (outcome === 'timeout') {
      console.error(`# no result within ${timeoutMs / 1000}s (world=${world} shard=${shard}); is the script running on that shard?`)
      process.exitCode = 1
    }
  } finally {
    clearTimeout(timer)
    api.socket.disconnect()
    await destroyConsumers()
    setTimeout(() => process.exit(process.exitCode || 0), 1500).unref()
  }
}

// `--cmd <expr>` from argv, else the whole of stdin when it is piped.
function expressionFromArgs(argv = process.argv) {
  const i = argv.indexOf('--cmd')
  if (i !== -1 && argv[i + 1] !== undefined) return argv[i + 1]
  if (!process.stdin.isTTY) {
    try {
      const text = fs.readFileSync(0, 'utf8').trim()
      if (text) return text
    } catch (err) { /* no stdin available */ }
  }
  return undefined
}

module.exports = {
  WORLDS,
  worldFromEnv,
  shardFor,
  makeClient,
  decodeLocations,
  destroyConsumers,
  stripHtml,
  formatText,
  RotatingLog,
  openLog,
  tail,
  runCommand,
  expressionFromArgs,
  envInt,
}
