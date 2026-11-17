import { expect, test } from 'claude-code/testing'

import type { Board } from '../types'
import { columnOf, countOf, parseTasks, summaryOf, titleOf } from '../hooks/openspec'
import type { Change } from '../hooks/openspec'

const TASKS = `# Tasks

## 1. OAuth client

- [x] 1.1 Register the OAuth client
- [X] 1.2 Add the callback route

## 2. Sign-in screen

- [ ] 2.1 Add the button
`

const change = (patch: Partial<Change>): Change => ({
  key: 'c',
  id: 'c',
  title: 'C',
  dir: '/r/openspec/changes/c',
  isArchived: false,
  hasProposal: true,
  hasDesign: true,
  specs: ['auth/spec.md'],
  tasks: [],
  ...patch,
})

const done = (n: number, total: number) =>
  Array.from({ length: total }, (_, i) => ({ num: `1.${i + 1}`, text: `task ${i + 1}`, isDone: i < n, section: '1. Work' }))

test('tasks.md checkboxes parse with their number and section', () => {
  const tasks = parseTasks(TASKS)
  expect(tasks.length).toBe(3)
  expect(tasks[1]).toEqual({ num: '1.2', text: 'Add the callback route', isDone: true, section: '1. OAuth client' })
  expect(tasks[2]?.isDone).toBe(false)
  expect(tasks[2]?.section).toBe('2. Sign-in screen')
})

test('columns follow the board rules', () => {
  expect(columnOf(change({ tasks: null, hasDesign: false }))).toBe('planning')
  expect(columnOf(change({ tasks: done(0, 8) }))).toBe('ready')
  expect(columnOf(change({ tasks: done(4, 5) }))).toBe('started')
  expect(columnOf(change({ tasks: done(6, 6) }))).toBe('complete')
  expect(columnOf(change({ tasks: done(7, 7), isArchived: true }))).toBe('archived')
})

test('an archived 4 / 5 Change keeps its count and its unfinished task', () => {
  const archived = change({ tasks: done(4, 5), isArchived: true })
  expect(countOf(archived)).toBe('4 / 5')
  expect(summaryOf(archived)).toEqual({ text: '1 unfinished task', isWarning: true })
})

test('a missing tasks.md is "Tasks not defined", never 0%', () => {
  const planning = change({ tasks: null, hasDesign: false })
  expect(countOf(planning)).toBe('Tasks not defined')
  expect(summaryOf(planning).text).toBe('No design.md or tasks.md')
})

test('a generic proposal heading falls back to the folder name', () => {
  expect(titleOf('# Proposal\n\n## Why', 'add-google-sign-in')).toBe('Add google sign in')
  expect(titleOf('# Proposal', '2026-11-14-pin-cloud-cli-tools')).toBe('Pin cloud cli tools')
  expect(titleOf('# Add Google sign-in\n', 'x')).toBe('Add Google sign-in')
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

const BOARD: Board = {
  found: 'ok',
  touched: [],
  changes: [
    change({ key: 'add-google-sign-in', id: 'add-google-sign-in', title: 'Google sign-in', tasks: done(4, 5) }),
    change({ key: 'cache-search-results', id: 'cache-search-results', title: 'Search caching', hasDesign: false, tasks: null }),
    change({ key: 'archive/2026-10-02-remove-legacy-export', id: '2026-10-02-remove-legacy-export', title: 'Legacy export cleanup', isArchived: true, tasks: done(4, 5) }),
  ],
}

test('the board draws its columns and the archived unfinished task, on every surface', async ($, on) => {
  on('state.get', (_, e, next) =>
    (e as { key?: string }).key === 'board' ? { value: { value: { shape: 'board-1', value: BOARD }, version: 1 } } : next(e),
  )
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /Implementation started 1/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 unfinished task/ })).toBeDefined()
    // Its own line, as "Tasks 4 / 5" is: run into the title, the space before it was lost.
    expect(await ui.find({ type: 'Text', text: /^Tasks not defined$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the detail view reads a spec and offers actions, on every surface', async ($, on) => {
  const google = { ...BOARD.changes[0]!, specs: ['google-oauth/spec.md', 'session/spec.md'] }
  const view = { tab: 'changes', sel: 'add-google-sign-in', doc: 'specs', spec: 1, filter: 'all', showArchived: true, hint: '' }
  on('state.get', (_, e, next) => {
    const key = (e as { key?: string }).key
    if (key === 'board') return { value: { value: { shape: 'board-1', value: { ...BOARD, changes: [google] } }, version: 1 } }
    if (key === 'view') return { value: { value: { shape: 'view-1', value: view }, version: 1 } }
    return next(e)
  })
  on('fs.read', () => ({ value: '## MODIFIED Requirements\n\n### Requirement: Session start' }))
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /4 of 5 tasks checked/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /specs\/session\/spec\.md · read-only/ })).toBeDefined()
    expect(await ui.find({ key: 'act-0' })).toBeDefined()
    await ui.unmount()
  }
})
