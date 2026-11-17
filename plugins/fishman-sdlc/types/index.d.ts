export type BoardTask = { num: string; text: string; isDone: boolean; section: string }

export type BoardChange = {
  key: string
  id: string
  title: string
  dir: string
  isArchived: boolean
  hasProposal: boolean
  hasDesign: boolean
  specs: string[]
  tasks: BoardTask[] | null
}

export type Board = {
  found: 'unknown' | 'none' | 'ok'
  changes: BoardChange[]
  // Change keys Claude edited a file of in this session: live session data, never inferred from checkboxes.
  touched: string[]
}

export type BoardDoc = 'proposal' | 'specs' | 'design' | 'tasks'

export type BoardView = {
  tab: 'changes' | 'tasks'
  sel: string | null
  doc: BoardDoc
  spec: number
  filter: string
  showArchived: boolean
  hint: string
}

declare module 'claude-code' {
  interface PluginState {
    'fishman-sdlc': { board: Shaped<Board>; view: Shaped<BoardView> }
  }
}
