import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Board, BoardView } from '../types'
import {
  columnOf,
  countOf,
  layoutFromFiles,
  layoutOf,
  matchesPattern,
  parseStatus,
  parseTasks,
  schemaNameOf,
  skipsSpecsOf,
  SPEC_DRIVEN_LAYOUT,
  statusFromFiles,
  summaryOf,
  closeGoesBack,
  taskListMarkdown,
  taskMarkdown,
  titleOf,
  visibleChanges,
} from '../hooks/openspec'
import type { Change, Task } from '../hooks/openspec'

const TASKS = `# Tasks

## 1. OAuth client

- [x] 1.1 Register the OAuth client
- [X] 1.2 Add the callback route

## 2. Sign-in screen

- [ ] 2.1 Add the button
`

const DIR = '/r/openspec/changes/c'
const ALL_DOCS = statusFromFiles(SPEC_DRIVEN_LAYOUT, DIR, [`${DIR}/proposal.md`, `${DIR}/specs/auth/spec.md`, `${DIR}/design.md`, `${DIR}/tasks.md`])

const done = (n: number, total: number): Task[] =>
  Array.from({ length: total }, (_, i) => ({ num: `1.${i + 1}`, text: `task ${i + 1}`, isDone: i < n, section: '1. Work' }))

const change = (patch: Partial<Change>): Change => ({
  key: 'c',
  id: 'c',
  title: 'C',
  dir: DIR,
  isArchived: false,
  source: 'files',
  ...ALL_DOCS,
  tasks: [],
  updatedAt: 0,
  ...patch,
})

const noDesignNoTasks = () => statusFromFiles(SPEC_DRIVEN_LAYOUT, DIR, [`${DIR}/proposal.md`, `${DIR}/specs/auth/spec.md`])

// `openspec status --change fix-typo --json` for a Change on a custom "rapid" schema, trimmed.
const RAPID_STATUS = JSON.stringify({
  changeName: 'fix-typo',
  schemaName: 'rapid',
  isPlanningComplete: true,
  applyRequires: ['checklist'],
  artifacts: [
    { id: 'brief', outputPath: 'brief.md', status: 'done', requires: [] },
    { id: 'checklist', outputPath: 'checklist.md', status: 'done', requires: ['brief'] },
  ],
  artifactPaths: {
    brief: { existingOutputPaths: ['/r/openspec/changes/fix-typo/brief.md'] },
    checklist: { existingOutputPaths: ['/r/openspec/changes/fix-typo/checklist.md'] },
  },
})

test('tasks parse with their number and section', () => {
  const tasks = parseTasks(TASKS)
  expect(tasks.length).toBe(3)
  expect(tasks[1]).toEqual({ num: '1.2', text: 'Add the callback route', isDone: true, section: '1. OAuth client' })
  expect(tasks[2]?.isDone).toBe(false)
  expect(tasks[2]?.section).toBe('2. Sign-in screen')
})

test('a custom schema from the CLI sets the documents and the task document', () => {
  const status = parseStatus(RAPID_STATUS)
  expect(status?.schema).toBe('rapid')
  expect(status?.docs.map(d => d.id)).toEqual(['brief', 'checklist'])
  expect(status?.taskDoc).toBe('checklist')
  expect(status?.docs[1]?.files).toEqual(['/r/openspec/changes/fix-typo/checklist.md'])
})

test('an archived Change reuses the layout the CLI gave for its schema', () => {
  const status = parseStatus(RAPID_STATUS)
  if (!status) throw new Error('no status')
  const archived = '/r/openspec/changes/archive/2026-10-20-old'
  const read = statusFromFiles(layoutOf(status), archived, [`${archived}/brief.md`, `${archived}/checklist.md`, `${archived}/notes.txt`])
  expect(read.docs.map(d => `${d.id}:${d.status}`)).toEqual(['brief:done', 'checklist:done'])
  expect(read.taskDoc).toBe('checklist')
})

