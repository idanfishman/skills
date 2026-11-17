import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Board, BoardChange, BoardDoc, BoardView } from '../types'
import { COLUMNS, columnOf, countOf, parseTasks, progressOf, summaryOf, titleOf } from './openspec'

const PANE = 'openspec'
const POLL_MS = 5000
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const DOCS: readonly { id: BoardDoc; label: string }[] = [
  { id: 'proposal', label: 'Proposal' },
  { id: 'specs', label: 'Specs' },
  { id: 'design', label: 'Design' },
  { id: 'tasks', label: 'Tasks' },
]

const EMPTY_BOARD: Board = { found: 'unknown', changes: [], touched: [] }
const START_VIEW: BoardView = { tab: 'changes', sel: null, doc: 'proposal', spec: 0, filter: 'all', showArchived: true, hint: '' }
const board = atom({ plugin: 'fishman-sdlc', key: 'board' } as const, EMPTY_BOARD, { shape: 'board-1' })
const view = atom({ plugin: 'fishman-sdlc', key: 'view' } as const, START_VIEW, { shape: 'view-1' })

async function specFiles($: EngineInterface, dir: string): Promise<string[]> {
  const entries = await $.fs.list(dir)
  const found = await Promise.all(
    entries
      .filter(entry => entry.kind === 'dir')
      .map(async entry => ((await $.fs.exists(`${dir}/${entry.name}/spec.md`)) ? `${entry.name}/spec.md` : null)),
  )
  return found.filter((file): file is string => file !== null).sort()
}

async function readChange($: EngineInterface, parent: string, name: string, isArchived: boolean): Promise<BoardChange> {
  const dir = `${parent}/${name}`
  const [hasProposal, hasDesign, hasTasks, hasSpecs] = await Promise.all(
    ['proposal.md', 'design.md', 'tasks.md', 'specs'].map(file => $.fs.exists(`${dir}/${file}`)),
  )
  const [proposal, tasksText, specs] = await Promise.all([
    hasProposal ? $.fs.read(`${dir}/proposal.md`) : Promise.resolve(''),
    hasTasks ? $.fs.read(`${dir}/tasks.md`) : Promise.resolve(null),
    hasSpecs ? specFiles($, `${dir}/specs`) : Promise.resolve([]),
  ])
  return {
    key: isArchived ? `archive/${name}` : name,
    id: name,
    title: titleOf(proposal, name),
    dir,
    isArchived,
    hasProposal: hasProposal === true,
    hasDesign: hasDesign === true,
    specs,
    tasks: tasksText === null ? null : parseTasks(tasksText),
  }
}

