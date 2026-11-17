/** Pure rules for reading an OpenSpec Change from its files: no `$`, so tests run them directly. */

export type Task = { num: string; text: string; isDone: boolean; section: string }

export type Change = {
  key: string
  id: string
  title: string
  dir: string
  isArchived: boolean
  hasProposal: boolean
  hasDesign: boolean
  specs: string[]
  // null: tasks.md is missing. An empty list: tasks.md has no checkboxes.
  tasks: Task[] | null
}

export type ColumnId = 'planning' | 'ready' | 'started' | 'complete' | 'archived'

export const COLUMNS: readonly { id: ColumnId; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'ready', label: 'Ready to implement' },
  { id: 'started', label: 'Implementation started' },
  { id: 'complete', label: 'Tasks complete' },
  { id: 'archived', label: 'Archived' },
]

const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/
const NUMBERED = /^(\d+(?:\.\d+)*)\.?\s+(.*)$/
const HEADING = /^#{2,6}\s+(.*)$/

export function parseTasks(text: string): Task[] {
  const tasks: Task[] = []
  let section = ''
  for (const line of text.split('\n')) {
    const heading = HEADING.exec(line)
    if (heading) {
      section = (heading[1] ?? '').trim()
      continue
    }
    const box = CHECKBOX.exec(line)
    if (!box) continue
    const body = (box[2] ?? '').trim()
    const numbered = NUMBERED.exec(body)
    tasks.push({
      num: numbered?.[1] ?? '',
      text: numbered?.[2] ?? body,
      isDone: box[1] !== ' ',
      section,
    })
  }
  return tasks
}

const GENERIC_TITLES = new Set(['proposal', 'change proposal', 'why'])

/** The proposal's first H1, unless it is a generic word; else the folder name in words. */
export function titleOf(proposal: string, id: string): string {
  const h1 = /^#\s+(.+)$/m.exec(proposal)?.[1]?.trim()
  if (h1 && !GENERIC_TITLES.has(h1.toLowerCase())) return h1
  const words = id.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function progressOf(change: Change): { done: number; total: number; hasTasks: boolean } {
  const tasks = change.tasks ?? []
  const done = tasks.filter(t => t.isDone).length
  return { done, total: tasks.length, hasTasks: tasks.length > 0 }
}

export function missingDocs(change: Change): string[] {
  const missing: string[] = []
  if (!change.hasProposal) missing.push('proposal.md')
  if (change.specs.length === 0) missing.push('specs/')
  // shortcut: design.md counts as required, as the board's rules say; OpenSpec itself treats it as optional, so relax this if that misplaces real Changes.
  if (!change.hasDesign) missing.push('design.md')
  if (change.tasks === null) missing.push('tasks.md')
  return missing
}

/** The board's column: a UI mapping from the files, not an OpenSpec status. */
export function columnOf(change: Change): ColumnId {
  if (change.isArchived) return 'archived'
  const { done, total, hasTasks } = progressOf(change)
  if (missingDocs(change).length > 0 || !hasTasks) return 'planning'
  if (done === 0) return 'ready'
  return done < total ? 'started' : 'complete'
}

/** One short line under a card; archiving never hides unchecked tasks. */
export function summaryOf(change: Change): { text: string; isWarning: boolean } {
  const { done, total, hasTasks } = progressOf(change)
  const left = total - done
  if (!hasTasks) {
    const missing = missingDocs(change)
    return { text: missing.length ? `No ${missing.join(' or ')}` : 'Tasks not defined', isWarning: false }
  }
  if (change.isArchived && left > 0) {
    return { text: `${left} unfinished ${left === 1 ? 'task' : 'tasks'}`, isWarning: true }
  }
  if (change.isArchived) return { text: 'All checked', isWarning: false }
  if (left === 0) return { text: 'Not archived', isWarning: false }
  return { text: done === 0 ? 'None checked' : `${left} open`, isWarning: false }
}

export function countOf(change: Change): string {
  const { done, total, hasTasks } = progressOf(change)
  return hasTasks ? `${done} / ${total}` : 'Tasks not defined'
}