test('skip_specs read from the files matches what the CLI says', () => {
  const files = [`${DIR}/proposal.md`, `${DIR}/design.md`, `${DIR}/tasks.md`]
  const yaml = 'schema: spec-driven\nskip_specs: true\n'
  const read = statusFromFiles(SPEC_DRIVEN_LAYOUT, DIR, files, skipsSpecsOf(yaml))
  expect(read.docs.find(d => d.id === 'specs')?.status).toBe('skipped')
  expect(read.isPlanningComplete).toBe(true)
  expect(statusFromFiles(SPEC_DRIVEN_LAYOUT, DIR, files, skipsSpecsOf('schema: spec-driven\n')).isPlanningComplete).toBe(false)
})

test('a schema with no known layout lists the Change top-level Markdown files', () => {
  const dir = '/r/openspec/changes/archive/x'
  const layout = layoutFromFiles('lean', dir, [`${dir}/plan.md`, `${dir}/brief.md`, `${dir}/specs/a/spec.md`, `${dir}/.openspec.yaml`])
  expect(layout.docs.map(d => d.id)).toEqual(['brief', 'plan', 'specs'])
})

test('the schema name comes from .openspec.yaml, then config.yaml, then the default', () => {
  expect(schemaNameOf('schema: rapid\n', 'schema: lean\n')).toBe('rapid')
  expect(schemaNameOf(null, 'context: x\nschema: "lean"\n')).toBe('lean')
  expect(schemaNameOf(null, null)).toBe('spec-driven')
})

test('a glob pattern matches files under its folder with its extension', () => {
  expect(matchesPattern('specs/**/*.md', 'specs/auth/spec.md')).toBe(true)
  expect(matchesPattern('specs/**/*.md', 'specs/auth/notes.txt')).toBe(false)
  expect(matchesPattern('brief.md', 'brief.md')).toBe(true)
  expect(matchesPattern('brief.md', 'sub/brief.md')).toBe(false)
})

test('CLI output of another shape is refused, so the board falls back to the files', () => {
  expect(parseStatus('not json')).toBe(null)
  expect(parseStatus(JSON.stringify({ status: [{ severity: 'error' }] }))).toBe(null)
  expect(parseStatus(JSON.stringify({ schemaName: 'x', isPlanningComplete: true, artifacts: [{ id: 1 }] }))).toBe(null)
})

test('columns follow the board rules', () => {
  expect(columnOf(change({ ...noDesignNoTasks(), tasks: null }))).toBe('planning')
  expect(columnOf(change({ tasks: done(0, 8) }))).toBe('ready')
  expect(columnOf(change({ tasks: done(4, 5) }))).toBe('started')
  expect(columnOf(change({ tasks: done(6, 6) }))).toBe('complete')
  expect(columnOf(change({ tasks: done(7, 7), isArchived: true }))).toBe('archived')
  expect(columnOf(change({ tasks: done(1, 2), isPlanningComplete: false }))).toBe('planning')
})

test('a Change on a custom schema is planned when the CLI says so', () => {
  const status = parseStatus(RAPID_STATUS)
  if (!status) throw new Error('no status')
  expect(columnOf(change({ ...status, source: 'cli', tasks: done(1, 2) }))).toBe('started')
})

test('a skipped document is not missing', () => {
  const docs = [{ id: 'specs', pattern: 'specs/**/*.md', status: 'skipped', files: [] }]
  expect(summaryOf(change({ docs, tasks: null })).text).toBe('Tasks not defined')
})

test('an archived 4 / 5 Change keeps its count and its unfinished task', () => {
  const archived = change({ tasks: done(4, 5), isArchived: true })
  expect(countOf(archived)).toBe('4 / 5')
  expect(summaryOf(archived)).toEqual({ text: '1 unfinished task', isWarning: true })
})

test('a missing task document is "Tasks not defined", never 0%', () => {
  const planning = change({ ...noDesignNoTasks(), tasks: null })
  expect(countOf(planning)).toBe('Tasks not defined')
  expect(summaryOf(planning).text).toBe('No design.md or tasks.md')
})

