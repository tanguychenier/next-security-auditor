/**
 * Walks independent work concurrently, never more than `limit` at a time.
 *
 * MEASURED ON A LIVE RUN: four surface entries took nearly five minutes,
 * because every entry waited for the one before it. Entries are independent —
 * a different file, a different question — so the limit was our own loop.
 *
 * The bound is deliberate. A subscription has rate limits, and a hunt that
 * trips them fails in a way the reader blames on the tool, not on their plan.
 */
export const inFlightBounded = async <In, Out>(
  items: readonly In[],
  limit: number,
  work: (item: In, index: number) => Promise<Out>,
): Promise<Out[]> => {
  const answers = new Array<Out>(items.length)
  let next = 0

  // ANSWERS COME BACK IN THE ORDER THEY WERE ASKED, whatever finishes first: a
  // report whose order changes between runs is a report nobody can diff.
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = next
      next += 1
      const item = items[index]
      if (index >= items.length || item === undefined) return
      answers[index] = await work(item, index)
    }
  }

  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker))

  return answers
}
