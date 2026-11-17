import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, BoardChange, BoardView } from '../types'
import {
  COLUMNS,
  columnOf,
  countOf,
  docLabel,
  docName,
  parseStatus,
  parseTasks,
  progressOf,
  SHOW_OPTIONS,
  SORT_OPTIONS,
  specDrivenStatus,
  summaryOf,
  titleOf,
  visibleChanges,
} from './openspec'
import type { ShowFilter, SortOrder } from './openspec'

const PANE = 'openspec'
const POLL_MS = 5000
const CLI_RUNS_AT_ONCE = 4
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

const EMPTY_BOARD: Board = { found: 'unknown', changes: [], touched: [] }
const START_VIEW: BoardView = {
  tab: 'changes',
  sel: null,
  doc: null,
  file: 0,
  filter: 'all',
  showArchived: true,
  hint: '',
  search: '',
  show: 'all',
  sort: 'name',
}
const board = atom({ plugin: 'fishman-sdlc', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-2' })
const view = atom({ plugin: 'fishman-sdlc', key: 'view' } as const, START_VIEW, { shape: 'view-2' })

// A Change is read again, and the CLI asked again, only when a file of it or of the schemas changed.
const cache = new Map<string, { signature: string; change: BoardChange }>()
let hasCli = true

type FileStamp = { path: string; mtimeMs: number }

async function walk($: EngineInterface, dir: string, depth = 0): Promise<FileStamp[]> {
  if (!(await $.fs.exists(dir))) return []
  const stamps: FileStamp[] = []
  for (const entry of await $.fs.list(dir)) {
    const path = `${dir}/${entry.name}`
    if (entry.kind === 'file') stamps.push({ path, mtimeMs: entry.mtimeMs })
    else if (entry.kind === 'dir' && depth < 4) stamps.push(...(await walk($, path, depth + 1)))
  }
  return stamps
}

const signatureOf = (stamps: FileStamp[]) => stamps.map(s => `${s.path}:${s.mtimeMs}`).join('|')

/** The schema as OpenSpec resolves it: the CLI reads config.yaml, a Change's .openspec.yaml and openspec/schemas/. */
async function cliStatus($: EngineInterface, root: string, name: string) {
  if (!hasCli) return null
  try {
    const { exitCode, stdout } = await $.process.run(['openspec', 'status', '--change', name, '--json'], { cwd: root, timeoutMs: 15000 })
    return exitCode === 0 ? parseStatus(stdout) : null
  } catch {
    // The command does not start: no CLI on this machine. Every Change uses the default layout.
    hasCli = false
    return null
  }
}

async function readText($: EngineInterface, path: string | undefined): Promise<string | null> {
  if (!path) return null
  try {
    return await $.fs.read(path)
  } catch {
    return null
  }
}

async function readChange($: EngineInterface, root: string, schemaSignature: string, parent: string, name: string, isArchived: boolean): Promise<BoardChange> {
  const dir = `${parent}/${name}`
  const stamps = await walk($, dir)
  const signature = `${schemaSignature}#${signatureOf(stamps)}`
  const cached = cache.get(dir)
  if (cached && cached.signature === signature) return cached.change

  // shortcut: `openspec status` reads only active Changes, so an archived one is read as spec-driven; read its .openspec.yaml if archived custom-schema Changes matter.
  const fromCli = isArchived ? null : await cliStatus($, root, name)
  const paths = stamps.map(s => s.path)
  const has = (file: string) => (paths.includes(`${dir}/${file}`) ? [`${dir}/${file}`] : [])
  const status =
    fromCli ??
    specDrivenStatus({
      proposal: has('proposal.md'),
      specs: paths.filter(p => p.startsWith(`${dir}/specs/`) && p.endsWith('.md')).sort(),
      design: has('design.md'),
      tasks: has('tasks.md'),
    })
  const taskFile = status.docs.find(doc => doc.id === status.taskDoc)?.files[0]
  const [firstText, taskText] = await Promise.all([readText($, status.docs[0]?.files[0]), readText($, taskFile)])
  const change: BoardChange = {
    key: isArchived ? `archive/${name}` : name,
    id: name,
    title: titleOf(firstText ?? '', name),
    dir,
    isArchived,
    source: fromCli ? 'cli' : 'files',
    ...status,
    tasks: taskText === null ? null : parseTasks(taskText),
    updatedAt: stamps.reduce((newest, s) => Math.max(newest, s.mtimeMs), 0),
  }
  cache.set(dir, { signature, change })
  return change
}

async function inPool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      const item = items[i]
      if (item !== undefined) results[i] = await work(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

async function scan($: EngineInterface): Promise<Pick<Board, 'found' | 'changes'>> {
  const root = await $.session.root()
  if (!(await $.fs.exists(`${root}/openspec`))) return { found: 'none', changes: [] }
  const changesDir = `${root}/openspec/changes`
  const schemaStamps = [...(await walk($, `${root}/openspec/schemas`))]
  if (await $.fs.exists(`${root}/openspec/config.yaml`)) {
    schemaStamps.push({ path: 'config.yaml', mtimeMs: (await $.fs.stat(`${root}/openspec/config.yaml`)).mtimeMs })
  }
  const schemaSignature = signatureOf(schemaStamps)
  const listIn = async (dir: string, isArchived: boolean) => {
    if (!(await $.fs.exists(dir))) return []
    const names = (await $.fs.list(dir)).filter(entry => entry.kind === 'dir' && entry.name !== 'archive').map(entry => entry.name)
    return inPool(names, CLI_RUNS_AT_ONCE, name => readChange($, root, schemaSignature, dir, name, isArchived))
  }
  const active = await listIn(changesDir, false)
  const archived = await listIn(`${changesDir}/archive`, true)
  active.sort((a, b) => a.id.localeCompare(b.id))
  // Archive folders start with their date, so newest first.
  archived.sort((a, b) => b.id.localeCompare(a.id))
  return { found: 'ok', changes: [...active, ...archived] }
}

function differences(before: BoardChange[], after: BoardChange[]): string[] {
  const old = new Map(before.map(change => [change.key, change]))
  const notes: string[] = []
  for (const change of after) {
    const was = old.get(change.key)
    const column = COLUMNS.find(c => c.id === columnOf(change))?.label ?? ''
    if (!was) notes.push(`${change.title} appeared in ${column}`)
    else if (countOf(was) !== countOf(change) || columnOf(was) !== columnOf(change)) {
      const moved = columnOf(was) === columnOf(change) ? '' : `, now in ${column}`
      notes.push(`${change.title}: ${countOf(was)} → ${countOf(change)}${moved}`)
    }
  }
  return notes
}

let running: Promise<void> | null = null
let runAgain = false

/** One scan at a time; a call during a scan runs one more after it, so the last edit is never missed. */
function refresh($: EngineInterface): Promise<void> {
  if (running) {
    runAgain = true
    return running
  }
  running = (async () => {
    do {
      runAgain = false
      const next = await scan($)
      const prev = await read($, board)
      if (prev.found === next.found && JSON.stringify(prev.changes) === JSON.stringify(next.changes)) continue
      await update($, board, current => ({ ...current, ...next }))
      if (prev.found !== 'ok') continue
      for (const note of differences(prev.changes, next.changes).slice(0, 3)) $.ui.toast(`OpenSpec: ${note}`)
    } while (runAgain)
  })().finally(() => {
    running = null
  })
  return running
}

function changeKeyOfPath(path: string): string | null {
  const match = /\/openspec\/changes\/(archive\/)?([^/]+)\//.exec(path)
  if (!match?.[2] || match[2] === 'archive') return null
  return match[1] ? `archive/${match[2]}` : match[2]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'openspec', description: 'Show the OpenSpec board for this repository' })
    // The first scan asks the CLI about every Change, so it runs after the session is up.
    $.clock.after(0, async () => {
      await refresh($)
      if ((await read($, board)).found === 'ok') void $.ui.open({ id: PANE, title: 'OpenSpec' })
    })
    $.clock.every(POLL_MS, () => {
      void refresh($)
    })
    return next(e)
  })

  on('command.run', { command: 'openspec' }, async $ => {
    await $.ui.open({ id: PANE, title: 'OpenSpec' })
    void refresh($)
    return { text: 'OpenSpec board opened.' }
  })

  // Claude's own edits refresh at once; editor saves arrive with the poll.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const tool = String(e.tool)
    if (!EDIT_TOOLS.has(tool) && tool !== 'Bash') return result
    const input = e as unknown as { file_path?: unknown; notebook_path?: unknown; command?: unknown }
    const path = [input.file_path, input.notebook_path].find((p): p is string => typeof p === 'string') ?? ''
    const command = typeof input.command === 'string' ? input.command : ''
    if (!path.includes('/openspec/') && !command.includes('openspec')) return result
    try {
      const key = changeKeyOfPath(path)
      if (key) await update($, board, b => (b.touched.includes(key) ? b : { ...b, touched: [...b.touched, key] }))
      await refresh($)
    } catch {
      // The poll catches up; a failed refresh must not touch the tool's result.
    }
    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Input, Select, Markdown, Progress, Link } = $.ui.resolve(e)
    const b = await read($, board)
    const v = await read($, view)
    const setView = (patch: Partial<BoardView>) => () => {
      void update($, view, current => ({ ...current, ...patch }))
    }
    const ask = (command: string) => () => {
      void $.prompt.fill({ text: `${command} `, mode: 'insert' })
      void update($, view, current => ({ ...current, hint: `“${command}” is in the composer. Press Enter to send it.` }))
    }
    const hint = v.hint ? <Text>{v.hint}</Text> : <Text dimColor>Buttons put a command in the composer. Nothing runs until you send it.</Text>

    if (b.found === 'unknown') return <Text dimColor>Reading openspec/</Text>
    if (b.found === 'none') {
      return (
        <Box flexDirection="column" gap="sm" paddingY={1}>
          <Text bold>No openspec/ folder in this repository</Text>
          <Text dimColor>This pane reads openspec/ at the project root and found none. It never creates files by itself.</Text>
          <Button key="init" variant="primary" label="Ask Claude to set up OpenSpec" onPress={ask('Set up OpenSpec in this repository with openspec init.')} />
          {hint}
        </Box>
      )
    }
    if (b.changes.length === 0) {
      return (
        <Box flexDirection="column" gap="sm" paddingY={1}>
          <Text bold>No Changes yet</Text>
          <Text dimColor>openspec/ exists, but openspec/changes/ and its archive are empty.</Text>
          <Button key="propose" variant="primary" label="Ask Claude to propose a Change" onPress={ask('/opsx:propose')} />
          {hint}
        </Box>
      )
    }

    const ordered = COLUMNS.flatMap(col => b.changes.filter(c => columnOf(c) === col.id))
    const openCount = b.changes.reduce((n, c) => n + (c.tasks ?? []).filter(t => !t.isDone).length, 0)
    const columnLabel = (c: BoardChange) => COLUMNS.find(col => col.id === columnOf(c))?.label ?? ''
    const isTouched = (c: BoardChange) => b.touched.includes(c.key)
    const progress = (c: BoardChange) => {
      const p = progressOf(c)
      if (!p.hasTasks) return null
      return <Progress label="Tasks" value={p.done} max={p.total} valueText={countOf(c)} color={c.isArchived ? 'inactive' : 'text'} />
    }
    const summary = (c: BoardChange) => {
      const s = summaryOf(c)
      return s.isWarning ? <Text color="warning" bold>{s.text}</Text> : <Text dimColor>{s.text}</Text>
    }

    const tabs = (
      <Box flexDirection="row" gap="sm">
        <Button key="tab-changes" variant={v.tab === 'changes' ? 'primary' : 'secondary'} label={`Changes ${b.changes.length}`} onPress={setView({ tab: 'changes', sel: null, hint: '' })} />
        <Button key="tab-tasks" variant={v.tab === 'tasks' ? 'primary' : 'secondary'} label={`Tasks ${openCount} open`} onPress={setView({ tab: 'tasks', sel: null, hint: '' })} />
      </Box>
    )

    const cur = v.sel ? b.changes.find(c => c.key === v.sel) : undefined
    if (cur) {
      const at = ordered.findIndex(c => c.key === cur.key)
      const prev = ordered[at - 1]
      const nextChange = ordered[at + 1]
      const p = progressOf(cur)
      const s = summaryOf(cur)
      const doc = cur.docs.find(d => d.id === v.doc) ?? cur.docs[0]
      const isTaskDoc = doc !== undefined && doc.id === cur.taskDoc
      const fileIndex = doc ? Math.min(v.file, Math.max(0, doc.files.length - 1)) : 0
      const filePath = doc?.files[fileIndex] ?? (doc ? `${cur.dir}/${docName(doc)}` : cur.dir)
      const relative = (path: string) => (path.startsWith(`${cur.dir}/`) ? path.slice(cur.dir.length + 1) : path)
      const text = doc && doc.files.length > 0 && !isTaskDoc ? await readText($, filePath) : null
      const commands: Record<string, [string, string][]> = {
        planning: [['Continue planning', `/opsx:continue ${cur.id}`]],
        ready: [['Start implementing', `/opsx:apply ${cur.id}`], ['Revise plan', `/opsx:update ${cur.id}`]],
        started: [['Apply next task', `/opsx:apply ${cur.id}`], ['Revise plan', `/opsx:update ${cur.id}`]],
        complete: [['Sync specs', `/opsx:sync ${cur.id}`], ['Archive', `/opsx:archive ${cur.id}`]],
        archived: s.isWarning ? [['Propose a follow-up', `/opsx:propose follow-up for ${cur.id}`]] : [],
      }
      const actions = commands[columnOf(cur)] ?? []
      const sections: { name: string; tasks: { num: string; text: string; isDone: boolean }[] }[] = []
      for (const task of cur.tasks ?? []) {
        const last = sections[sections.length - 1]
        if (last && last.name === task.section) last.tasks.push(task)
        else sections.push({ name: task.section, tasks: [task] })
      }
      let missingText = ''
      if (doc && doc.files.length === 0) {
        if (doc.status === 'skipped') missingText = `This Change skips ${docName(doc)}.`
        else if (isTaskDoc) missingText = `This Change has no ${docName(doc)} yet, so its tasks are not defined. That is not 0% done.`
        else missingText = `This Change has no ${docName(doc)} yet.`
      }

      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Box flexDirection="row" gap="sm">
            <Button key="back" label={`← ${v.tab === 'tasks' ? 'Tasks' : 'Changes'}`} onPress={setView({ sel: null, hint: '' })} />
            {prev ? <Button key="prev" label="Previous" onPress={setView({ sel: prev.key, doc: null, file: 0, hint: '' })} /> : null}
            {nextChange ? <Button key="next" label="Next" onPress={setView({ sel: nextChange.key, doc: null, file: 0, hint: '' })} /> : null}
          </Box>
          <Box flexDirection="column" gap="xs">
            <Text size="heading" bold>{cur.title}</Text>
            <Text mono dimColor>{cur.id}</Text>
            <Text dimColor>{`Schema: ${cur.schema}${cur.source === 'files' ? ' (read from the files, not the openspec CLI)' : ''}`}</Text>
            <Text>{`${p.hasTasks ? `${p.done} of ${p.total} tasks checked` : 'Tasks not defined'} · ${columnLabel(cur)}`}</Text>
            {progress(cur)}
            {s.isWarning || !p.hasTasks || columnOf(cur) === 'complete' ? summary(cur) : null}
            {isTouched(cur) ? <Text color="claude">Claude edited this Change in this session</Text> : null}
            {cur.isArchived ? (
              <Text dimColor>
                {s.isWarning
                  ? 'It was archived with unchecked tasks. Archiving moves the folder. It does not check tasks, run tests or ship code.'
                  : 'Archiving moved the folder. It says nothing about tests, merges or releases.'}
              </Text>
            ) : null}
          </Box>
          <Box flexDirection="row" gap="xs" flexWrap="wrap">
            {cur.docs.map(d => {
              let label = docLabel(d)
              if (d.files.length === 0) label += d.status === 'skipped' ? ' · skipped' : ' · missing'
              return (
                <Button key={`doc-${d.id}`} variant={doc?.id === d.id ? 'primary' : 'secondary'} label={label} onPress={setView({ doc: d.id, file: 0, hint: '' })} />
              )
            })}
          </Box>
          {doc && doc.files.length > 1 && !isTaskDoc ? (
            <Select
              key="doc-file"
              label="File"
              value={String(fileIndex)}
              options={doc.files.map((file, i) => ({ value: String(i), label: relative(file) }))}
              onSelect={value => {
                void update($, view, current => ({ ...current, file: Number(value) }))
              }}
            />
          ) : null}
          <Text mono dimColor>{`${relative(filePath)} · read-only`}</Text>
          {missingText ? (
            <Box borderStyle="dashed" borderDimColor paddingX={1}>
              <Text dimColor>{missingText}</Text>
            </Box>
          ) : null}
          {text !== null ? <Markdown key="doc" text={text || '(empty file)'} /> : null}
          {isTaskDoc && cur.tasks ? (
            <Box flexDirection="column" gap="xs">
              {cur.tasks.length === 0 ? <Text dimColor>{`${relative(filePath)} has no checkboxes yet.`}</Text> : null}
              {sections.map(section => (
                <Box flexDirection="column">
                  {section.name ? <Text bold>{section.name}</Text> : null}
                  {section.tasks.map(task =>
                    task.isDone ? (
                      <Text dimColor>{`☑ ${task.num} ${task.text}`}</Text>
                    ) : (
                      <Text color={cur.isArchived ? 'warning' : 'text'}>{`☐ ${task.num} ${task.text}`}</Text>
                    ),
                  )}
                </Box>
              ))}
            </Box>
          ) : null}
          <Box flexDirection="column" gap="xs" paddingTop={1}>
            <Box flexDirection="row" gap="sm" flexWrap="wrap">
              {actions.map(([label, command], i) => (
                <Button key={`act-${i}`} variant={i === 0 ? 'primary' : 'secondary'} label={label} onPress={ask(command)} />
              ))}
              <Link href={`file://${filePath}`} label="Open file" />
            </Box>
            {actions.length ? hint : <Text dimColor>No agent action for an archived Change.</Text>}
          </Box>
        </Box>
      )
    }

    if (v.tab === 'tasks') {
      const rows = b.changes
        .filter(c => (v.filter === 'all' || v.filter === c.key) && (v.showArchived || !c.isArchived))
        .flatMap(c => (c.tasks ?? []).map((task, i) => ({ c, task, i })))
      const undefinedTitles = b.changes.filter(c => c.tasks === null && (v.filter === 'all' || v.filter === c.key)).map(c => c.title)
      const group = (label: string, isDone: boolean) => {
        const list = rows.filter(r => r.task.isDone === isDone)
        return (
          <Box flexDirection="column" gap="xs">
            <Text bold>{`${label} ${list.length}`}</Text>
            {list.length === 0 ? <Text dimColor>None for this filter.</Text> : null}
            {list.map(({ c, task, i }) => (
              <Box flexDirection="column">
                <Button key={`task-${c.key}-${i}`} plain onPress={setView({ sel: c.key, doc: c.taskDoc, file: 0, hint: '' })}>
                  {`${isDone ? '☑' : '☐'} ${task.text} `}
                  <Text dimColor>{`${c.title} · ${task.num}`}</Text>
                </Button>
                {c.isArchived && !isDone ? <Text color="warning">Unfinished · its Change is archived</Text> : null}
              </Box>
            ))}
          </Box>
        )
      }
      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Select
            key="filter"
            label="Change"
            value={v.filter}
            options={[{ value: 'all', label: 'All changes' }, ...b.changes.map(c => ({ value: c.key, label: c.isArchived ? `${c.title} (archived)` : c.title }))]}
            onSelect={value => {
              void update($, view, current => ({ ...current, filter: value }))
            }}
          />
          <Button key="archived" label={v.showArchived ? 'Archived Changes: shown' : 'Archived Changes: hidden'} onPress={setView({ showArchived: !v.showArchived })} />
          {undefinedTitles.length ? <Text dimColor>{`Tasks not defined: ${undefinedTitles.join(', ')}`}</Text> : null}
          {group('Open', false)}
          {group('Completed', true)}
        </Box>
      )
    }

    const active = b.changes.filter(c => !c.isArchived)
    const readByCli = active.some(c => c.source === 'cli')
    const shown = visibleChanges(b.changes, v.search, v.show, v.sort)
    const isNarrowed = v.search.trim() !== '' || v.show !== 'all'
    return (
      <Box flexDirection="column" gap="sm">
        {tabs}
        <Input
          key="search"
          label="Search"
          placeholder="Title or folder name"
          value={v.search}
          onInput={value => {
            void update($, view, current => ({ ...current, search: value }))
          }}
          onSubmit={value => {
            void update($, view, current => ({ ...current, search: value }))
          }}
        />
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          <Select
            key="show"
            label="Show"
            value={v.show}
            options={SHOW_OPTIONS}
            onSelect={value => {
              void update($, view, current => ({ ...current, show: value as ShowFilter }))
            }}
          />
          <Select
            key="sort"
            label="Sort"
            value={v.sort}
            options={SORT_OPTIONS}
            onSelect={value => {
              void update($, view, current => ({ ...current, sort: value as SortOrder }))
            }}
          />
        </Box>
        {isNarrowed ? (
          <Box flexDirection="row" gap="sm">
            <Text dimColor>{`${shown.length} of ${b.changes.length} Changes`}</Text>
            <Button key="clear" plain label="Clear" onPress={setView({ search: '', show: 'all' })} />
          </Box>
        ) : null}
        {COLUMNS.map(col => {
          const list = shown.filter(c => columnOf(c) === col.id)
          if (isNarrowed && list.length === 0) return null
          return (
            <Box flexDirection="column" gap="xs" paddingTop={1}>
              <Text bold>{`${col.label} ${list.length}`}</Text>
              {list.length === 0 ? <Text dimColor>None</Text> : null}
              {list.map(c => (
                <Box flexDirection="column">
                  <Button key={`open-${c.key}`} plain onPress={setView({ sel: c.key, doc: null, file: 0, hint: '' })}>
                    {c.title}
                  </Button>
                  {progress(c) ?? <Text dimColor>Tasks not defined</Text>}
                  <Box flexDirection="row" gap="sm">
                    {summary(c)}
                    {isTouched(c) ? <Text color="claude">Claude edited</Text> : null}
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
        <Text dimColor>Columns follow the files. They are not OpenSpec statuses.</Text>
        {active.length > 0 && !readByCli ? (
          <Text dimColor>The openspec CLI did not answer, so every Change is read as the default spec-driven schema.</Text>
        ) : null}
      </Box>
    )
  })
}
