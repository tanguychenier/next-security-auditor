/**
 * MEASURED ON A LIVE RUN: four surface entries took nearly five minutes.
 *
 * Every entry is independent — a different file, a different question — so
 * walking them one at a time turns a hunt on a real project into an hour. The
 * limit is not the model, it is our own loop.
 *
 * Concurrency is bounded on purpose: a subscription has rate limits, and a
 * hunt that trips them fails in a way the reader will blame on the tool.
 */

import { describe, expect, it } from 'vitest'
import { inFlightBounded } from '../../src/application/use-cases/in-flight-bounded.js'

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

describe('walking independent work concurrently', () => {
  it('gives back the answers in the order it was asked, whatever finishes first', async () => {
    const answers = await inFlightBounded([30, 5, 10], 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return delay
    })

    expect(answers).toEqual([30, 5, 10])
  })

  it('never has more in flight than it was allowed', async () => {
    let running = 0
    let highest = 0

    await inFlightBounded([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      running += 1
      highest = Math.max(highest, running)
      await settle()
      running -= 1
      return null
    })

    expect(highest).toBe(3)
  })

  it('still walks everything when asked for one at a time', async () => {
    let highest = 0
    let running = 0

    const answers = await inFlightBounded([1, 2, 3], 1, async (value) => {
      running += 1
      highest = Math.max(highest, running)
      await settle()
      running -= 1
      return value * 2
    })

    expect(answers).toEqual([2, 4, 6])
    expect(highest).toBe(1)
  })

  it('lets one failure carry rather than swallowing it into a clean report', async () => {
    // A HUNT THAT LOST HALF ITS ENTRIES IN SILENCE would print a shorter,
    // cleaner report, which is the worst possible outcome.
    await expect(
      inFlightBounded([1, 2, 3], 2, async (value) => {
        if (value === 2) throw new Error('the model refused')
        return value
      }),
    ).rejects.toThrow('the model refused')
  })

  it('does nothing at all when there is nothing to walk', async () => {
    expect(await inFlightBounded([], 4, async () => 1)).toEqual([])
  })
})
