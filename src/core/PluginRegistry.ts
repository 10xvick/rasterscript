import type { EditorPlugin } from './types'

/**
 * Central registry for all editor plugins.
 * Plugins are registered once at startup (or dynamically) and looked up by id.
 */
export class PluginRegistry {
  private plugins = new Map<string, EditorPlugin>()
  private order: string[] = []

  register(plugin: EditorPlugin) {
    if (this.plugins.has(plugin.id)) {
      console.warn(`[PluginRegistry] Plugin "${plugin.id}" is already registered — skipping.`)
      return
    }
    this.plugins.set(plugin.id, plugin)
    this.order.push(plugin.id)
  }

  unregister(id: string) {
    this.plugins.delete(id)
    this.order = this.order.filter(o => o !== id)
  }

  get(id: string): EditorPlugin | undefined {
    return this.plugins.get(id)
  }

  /** Returns plugins in registration order */
  getAll(): EditorPlugin[] {
    return this.order.map(id => this.plugins.get(id)!).filter(Boolean)
  }

  byCategory(category: EditorPlugin['category']): EditorPlugin[] {
    return this.getAll().filter(p => p.category === category)
  }

  has(id: string): boolean {
    return this.plugins.has(id)
  }
}

/** Singleton instance used across the app */
export const registry = new PluginRegistry()
