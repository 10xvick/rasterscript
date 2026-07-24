import type { FC, ElementType } from 'react'

/**
 * Layout Widget Registry.
 *
 * Every panel that can appear as a tab in the flexible layout registers itself
 * here. `LayoutEngine.tsx` reads from this registry instead of maintaining a
 * hardcoded `WIDGETS` object — so adding a new widget (e.g. a Video Timeline)
 * is a single `widgetRegistry.register(...)` call in the plugin's own file.
 *
 * Analogy: Blender's editor-type system — each editor registers its own type,
 * and the layout manager renders whichever type the user has assigned.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LayoutWidget {
  /** Unique stable identifier used in layout state (e.g. `"canvas"`, `"spritesheet_preview"`). */
  id: string
  /** Human-readable name shown in the tab bar and picker. */
  name: string
  /** Lucide icon (or any React element type) shown in the tab. */
  icon: ElementType
  /** The React component rendered inside the panel area. */
  Component: FC
}

// ─── Registry class ───────────────────────────────────────────────────────────

export class WidgetRegistry {
  private widgets = new Map<string, LayoutWidget>()
  private order:   string[] = []

  register(widget: LayoutWidget): void {
    if (this.widgets.has(widget.id)) {
      console.warn(`[WidgetRegistry] Widget "${widget.id}" already registered — skipping.`)
      return
    }
    this.widgets.set(widget.id, widget)
    this.order.push(widget.id)
  }

  unregister(id: string): void {
    this.widgets.delete(id)
    this.order = this.order.filter(o => o !== id)
  }

  get(id: string): LayoutWidget | undefined {
    return this.widgets.get(id)
  }

  /** Returns all registered widgets in registration order. */
  getAll(): LayoutWidget[] {
    return this.order.map(id => this.widgets.get(id)!).filter(Boolean)
  }

  has(id: string): boolean {
    return this.widgets.has(id)
  }
}

/** Singleton instance shared across the whole app. */
export const widgetRegistry = new WidgetRegistry()
