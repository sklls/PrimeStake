import { describe, it, expect } from 'vitest'
import { TapQueue } from './tap-queue'

/** A save we can finish by hand, to control the order things happen in. */
function controllable() {
  const calls: { item: string; finish: (ok: boolean) => void; fail: (e: unknown) => void }[] = []
  let active = 0
  let maxActive = 0
  const run = (item: string) => new Promise<boolean>((resolve, reject) => {
    active++
    maxActive = Math.max(maxActive, active)
    calls.push({
      item,
      finish: ok => { active--; resolve(ok) },
      fail: e => { active--; reject(e) },
    })
  })
  return { calls, run, maxActive: () => maxActive }
}
const tick = () => new Promise(r => setTimeout(r, 0))

describe('TapQueue', () => {
  it('saves taps in the order they were made', async () => {
    const c = controllable()
    const q = new TapQueue({ run: c.run })
    q.push('1'); q.push('4'); q.push('6')
    for (let i = 0; i < 3; i++) { await tick(); c.calls[i].finish(true) }
    await q.whenIdle()
    expect(c.calls.map(x => x.item)).toEqual(['1', '4', '6'])
  })

  it('never sends two saves at once', async () => {
    const c = controllable()
    const q = new TapQueue({ run: c.run })
    q.push('a'); q.push('b'); q.push('c')
    await tick()
    expect(c.calls).toHaveLength(1)
    c.calls[0].finish(true); await tick()
    c.calls[1].finish(true); await tick()
    c.calls[2].finish(true)
    await q.whenIdle()
    expect(c.maxActive()).toBe(1)
  })

  it('keeps a tap made while another is still saving, instead of losing it', async () => {
    const c = controllable()
    const q = new TapQueue({ run: c.run })
    q.push('first')
    await tick()
    q.push('second')                  // tapped mid-save
    c.calls[0].finish(true); await tick()
    c.calls[1].finish(true)
    await q.whenIdle()
    expect(c.calls.map(x => x.item)).toEqual(['first', 'second'])
  })

  it('counts what is still to be saved, the running one included', async () => {
    const c = controllable()
    const seen: number[] = []
    const q = new TapQueue({ run: c.run, onChange: n => seen.push(n) })
    q.push('a'); q.push('b')
    expect(q.pending).toBe(2)
    await tick(); c.calls[0].finish(true); await tick()
    expect(q.pending).toBe(1)
    c.calls[1].finish(true)
    await q.whenIdle()
    expect(q.pending).toBe(0)
    expect(seen[seen.length - 1]).toBe(0)
  })

  it('drops the taps behind a refused one, and says how many', async () => {
    const c = controllable()
    const dropped: number[] = []
    const q = new TapQueue({ run: c.run, onDrop: n => dropped.push(n) })
    q.push('ok'); q.push('refused'); q.push('later-1'); q.push('later-2')
    await tick(); c.calls[0].finish(true)
    await tick(); c.calls[1].finish(false)
    await q.whenIdle()
    expect(c.calls.map(x => x.item)).toEqual(['ok', 'refused'])
    expect(dropped).toEqual([2])
    expect(q.pending).toBe(0)
  })

  it('treats a save that throws, such as no connection, as refused', async () => {
    const c = controllable()
    const dropped: number[] = []
    const q = new TapQueue({ run: c.run, onDrop: n => dropped.push(n) })
    q.push('x'); q.push('y')
    await tick(); c.calls[0].fail(new Error('offline'))
    await q.whenIdle()
    expect(c.calls.map(x => x.item)).toEqual(['x'])
    expect(dropped).toEqual([1])
  })

  it('accepts taps again after a refusal', async () => {
    const c = controllable()
    const q = new TapQueue({ run: c.run })
    q.push('refused')
    await tick(); c.calls[0].finish(false)
    await q.whenIdle()
    q.push('fresh')
    await tick(); c.calls[1].finish(true)
    await q.whenIdle()
    expect(c.calls.map(x => x.item)).toEqual(['refused', 'fresh'])
  })

  it('is idle straight away when nothing was tapped', async () => {
    const q = new TapQueue<string>({ run: async () => true })
    await expect(q.whenIdle()).resolves.toBeUndefined()
    expect(q.running).toBe(false)
  })
})
