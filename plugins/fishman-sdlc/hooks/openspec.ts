/** Pure rules for reading an OpenSpec Change: no `$`, so tests run them directly. */

export type Task = { num: string; text: string; isDone: boolean; section: string }

/** One document the Change's schema asks for. `files` are absolute paths that exist. */
export type Doc = { id: string; pattern: string; status: string; files: string[] }

export type Change = {
  key: string
  id: string
  title: string
  dir: string
  isArchived: boolean
  schema: string
  // 'cli': `openspec status` resolved the schema. 'files': the default spec-driven layout, read from disk.
  source: 'cli' | 'files'
  docs: Doc[]
  isPlanningComplete: boolean
  // The document whose checkboxes are the tasks: the one the schema's apply step requires.
  taskDoc: string | null
  // null: the task document is missing. An empty list: it has no checkboxes.
  tasks: Task[] | null
  // The newest change to any file of the Change, in ms since the epoch.
  updatedAt: number
}

export type ShowFilter = 'all' | 'active' | 'open' | 'archived'
export type SortOrder = 'name' | 'recent' | 'progress' | 'open'

export const SHOW_OPTIONS: readonly { value: ShowFilter; label: string }[] = [
  { value: 'all', label: 'All Changes' },
  { value: 'active', label: 'Not archived' },
  { value: 'open', label: 'With open tasks' },
  { value: 'archived', label: 'Archived' },
]

export const SORT_OPTIONS: readonly { value: SortOrder; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'recent', label: 'Recently changed' },
  { value: 'progress', label: 'Most done' },
  { value: 'open', label: 'Most open tasks' },
]

export type ColumnId = 'planning' | 'ready' | 'started' | 'complete' | 'archived'

export const COLUMNS: readonly { id: ColumnId; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'ready', label: 'Ready to implement' },
  { id: 'started', label: 'Implementation started' },
  { id: 'complete', label: 'Tasks complete' },
  { id: 'archived', label: 'Archived' },
]

