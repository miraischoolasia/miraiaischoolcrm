// Local test environment: a throwaway Supabase on this computer, filled with FAKE data.
//   node local-test/run.mjs start                    start the database (applies every migration the first time)
//   node local-test/run.mjs reset [mirai|eduhero]    wipe it, re-run every migration, add the fake data (default: mirai)
//   node local-test/run.mjs school [mirai|eduhero]   only switch the school settings, without wiping
//   node local-test/run.mjs crm [mirai|eduhero]      start the CRM (vite, port 5180) against it, in that school's look
//   node local-test/run.mjs student                  start the student app (Expo web, port 8185) against it
//   node local-test/run.mjs dbtests                 every supabase/tests/*.sql: on an empty database, and the ones marked "-- needs: fake-data" on the fake data (they roll back); then run "reset" to start fresh
//   node local-test/run.mjs stop                     stop everything (the data is kept)
//   node local-test/run.mjs status                   every slot that runs: whose it is, for how long (at most 2 at once; a third is refused)
//   node local-test/run.mjs status --slot N          the same, plus that slot's containers
// start / reset / dbtests need  --owner YOUR-NAME  (or LT_OWNER): it is shown by "status" and in the "full" message, and a
// slot somebody else runs is not touched (stop --slot N needs the owner's name, or --force). "stop" clears the owner.
//   node local-test/run.mjs ports                    show this slot's database / CRM / student-app ports
// SEVERAL PEOPLE: each department uses its OWN database ("slot"): add --slot N (or set LT_SLOT=N), N = 1..9.
// Slot 0 (no --slot) is the QA department's. A slot has its own containers, ports and data, so a reset never
// touches anyone else's. See docs/local-test-env.md, "Sharing".
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const accounts = JSON.parse(readFileSync(join(here, 'test-accounts.json'), 'utf8'))
const isWin = process.platform === 'win32'

// ---- which database ("slot"): --slot N anywhere on the command line, or LT_SLOT=N. 0 = QA's own.
const argv = process.argv.slice(2)
const slotIndex = argv.indexOf('--slot')
let slot = Number(process.env.LT_SLOT ?? 0)
if (slotIndex !== -1) {
  slot = Number(argv[slotIndex + 1])
  argv.splice(slotIndex, 2)
}
if (!Number.isInteger(slot) || slot < 0 || slot > 9) throw new Error('--slot must be a number from 0 to 9')
const slotGiven = slotIndex !== -1 || process.env.LT_SLOT !== undefined
// Who is using the slot: --owner NAME (or LT_OWNER). Asked for when a slot is started, so everybody can see whose it is.
const ownerIndex = argv.indexOf('--owner')
let owner = (process.env.LT_OWNER ?? '').trim()
if (ownerIndex !== -1) {
  owner = String(argv[ownerIndex + 1] ?? '').trim()
  argv.splice(ownerIndex, 2)
}
const forceIndex = argv.indexOf('--force')
const force = forceIndex !== -1
if (force) argv.splice(forceIndex, 1)
const NAME = slot === 0 ? 'mirai-local-test' : `mirai-local-test-${slot}`
const DB = `supabase_db_${NAME}`
const ports = { api: 54421 + 10 * slot, db: 54422 + 10 * slot, gateway: 3999 + slot, crm: 5180 + slot, student: 8185 + slot }
accounts.apiUrl = `http://127.0.0.1:${ports.api}`
process.env.LT_API_URL = accounts.apiUrl
process.env.LT_GATEWAY_PORT = String(ports.gateway)
const env = { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }

// A slot's own project folder (config with its own name and ports, made from slot 0's config).
const workdir = slot === 0 ? 'local-test' : join('local-test', 'slots', String(slot))
if (slot !== 0) {
  const dir = join(root, workdir, 'supabase')
  mkdirSync(join(dir, '.temp'), { recursive: true })
  if (!existsSync(join(dir, 'config.toml'))) {
    let config = readFileSync(join(here, 'supabase', 'config.toml'), 'utf8')
    config = config.replace('project_id = "mirai-local-test"', `project_id = "${NAME}"`)
    config = config.replace(/\b544(2\d)\b/g, (_m, tail) => String(54420 + Number(tail) - 20 + 10 * slot))
    config = config.replace(/inspector_port = 8183/, `inspector_port = ${8183 + slot}`)
    writeFileSync(join(dir, 'config.toml'), config)
    writeFileSync(join(dir, 'seed.sql'), '-- the fake data is added by local-test/run.mjs\n')
  }
  for (const f of ['postgres-version', 'gotrue-version', 'rest-version', 'storage-version']) {
    if (!existsSync(join(dir, '.temp', f))) copyFileSync(join(here, 'supabase', '.temp', f), join(dir, '.temp', f))
  }
}

