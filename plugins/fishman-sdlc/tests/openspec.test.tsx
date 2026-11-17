import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { Board, BoardView } from '../types'
import { columnOf, countOf, parseStatus, parseTasks, specDrivenStatus, summaryOf, titleOf, visibleChanges } from '../hooks/openspec'
import type { Change, Task } from '../hooks/openspec'

const TASKS = `# Tasks

## 1. OAuth client

- [x] 1.1 Register the OAuth client
- [X] 1.2 Add the callback route

## 2. Sign-in screen

- [ ] 2.1 Add the button
`

const DIR = '/r/openspec/changes/c'
const ALL_DOCS = specDrivenStatus({
  proposal: [`${DIR}/proposal.md`],
  specs: [`${DIR}/specs/auth/spec.md`],
  design: [`${DIR}/design.md`],
  tasks: [`${DIR}/tasks.md`],
})

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

const noDesignNoTasks = () =>
  specDrivenStatus({ proposal: [`${DIR}/proposal.md`], specs: [`${DIR}/specs/auth/spec.md`], design: [], tasks: [] })

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
const VIEW: BoardView = { tab: 'changes', sel: null, doc: null, file: 0, filter: 'all', showArchived: true, hint: '', search: '', show: 'all', sort: 'name' }

const seed = (on: Parameters<TestBody>[1], boardValue: Board, viewValue: BoardView) => {
  on('state.get', (_, e, next) => {
    const key = (e as { key?: string }).key
    if (key === 'board') return { value: { value: { shape: 'board-2', value: boardValue }, version: 1 } }
    if (key === 'view') return { value: { value: { shape: 'view-2', value: viewValue }, version: 1 } }
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
    expect(await ui.find({ key: 'act-0' })).toBeDefined()
    await ui.unmount()
  }
})
