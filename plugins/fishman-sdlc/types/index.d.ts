export type BoardTask = { num: string; text: string; isDone: boolean; section: string }

export type BoardDoc = { id: string; pattern: string; status: string; files: string[] }

export type BoardChange = {
  key: string
  id: string
  title: string
  dir: string
  isArchived: boolean
  schema: string
  source: 'cli' | 'files'
  docs: BoardDoc[]
  isPlanningComplete: boolean
  taskDoc: string | null
  tasks: BoardTask[] | null
  updatedAt: number
}

export type Board = {
  found: 'unknown' | 'none' | 'ok'
  changes: BoardChange[]
  // Change keys Claude edited a file of in this session: live session data, never inferred from checkboxes.
  touched: string[]
}

export type BoardView = {
  tab: 'changes' | 'tasks'
  sel: string | null
  // A document id from the Change's schema; null shows its first document.
  doc: string | null
  file: number
  filter: string
  showArchived: boolean
  hint: string
  // The Changes view's search, filter and sort.
  search: string
  show: 'all' | 'active' | 'open' | 'archived'
  sort: 'name' | 'recent' | 'progress' | 'open'
}

declare module 'claude-code' {
  interface PluginState {
    'fishman-sdlc': { board: Shaped<Board>; view: Shaped<BoardView> }
  }
}