test('a generic heading falls back to the folder name', () => {
  expect(titleOf('# Proposal\n\n## Why', 'add-google-sign-in')).toBe('Add google sign in')
  expect(titleOf('# Proposal', '2026-11-14-pin-cloud-cli-tools')).toBe('Pin cloud cli tools')
  expect(titleOf('# Add Google sign-in\n', 'x')).toBe('Add Google sign-in')
})

const SAMPLE = [
  change({ key: 'g', id: 'add-google-sign-in', title: 'Google sign-in', tasks: done(4, 5), updatedAt: 30 }),
  change({ key: 'd', id: 'add-dark-mode', title: 'Dark mode', tasks: done(0, 8), updatedAt: 10 }),
  change({ key: 's', id: 'cache-search-results', title: 'Search caching', ...noDesignNoTasks(), tasks: null, updatedAt: 20 }),
  change({ key: 'l', id: '2026-10-02-remove-legacy-export', title: 'Legacy export cleanup', isArchived: true, tasks: done(4, 5), updatedAt: 5 }),
]
const titles = (list: Change[]) => list.map(c => c.title)

test('search matches the title or the folder name, ignoring case', () => {
  expect(titles(visibleChanges(SAMPLE, 'GOOGLE', 'all', 'name'))).toEqual(['Google sign-in'])
  expect(titles(visibleChanges(SAMPLE, 'legacy-export', 'all', 'name'))).toEqual(['Legacy export cleanup'])
  expect(visibleChanges(SAMPLE, 'nothing', 'all', 'name')).toEqual([])
})

test('the filter keeps archived open tasks findable', () => {
  expect(titles(visibleChanges(SAMPLE, '', 'open', 'name'))).toEqual(['Dark mode', 'Google sign-in', 'Legacy export cleanup'])
  expect(titles(visibleChanges(SAMPLE, '', 'archived', 'name'))).toEqual(['Legacy export cleanup'])
  expect(titles(visibleChanges(SAMPLE, '', 'active', 'name'))).toEqual(['Dark mode', 'Google sign-in', 'Search caching'])
})

test('sorting puts "Tasks not defined" after 0% done', () => {
  expect(titles(visibleChanges(SAMPLE, '', 'all', 'progress'))).toEqual(['Google sign-in', 'Legacy export cleanup', 'Dark mode', 'Search caching'])
  expect(titles(visibleChanges(SAMPLE, '', 'all', 'recent'))).toEqual(['Google sign-in', 'Search caching', 'Dark mode', 'Legacy export cleanup'])
  expect(titles(visibleChanges(SAMPLE, '', 'all', 'open'))[0]).toBe('Dark mode')
})

const PANE = {
  plugin: 'fishman-sdlc',
  component: 'Pane',
  requestId: 'openspec',
  props: {
    title: 'OpenSpec',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const BOARD: Board = { found: 'ok', touched: [], changes: SAMPLE }
const VIEW: BoardView = { tab: 'changes', sel: null, doc: null, file: 0, filter: 'all', showArchived: true, showDone: false, hint: '', search: '', show: 'all', sort: 'name' }

const seed = (on: Parameters<TestBody>[1], boardValue: Board, viewValue: BoardView) => {
  on('state.get', (_, e, next) => {
    const key = (e as { key?: string }).key
    if (key === 'board') return { value: { value: { shape: 'board-2', value: boardValue }, version: 1 } }
    if (key === 'view') return { value: { value: { shape: 'view-3', value: viewValue }, version: 1 } }
    return next(e)
  })
}

test('the board draws its columns, search, filter and sort, on every surface', async ($, on) => {
  seed(on, BOARD, VIEW)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Implementation started 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 unfinished task/ })).toBeDefined()
    // Its own line, as "Tasks 4 / 5" is: run into the title, the space before it was lost.
    expect(await ui.find({ type: 'Text', text: /^Tasks not defined$/ })).toBeDefined()
    expect(await ui.find({ key: 'search' })).toBeDefined()
    expect(await ui.find({ key: 'show' })).toBeDefined()
    expect(await ui.find({ key: 'sort' })).toBeDefined()
    await ui.unmount()
  }
})