/** The default schema's documents, for a Change the CLI can't read (archived, or no CLI). */
export const SPEC_DRIVEN: readonly { id: string; pattern: string }[] = [
  { id: 'proposal', pattern: 'proposal.md' },
  { id: 'specs', pattern: 'specs/**/*.md' },
  { id: 'design', pattern: 'design.md' },
  { id: 'tasks', pattern: 'tasks.md' },
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

export type Status = Pick<Change, 'schema' | 'docs' | 'isPlanningComplete' | 'taskDoc'>

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string')

/** Reads `openspec status --change <id> --json`; null when the output is not that shape. */
export function parseStatus(stdout: string): Status | null {
  let json: unknown
  try {
    json = JSON.parse(stdout)
  } catch {
    return null
  }
  if (typeof json !== 'object' || json === null) return null
  const { schemaName, isPlanningComplete, applyRequires, artifacts, artifactPaths } = json as Record<string, unknown>
  if (typeof schemaName !== 'string' || typeof isPlanningComplete !== 'boolean' || !Array.isArray(artifacts)) return null
  const paths = typeof artifactPaths === 'object' && artifactPaths !== null ? (artifactPaths as Record<string, unknown>) : {}
  const docs: Doc[] = []
  for (const artifact of artifacts) {
    if (typeof artifact !== 'object' || artifact === null) return null
    const { id, outputPath, status } = artifact as Record<string, unknown>
    if (typeof id !== 'string' || typeof outputPath !== 'string') return null
    const existing = (paths[id] as { existingOutputPaths?: unknown } | undefined)?.existingOutputPaths
    docs.push({
      id,
      pattern: outputPath,
      status: typeof status === 'string' ? status : 'unknown',
      files: isStringList(existing) ? [...existing].sort() : [],
    })
  }
  const required = isStringList(applyRequires) ? applyRequires : []
  return {
    schema: schemaName,
    docs,
    isPlanningComplete,
    taskDoc: required.find(id => docs.some(doc => doc.id === id)) ?? null,
  }
}

/** A schema's documents and its task document, without any one Change's files. */
export type Layout = { schema: string; docs: { id: string; pattern: string }[]; taskDoc: string | null }

export const SPEC_DRIVEN_LAYOUT: Layout = { schema: 'spec-driven', docs: [...SPEC_DRIVEN], taskDoc: 'tasks' }

export function layoutOf(status: Status): Layout {
  return { schema: status.schema, docs: status.docs.map(doc => ({ id: doc.id, pattern: doc.pattern })), taskDoc: status.taskDoc }
}

/** `brief.md` matches itself; `specs/**\/*.md` matches any `.md` file under `specs/`. */
export function matchesPattern(pattern: string, relativePath: string): boolean {
  const glob = pattern.indexOf('*')
  if (glob === -1) return relativePath === pattern
  const extension = pattern.slice(pattern.lastIndexOf('*') + 1)
  return relativePath.startsWith(pattern.slice(0, glob)) && relativePath.endsWith(extension)
}

/**
 * A Change's documents from its files, for a Change the CLI does not read.
 * With `skipsSpecs` (`skip_specs: true` in its .openspec.yaml), a missing document under specs/ is skipped, as the CLI says.
 */
export function statusFromFiles(layout: Layout, dir: string, files: string[], skipsSpecs = false): Status {
  const docs = layout.docs.map(doc => {
    const found = files.filter(file => file.startsWith(`${dir}/`) && matchesPattern(doc.pattern, file.slice(dir.length + 1))).sort()
    let status = found.length ? 'done' : 'missing'
    if (!found.length && skipsSpecs && doc.pattern.startsWith('specs/')) status = 'skipped'
    return { id: doc.id, pattern: doc.pattern, status, files: found }
  })
  const isPlanningComplete = docs.every(doc => doc.files.length > 0 || doc.status === 'skipped')
  return { schema: layout.schema, docs, isPlanningComplete, taskDoc: layout.taskDoc }
}

export function skipsSpecsOf(changeYaml: string | null): boolean {
  return changeYaml !== null && /^skip_specs:\s*true\s*$/m.test(changeYaml)
}

/** A schema the board knows no layout for: each Markdown file at the top of the Change is a document. */
export function layoutFromFiles(schema: string, dir: string, files: string[]): Layout {
  const docs = files
    .filter(file => file.startsWith(`${dir}/`) && !file.slice(dir.length + 1).includes('/') && file.endsWith('.md'))
    .sort()
    .map(file => {
      const name = file.slice(dir.length + 1)
      return { id: name.slice(0, -'.md'.length), pattern: name }
    })
  if (files.some(file => file.startsWith(`${dir}/specs/`) && file.endsWith('.md'))) docs.push({ id: 'specs', pattern: 'specs/**/*.md' })
  return { schema, docs, taskDoc: null }
}

/** The `schema:` line of a Change's .openspec.yaml, else of openspec/config.yaml, else the default. */
export function schemaNameOf(...yamls: (string | null)[]): string {
  for (const yaml of yamls) {
    const name = yaml ? /^schema:\s*["']?([\w.-]+)/m.exec(yaml)?.[1] : undefined
    if (name) return name
  }
  return 'spec-driven'
}

const GENERIC_TITLES = new Set(['proposal', 'change proposal', 'why', 'brief'])

/** The first document's H1, unless it is a generic word; else the folder name in words. */
export function titleOf(firstDoc: string, id: string): string {
  const h1 = /^#\s+(.+)$/m.exec(firstDoc)?.[1]?.trim()
  if (h1 && !GENERIC_TITLES.has(h1.toLowerCase())) return h1
  const words = id.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `specs/**\/*.md` → `specs/`; a plain file name stays as it is. */
export function docName(doc: Doc): string {
  const glob = doc.pattern.indexOf('*')
  return glob === -1 ? doc.pattern : doc.pattern.slice(0, glob)
}

export function docLabel(doc: Doc): string {
  const words = doc.id.replace(/[-_]+/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function progressOf(change: Change): { done: number; total: number; hasTasks: boolean } {
  const tasks = change.tasks ?? []
  const done = tasks.filter(t => t.isDone).length
  return { done, total: tasks.length, hasTasks: tasks.length > 0 }
}

/** Documents the schema asks for that do not exist yet. A skipped one is not missing. */
export function missingDocs(change: Change): string[] {
  return change.docs.filter(doc => doc.files.length === 0 && doc.status !== 'skipped').map(docName)
}

/** The board's column: a UI mapping from the files, not an OpenSpec status. */
export function columnOf(change: Change): ColumnId {
  if (change.isArchived) return 'archived'
  const { done, total, hasTasks } = progressOf(change)
  if (!change.isPlanningComplete || !hasTasks) return 'planning'
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

/** Search, filter and sort for the board. Search matches the title or the folder name, ignoring case. */
export function visibleChanges(changes: Change[], search: string, show: ShowFilter, sort: SortOrder): Change[] {
  const query = search.trim().toLowerCase()
  const open = (c: Change) => (c.tasks ?? []).filter(t => !t.isDone).length
  const share = (c: Change) => {
    const p = progressOf(c)
    // A Change with no tasks sorts after one with 0 checked: "not defined" is not 0%.
    return p.hasTasks ? p.done / p.total : -1
  }
  const byName = (a: Change, b: Change) => a.title.localeCompare(b.title)
  const order: Record<SortOrder, (a: Change, b: Change) => number> = {
    name: byName,
    recent: (a, b) => b.updatedAt - a.updatedAt || byName(a, b),
    progress: (a, b) => share(b) - share(a) || byName(a, b),
    open: (a, b) => open(b) - open(a) || byName(a, b),
  }
  return changes
    .filter(c => !query || c.title.toLowerCase().includes(query) || c.id.toLowerCase().includes(query))
    .filter(c => {
      if (show === 'active') return !c.isArchived
      if (show === 'archived') return c.isArchived
      if (show === 'open') return open(c) > 0
      return true
    })
    .sort(order[sort])
}

export function countOf(change: Change): string {
  const { done, total, hasTasks } = progressOf(change)
  return hasTasks ? `${done} / ${total}` : 'Tasks not defined'
}

const BOX_LINE = /^(\s*[-*]\s+)\[([ xX])\](\s+)/

/** A task document's Markdown with each `[ ]` / `[x]` drawn as ☐ / ☑, since not every surface draws GFM checkboxes. */
export function taskMarkdown(text: string): string {
  return text
    .split('\n')
    .map(line => line.replace(BOX_LINE, (_, bullet: string, mark: string, space: string) => `${bullet}${mark === ' ' ? '☐' : '☑'}${space}`))
    .join('\n')
}

/** One Change's tasks as a Markdown list for the Tasks tab; the number in bold, code spans kept. */
export function taskListMarkdown(tasks: Task[]): string {
  return tasks.map(t => `- ${t.isDone ? '☑' : '☐'} ${t.num ? `**${t.num}** ` : ''}${t.text}`).join('\n')
}

/** A person's close of the pane goes back to the list while a Change is open; a close from the list closes it. */
export function closeGoesBack(origin: 'plugin' | 'person' | 'unload', sel: string | null): boolean {
  return origin === 'person' && sel !== null
}
