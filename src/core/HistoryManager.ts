import type { HistoryEntry } from './types'

const MAX_HISTORY = 30

export class HistoryManager {
  private stack: HistoryEntry[] = []
  private pointer = -1

  push(entry: HistoryEntry) {
    // Drop redo history when a new action is taken
    this.stack = this.stack.slice(0, this.pointer + 1)
    this.stack.push(entry)
    if (this.stack.length > MAX_HISTORY) {
      this.stack.shift()
    }
    this.pointer = this.stack.length - 1
  }

  undo(): HistoryEntry | null {
    if (this.pointer <= 0) return null
    this.pointer--
    return this.stack[this.pointer]
  }

  redo(): HistoryEntry | null {
    if (this.pointer >= this.stack.length - 1) return null
    this.pointer++
    return this.stack[this.pointer]
  }

  canUndo() {
    return this.pointer > 0
  }

  canRedo() {
    return this.pointer < this.stack.length - 1
  }

  current(): HistoryEntry | null {
    return this.stack[this.pointer] ?? null
  }

  clear() {
    this.stack = []
    this.pointer = -1
  }
}
