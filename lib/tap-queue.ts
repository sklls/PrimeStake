// ── Taps waiting to be saved, one at a time, in order ──────
// A referee taps faster than a save completes. Rather than disabling the
// buttons until each save returns (which silently swallowed taps), taps queue
// here and are sent strictly one after another, so each names the version the
// previous one produced.
//
// If the server refuses one, the taps behind it are dropped rather than
// applied on top of a refusal (they were made assuming it succeeded), and the
// caller is told how many so the referee can re-enter them knowingly.

export interface TapQueueOptions<T> {
  /** Save one tap. Resolve true if accepted, false if refused; a throw counts as refused. */
  run: (item: T) => Promise<boolean>
  /** Taps still to be saved, the running one included. */
  onChange?: (pending: number) => void
  /** How many queued taps were dropped after a refusal. */
  onDrop?: (count: number) => void
}

export class TapQueue<T> {
  private items: T[] = []
  private active = false
  private idleWaiters: (() => void)[] = []

  constructor(private readonly opts: TapQueueOptions<T>) {}

  get pending(): number { return this.items.length }
  get running(): boolean { return this.active }

  push(item: T): void {
    this.items.push(item)
    this.opts.onChange?.(this.items.length)
    void this.pump()
  }

  whenIdle(): Promise<void> {
    if (!this.active && this.items.length === 0) return Promise.resolve()
    return new Promise(resolve => this.idleWaiters.push(resolve))
  }

  private async pump() {
    if (this.active) return
    this.active = true
    while (this.items.length) {
      let ok = false
      try { ok = await this.opts.run(this.items[0]) } catch { ok = false }
      this.items.shift()
      if (!ok && this.items.length) {
        const dropped = this.items.length
        this.items = []
        this.opts.onDrop?.(dropped)
      }
      this.opts.onChange?.(this.items.length)
    }
    this.active = false
    const waiters = this.idleWaiters
    this.idleWaiters = []
    waiters.forEach(w => w())
  }
}