async function scan($: EngineInterface): Promise<Pick<Board, 'found' | 'changes'>> {
  const root = await $.session.root()
  if (!(await $.fs.exists(`${root}/openspec`))) return { found: 'none', changes: [] }
  const changesDir = `${root}/openspec/changes`
  const listIn = async (dir: string, isArchived: boolean) => {
    if (!(await $.fs.exists(dir))) return []
    const entries = await $.fs.list(dir)
    return Promise.all(
      entries
        .filter(entry => entry.kind === 'dir' && entry.name !== 'archive')
        .map(entry => readChange($, dir, entry.name, isArchived)),
    )
  }
  const [active, archived] = await Promise.all([listIn(changesDir, false), listIn(`${changesDir}/archive`, true)])
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

async function refresh($: EngineInterface): Promise<void> {
  const next = await scan($)
  const prev = await read($, board)
  if (prev.found === next.found && JSON.stringify(prev.changes) === JSON.stringify(next.changes)) return
  await update($, board, current => ({ ...current, ...next }))
  if (prev.found !== 'ok') return
  for (const note of differences(prev.changes, next.changes).slice(0, 3)) $.ui.toast(`OpenSpec: ${note}`)
}

function changeKeyOfPath(path: string): string | null {
  const match = /\/openspec\/changes\/(archive\/)?([^/]+)\//.exec(path)
  if (!match?.[2] || match[2] === 'archive') return null
  return match[1] ? `archive/${match[2]}` : match[2]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'openspec', description: 'Show the OpenSpec board for this repository' })
    await refresh($)
    if ((await read($, board)).found === 'ok') void $.ui.open({ id: PANE, title: 'OpenSpec' })
    $.clock.every(POLL_MS, () => {
      void refresh($)
    })
    return next(e)
  })

  on('command.run', { command: 'openspec' }, async $ => {
    await refresh($)
    await $.ui.open({ id: PANE, title: 'OpenSpec' })
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
    const { Box, Text, Button, Select, Markdown, Progress, Link } = $.ui.resolve(e)
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
      const has: Record<BoardDoc, boolean> = { proposal: cur.hasProposal, specs: cur.specs.length > 0, design: cur.hasDesign, tasks: cur.tasks !== null }
      const specIndex = Math.min(v.spec, Math.max(0, cur.specs.length - 1))
      const fileOf: Record<BoardDoc, string> = { proposal: 'proposal.md', specs: `specs/${cur.specs[specIndex] ?? ''}`, design: 'design.md', tasks: 'tasks.md' }
      const filePath = `${cur.dir}/${fileOf[v.doc]}`
      let text = ''
      if (has[v.doc] && v.doc !== 'tasks') {
        try {
          text = await $.fs.read(filePath)
        } catch {
          text = ''
        }
      }
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

      return (
        <Box flexDirection="column" gap="sm">
          {tabs}
          <Box flexDirection="row" gap="sm">
            <Button key="back" label={`← ${v.tab === 'tasks' ? 'Tasks' : 'Changes'}`} onPress={setView({ sel: null, hint: '' })} />
            {prev ? <Button key="prev" label="Previous" onPress={setView({ sel: prev.key, hint: '' })} /> : null}
            {nextChange ? <Button key="next" label="Next" onPress={setView({ sel: nextChange.key, hint: '' })} /> : null}
          </Box>
          <Box flexDirection="column" gap="xs">
            <Text size="heading" bold>{cur.title}</Text>
            <Text mono dimColor>{cur.id}</Text>
            <Text>
              {p.hasTasks ? `${p.done} of ${p.total} tasks checked` : 'Tasks not defined'} · {columnLabel(cur)}
            </Text>
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
            {DOCS.map(doc => (
              <Button
                key={`doc-${doc.id}`}
                variant={v.doc === doc.id ? 'primary' : 'secondary'}
                label={has[doc.id] ? doc.label : `${doc.label} · missing`}
                onPress={setView({ doc: doc.id, spec: 0, hint: '' })}
              />
            ))}
          </Box>
          {v.doc === 'specs' && cur.specs.length > 1 ? (
            <Select
              key="spec-file"
              label="File"
              value={String(specIndex)}
              options={cur.specs.map((file, i) => ({ value: String(i), label: file }))}
              onSelect={value => {
                void update($, view, current => ({ ...current, spec: Number(value) }))
              }}
            />
          ) : null}
          <Text mono dimColor>{`${fileOf[v.doc]} · read-only`}</Text>
          {has[v.doc] ? null : (
            <Box borderStyle="dashed" borderDimColor paddingX={1}>
              <Text dimColor>
                {v.doc === 'tasks'
                  ? 'This Change has no tasks.md yet, so its tasks are not defined. That is not 0% done.'
                  : `This Change has no ${fileOf[v.doc]} yet.`}
              </Text>
            </Box>
          )}
          {has[v.doc] && v.doc !== 'tasks' ? <Markdown key="doc" text={text || '(empty file)'} /> : null}
          {v.doc === 'tasks' && cur.tasks ? (
            <Box flexDirection="column" gap="xs">
              {cur.tasks.length === 0 ? <Text dimColor>tasks.md has no checkboxes yet.</Text> : null}
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
                <Button key={`task-${c.key}-${i}`} plain onPress={setView({ sel: c.key, doc: 'tasks', hint: '' })}>
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
          {undefinedTitles.length ? <Text dimColor>{`No tasks.md yet: ${undefinedTitles.join(', ')}`}</Text> : null}
          {group('Open', false)}
          {group('Completed', true)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap="sm">
        {tabs}
        {COLUMNS.map(col => {
          const list = b.changes.filter(c => columnOf(c) === col.id)
          return (
            <Box flexDirection="column" gap="xs" paddingTop={1}>
              <Text bold>{`${col.label} ${list.length}`}</Text>
              {list.length === 0 ? <Text dimColor>None</Text> : null}
              {list.map(c => (
                <Box flexDirection="column">
                  <Button key={`open-${c.key}`} plain onPress={setView({ sel: c.key, doc: v.doc, spec: 0, hint: '' })}>
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
      </Box>
    )
  })
}