test('a search hides the other Changes and says how many show', async ($, on) => {
  seed(on, BOARD, { ...VIEW, search: 'dark' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /^1 of 4 Changes$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Implementation started/ })).toBeUndefined()
  await ui.unmount()
})

test('the detail view shows a custom schema documents, on every surface', async ($, on) => {
  const status = parseStatus(RAPID_STATUS)
  if (!status) throw new Error('no status')
  const typo = change({ key: 'fix-typo', id: 'fix-typo', title: 'Fix the typo', dir: '/r/openspec/changes/fix-typo', source: 'cli', ...status, tasks: done(1, 2) })
  seed(on, { ...BOARD, changes: [typo] }, { ...VIEW, sel: 'fix-typo', doc: 'brief' })
  on('fs.read', () => ({ value: '# Fix the typo\n\nThe price label says "Montly".' }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'doc-brief' })).toBeDefined()
    expect(await ui.find({ key: 'doc-checklist' })).toBeDefined()
    expect(await ui.find({ key: 'doc-design' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^Schema: rapid$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 of 2 tasks checked/ })).toBeDefined()
    // Started: Revise plan is the only agent action.
    expect(await ui.find({ key: 'act-0', text: 'Revise plan' })).toBeDefined()
    expect(await ui.find({ key: 'act-1' })).toBeUndefined()
    expect(await ui.find({ key: 'copy-doc' })).toBeDefined()
    expect((await ui.find({ key: 'open-file' })) === undefined).toBe(surface === 'mobile')
    await ui.unmount()
  }
})

test('task checkboxes draw as ☐ and ☑, code spans kept', () => {
  expect(taskMarkdown('## 1. Work\n- [x] 1.1 Write `phone.ts`\n  - [ ] nested\n- [X] done\nNot [ ] a task')).toBe(
    '## 1. Work\n- ☑ 1.1 Write `phone.ts`\n  - ☐ nested\n- ☑ done\nNot [ ] a task',
  )
  expect(taskListMarkdown(parseTasks(TASKS).slice(1))).toBe('- ☑ **1.2** Add the callback route\n- ☐ **2.1** Add the button')
})

test('the X goes back from a Change and closes from the list', () => {
  expect(closeGoesBack('person', 'c')).toBe(true)
  expect(closeGoesBack('person', null)).toBe(false)
  expect(closeGoesBack('plugin', 'c')).toBe(false)
  expect(closeGoesBack('unload', 'c')).toBe(false)
})

test('a ready Change offers Start implementing and Revise plan; the back button leads', async ($, on) => {
  const ready = change({ key: 'd', id: 'add-dark-mode', title: 'Dark mode', tasks: done(0, 3) })
  seed(on, { ...BOARD, changes: [ready] }, { ...VIEW, sel: 'd', doc: 'tasks' })
  on('fs.read', () => ({ value: '## 1. Work\n- [ ] 1.1 Add `dark.css`\n' }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'back' })).toBeDefined()
  expect(await ui.find({ key: 'tab-changes' })).toBeUndefined()
  expect(await ui.find({ key: 'act-0', text: 'Start implementing' })).toBeDefined()
  expect(await ui.find({ key: 'act-1', text: 'Revise plan' })).toBeDefined()
  expect(await ui.find({ type: 'Markdown', text: /☐ 1\.1 Add `dark\.css`/ })).toBeDefined()
  await ui.unmount()
})

test('the Tasks tab groups open tasks per Change and hides checked ones', async ($, on) => {
  seed(on, BOARD, { ...VIEW, tab: 'tasks' })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ key: 'tasks-open-g' })).toBeDefined()
  expect(await ui.find({ key: 'tasklist-open-g' })).toBeDefined()
  expect(await ui.find({ key: 'tasklist-done-g' })).toBeUndefined()
  expect(await ui.find({ type: 'Markdown', text: /☐ \*\*1\.5\*\* task 5/ })).toBeDefined()
  await ui.unmount()
})