const run = (cmd, args, options = {}) => {
  const result = spawnSync(cmd, args, { cwd: root, env, stdio: 'inherit', shell: isWin, ...options })
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`)
}
const supabase = (...args) => run('npx', ['supabase', ...args, '--workdir', workdir])

function psql(file) {
  const sql = readFileSync(file, 'utf8')
  const result = spawnSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: sql, env, encoding: 'utf8',
  })
  if (result.status !== 0) {
    process.stderr.write(`${result.stdout}\n${result.stderr}\n`)
    throw new Error(`seed file failed: ${file}`)
  }
  if (result.stdout.trim()) console.log(result.stdout.trim())
}

async function authUser(email, id) {
  const response = await fetch(`${accounts.apiUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: accounts.serviceKey, Authorization: `Bearer ${accounts.serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, email, password: accounts.password, email_confirm: true }),
  })
  if (!response.ok) throw new Error(`could not create ${email}: ${response.status} ${await response.text()}`)
}

async function makeLogins() {
  for (const a of accounts.crm) await authUser(`${a.username}@mirai.internal`, a.id)
  for (const a of accounts.portal) await authUser(`${a.username}@portal.internal`, a.id)
  console.log(`made ${accounts.crm.length + accounts.portal.length} logins`)
}

const schoolOf = (value) => (value === 'eduhero' ? 'eduhero' : 'mirai')
const seedFiles = () => readdirSync(join(here, 'seed')).filter((f) => /^\d\d_.*\.sql$/.test(f)).sort()
const schoolFile = (school) => join(here, 'seed', `school-${school}.sql`)

// The migrations are the repo's own (supabase/migrations), linked in so there is only ever one copy.
const migrationsLink = join(root, workdir, 'supabase', 'migrations')
if (!existsSync(migrationsLink)) symlinkSync(join(root, 'supabase', 'migrations'), migrationsLink, 'junction')

// Starts a long-running tool and makes sure it ends when this script ends (taskkill /T on Windows: the whole tree).
function keepRunning(cmd, args, options) {
  const child = spawn(cmd, args, { stdio: 'inherit', shell: isWin, ...options })
  const stop = () => {
    if (child.exitCode !== null) return
    if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else child.kill()
  }
  process.on('exit', stop)
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => { stop(); process.exit(0) })
  child.on('exit', (code) => process.exit(code ?? 0))
}

// Docker Desktop has little memory (8 GB), so at most MAX_SLOTS databases may run at once: a third one made it hang.
const MAX_SLOTS = 2
function runningSlots() {
  // no shell: on Windows a shell would split the --format text at its spaces/tabs
  const out = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout ?? ''
  const found = new Set()
  for (const line of out.split(/\r?\n/)) {
    const m = line.trim().match(/^supabase_db_mirai-local-test(?:-(\d))?$/)
    if (m) found.add(m[1] ? Number(m[1]) : 0)
  }
  return [...found].sort((a, b) => a - b)
}

// ---- who uses which slot: local-test/slots/N/owner.json = { owner, startedAt } (ignored by git, cleared by "stop")
const ownerFile = (n) => join(here, 'slots', String(n), 'owner.json')
function readOwner(n) {
  try {
    return JSON.parse(readFileSync(ownerFile(n), 'utf8'))
  } catch {
    return null
  }
}
function writeOwner(name, startedAt) {
  mkdirSync(dirname(ownerFile(slot)), { recursive: true })
  writeFileSync(ownerFile(slot), JSON.stringify({ owner: name, startedAt }, null, 2))
}
function clearOwner(n) {
  try {
    rmSync(ownerFile(n))
  } catch {
    // none recorded
  }
}
const dockerUptime = (n) => {
  // "Up 15 minutes (healthy)" from Docker, for a slot started before owners were recorded
  const name = `supabase_db_mirai-local-test${n === 0 ? '' : `-${n}`}`
  const out = spawnSync('docker', ['ps', '--filter', `name=^${name}$`, '--format', '{{.Status}}'], { encoding: 'utf8' }).stdout ?? ''
  return out.trim().replace(/^Up\s+/, '').replace(/\s*\(.*\)$/, '')
}
function sinceText(startedAt) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000))
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}
// "slot 4: 小明, running 12 min" (or "owner not recorded").
function describeSlot(n) {
  const record = readOwner(n)
  if (record?.owner) return `slot ${n}: ${record.owner}, running ${sinceText(record.startedAt)}`
  return `slot ${n}: owner not recorded (running ${dockerUptime(n) || 'for a while'})`
}

function refuseIfFull() {
  const running = runningSlots().filter((s) => s !== slot)
  if (running.length < MAX_SLOTS) return
  console.error(`\nNOT STARTED: at most ${MAX_SLOTS} databases may run at once (Docker runs out of memory), and these are running:`)
  for (const n of running) console.error(`  ${describeSlot(n)}`)
  console.error(`Ask that person, or whoever's turn it is, to stop theirs:  node local-test/run.mjs stop --slot N --owner THEIR-NAME`)
  console.error(`Check what runs:  node local-test/run.mjs status\n`)
  process.exit(2)
}

// start / reset / dbtests: the slot needs a named owner, and a slot somebody else is running is not touched.
function claimSlot() {
  const up = runningSlots().includes(slot)
  const record = up ? readOwner(slot) : null
  if (record?.owner && owner && record.owner !== owner && !force) {
    console.error(`\nSTOPPED: slot ${slot} is ${record.owner}'s (${describeSlot(slot)}), and you are ${owner}. Use your own slot; ask ${record.owner} if it is free.`)
    console.error(`Check what runs:  node local-test/run.mjs status\n`)
    process.exit(2)
  }
  // Running, but nobody recorded it (started before owners were kept): a name is only taken on by whoever it is, with --force.
  if (up && !record?.owner && owner && !force) {
    console.error(`\nSTOPPED: slot ${slot} is running and nobody recorded whose it is (${describeSlot(slot)}).`)
    console.error(`If it is yours, say so once with --force (that records "${owner}" as its owner). If it is not, use another slot.\n`)
    process.exit(2)
  }
  if (!owner && !record?.owner) {
    console.error(`\nSTOPPED: say who you are, so the others can see whose slot it is:  --owner YOUR-NAME   (or set LT_OWNER)`)
    console.error(`Example:  node local-test/run.mjs ${command} --slot ${slot} --owner ${slot === 0 ? 'QA' : 'Inbox'}\n`)
    process.exit(2)
  }
  return record?.owner ?? owner
}

const [command, arg] = argv
// `db reset` needs the database running: start it (first time, or after "stop") when it is not. Given the owner's
// name it records it (keeping the start time of a slot that was already running under that name).
const ensureStarted = (name) => {
  const wasUp = runningSlots().includes(slot)
  const record = readOwner(slot)
  if (!wasUp) {
    refuseIfFull()
    supabase('start', '-x', 'imgproxy')
  }
  if (name) writeOwner(name, wasUp && record?.owner === name ? record.startedAt : new Date().toISOString())
}
console.log(`[slot ${slot}: database ${NAME}, API ${accounts.apiUrl}]`)

// A reset wipes this slot's data. Pause 5 seconds so a wrong --slot can still be stopped with Ctrl-C.
const pause = () => spawnSync(isWin ? 'powershell' : 'sleep', isWin ? ['-NoProfile', '-Command', 'Start-Sleep 5'] : ['5'], { stdio: 'ignore' })

if (command === 'start') {
  ensureStarted(claimSlot())
} else if (command === 'reset') {
  const school = schoolOf(arg)
  const who = claimSlot()
  console.log(`!! wiping slot ${slot} (${NAME}, ${who}'s) in 5 seconds - Ctrl-C now if that is not yours`)
  pause()
  ensureStarted(who)
  supabase('db', 'reset')
  await makeLogins()
  for (const file of seedFiles()) {
    console.log(`seed ${file}`)
    psql(join(here, 'seed', file))
  }
  psql(schoolFile(school))
  console.log(`done: fake data loaded, school settings = ${school}`)
} else if (command === 'dbtests') {
  // Most SQL tests expect a database with the migrations and nothing else (no fake data). A few are written
  // against the local test data (students, attendance, leads) and say so in their first lines
  // ("-- needs: fake-data"): they run second, after the fake data is loaded. Every test rolls back.
  const who = claimSlot()
  console.log(`!! wiping slot ${slot} (${NAME}, ${who}'s) in 5 seconds - Ctrl-C now if that is not yours`)
  pause()
  ensureStarted(who)
  supabase('db', 'reset')
  let failed = 0
  const testsDir = join(root, 'supabase', 'tests')
  const needsFakeData = (file) => /^--\s*needs:\s*fake-data/im.test(readFileSync(join(testsDir, file), 'utf8').split('\n').slice(0, 12).join('\n'))
  const all = readdirSync(testsDir).filter((f) => f.endsWith('.sql')).sort()
  const runTests = (files) => {
    for (const file of files) {
      const result = spawnSync('docker', ['exec', '-i', DB, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
        input: readFileSync(join(testsDir, file), 'utf8'), env, encoding: 'utf8',
      })
      const text = `${result.stdout}\n${result.stderr}`
      const passes = (text.match(/PASS/g) ?? []).length
      const errors = text.split('\n').filter((line) => /ERROR|FAIL/.test(line))
      if (result.status !== 0 || errors.length > 0) failed += 1
      const note = errors.length ? '\n     ' + errors.slice(0, 3).join('\n     ') : ''
      console.log(`${result.status === 0 && errors.length === 0 ? 'OK  ' : 'FAIL'} ${file}  (${passes} PASS)${note}`)
    }
  }
  console.log('--- on the empty database')
  runTests(all.filter((f) => !needsFakeData(f)))
  const withData = all.filter(needsFakeData)
  if (withData.length > 0) {
    console.log('--- on the fake data (these tests say "needs: fake-data")')
    await makeLogins()
    for (const file of seedFiles()) psql(join(here, 'seed', file))
    psql(schoolFile('mirai'))
    runTests(withData)
  }
  console.log(failed === 0 ? 'all database tests passed' : `${failed} database test file(s) failed`)
  console.log('The fake data is loaded now (or the database is empty): run "reset" to start fresh.')
  process.exitCode = failed === 0 ? 0 : 1
} else if (command === 'logins') {
  await makeLogins()
} else if (command === 'seed') {
  for (const file of seedFiles()) {
    console.log(`seed ${file}`)
    psql(join(here, 'seed', file))
  }
} else if (command === 'school') {
  psql(schoolFile(schoolOf(arg)))
  console.log(`school settings = ${schoolOf(arg)} (use "crm ${schoolOf(arg)}" for the CRM's own colours and name)`)
} else if (command === 'crm') {
  const school = schoolOf(arg)
  await import('./mock-gateway.mjs') // the fake Chatwoot gateway (port 3999 + slot), in this same process
  const gateway = `http://127.0.0.1:${ports.gateway}`
  console.log(`CRM: http://localhost:${ports.crm}`)
  keepRunning('npx', ['vite', '--mode', school === 'eduhero' ? 'localtest-eduhero' : 'localtest', '--port', String(ports.crm), '--strictPort'], {
    cwd: root,
    env: { ...env, VITE_SUPABASE_URL: accounts.apiUrl, VITE_SUPABASE_PUBLISHABLE_KEY: accounts.anonKey, VITE_WHATSAPP_API_URL: gateway, VITE_CHATWOOT_URL: gateway },
  })
} else if (command === 'student') {
  console.log(`student app: http://localhost:${ports.student}`)
  keepRunning('npx', ['expo', 'start', '--web', '--port', String(ports.student)], {
    cwd: join(root, 'student-app'),
    env: { ...env, EXPO_PUBLIC_SUPABASE_URL: accounts.apiUrl, EXPO_PUBLIC_SUPABASE_KEY: accounts.anonKey },
  })
} else if (command === 'stop') {
  const record = readOwner(slot)
  const isUp = runningSlots().includes(slot)
  if (isUp && record?.owner && owner !== record.owner && !force) {
    console.error(`\nNOT STOPPED: slot ${slot} is ${record.owner}'s (${describeSlot(slot)}).`)
    console.error(`Ask ${record.owner} to stop it, or, if they are done and gone, add --force.\n`)
    process.exit(2)
  }
  if (isUp && !record?.owner && !force) {
    console.error(`\nNOT STOPPED: slot ${slot} is running and nobody recorded whose it is (${describeSlot(slot)}).`)
    console.error(`Find out whose it is and ask them. If you are sure it is free (or it is yours), add --force.\n`)
    process.exit(2)
  }
  supabase('stop')
  clearOwner(slot)
} else if (command === 'status' || command === 'running') {
  // No --slot: every slot that runs, with whose it is and for how long. With --slot N: that slot's containers too.
  const list = runningSlots()
  console.log(list.length ? `running (at most ${MAX_SLOTS} at once):` : 'no slot is running')
  for (const n of list) console.log(`  ${describeSlot(n)}  [CRM http://localhost:${5180 + n}]`)
  if (list.length >= MAX_SLOTS) console.log(`  full: a new slot has to wait until one of these is stopped.`)
  if (slotGiven && command === 'status') {
    const out = spawnSync('docker', ['ps', '--filter', `name=${NAME}`, '--format', '{{.Names}}  {{.Status}}'], { encoding: 'utf8' }).stdout ?? ''
    console.log(`\nslot ${slot} containers:\n${out.trim() || '  (not running)'}`)
  }
} else if (command === 'ports') {
  console.log(JSON.stringify({ slot, database: NAME, ...ports, apiUrl: accounts.apiUrl }, null, 2))
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n'))
}
