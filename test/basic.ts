if (typeof performance === 'undefined') {
  global.performance = require('perf_hooks').performance
}

import t from 'tap'
import LRU from '../'
import { expose } from './fixtures/expose'

t.test('basic operation', t => {
  const c = new LRU({ max: 10 })
  for (let i = 0; i < 5; i++) {
    t.equal(c.set(i, i), c)
  }
  for (let i = 0; i < 5; i++) {
    t.equal(c.get(i), i)
  }
  t.equal(c.size, 5)
  t.matchSnapshot(c.entries())
  t.equal(
    c.getRemainingTTL(1),
    Infinity,
    'no ttl, so returns Infinity'
  )
  t.equal(
    c.getRemainingTTL('not in cache'),
    0,
    'not in cache, no ttl'
  )

  for (let i = 5; i < 10; i++) {
    c.set(i, i)
  }
  t.equal(c.size, 10)
  t.matchSnapshot(c.entries())

  for (let i = 0; i < 5; i++) {
    // this doesn't do anything, but shouldn't be a problem.
    c.get(i, { updateAgeOnGet: true })
  }
  t.equal(c.size, 10)
  t.matchSnapshot(c.entries())

  for (let i = 5; i < 10; i++) {
    c.get(i)
  }
  for (let i = 10; i < 15; i++) {
    c.set(i, i)
  }
  t.equal(c.size, 10)
  t.matchSnapshot(c.entries())

  for (let i = 15; i < 20; i++) {
    c.set(i, i)
  }
  // got pruned and replaced
  t.equal(c.size, 10)
  t.matchSnapshot(c.entries())

  for (let i = 0; i < 10; i++) {
    t.equal(c.get(i), undefined)
  }
  t.matchSnapshot(c.entries())

  for (let i = 0; i < 9; i++) {
    c.set(i, i)
  }
  t.equal(c.size, 10)
  t.equal(c.delete(19), true)
  t.equal(c.delete(19), false)
  t.equal(c.size, 9)
  c.set(10, 10)
  t.equal(c.size, 10)

  c.clear()
  t.equal(c.size, 0)
  for (let i = 0; i < 10; i++) {
    c.set(i, i)
  }
  t.equal(c.size, 10)
  t.equal(c.has(0), true)
  t.equal(c.size, 10)
  c.set(true, 'true')
  t.equal(c.has(true), true)
  t.equal(c.get(true), 'true')
  c.delete(true)
  t.equal(c.has(true), false)

  t.end()
})

t.test('bad max values', t => {
  // @ts-expect-error
  t.throws(() => new LRU())
  // @ts-expect-error
  t.throws(() => new LRU(123))
  // @ts-expect-error
  t.throws(() => new LRU(null))
  t.throws(() => new LRU({ max: -123 }))
  t.throws(() => new LRU({ max: 0 }))
  t.throws(() => new LRU({ max: 2.5 }))
  t.throws(() => new LRU({ max: Infinity }))
  t.throws(() => new LRU({ max: Number.MAX_SAFE_INTEGER * 2 }))

  // ok to have a max of 0 if maxSize or ttl are set
  const sizeOnly = new LRU({ maxSize: 100 })

  // setting the size to invalid values
  t.throws(() => sizeOnly.set('foo', 'bar'), TypeError)
  t.throws(() => sizeOnly.set('foo', 'bar', { size: 0 }), TypeError)
  t.throws(() => sizeOnly.set('foo', 'bar', { size: -1 }), TypeError)
  t.throws(
    () =>
      sizeOnly.set('foo', 'bar', {
        sizeCalculation: () => -1,
      }),
    TypeError
  )
  t.throws(
    () =>
      sizeOnly.set('foo', 'bar', {
        sizeCalculation: () => 0,
      }),
    TypeError
  )

  const ttlOnly = new LRU({ ttl: 1000, ttlAutopurge: true })
  // cannot set size when not tracking size
  t.throws(() => ttlOnly.set('foo', 'bar', { size: 1 }), TypeError)
  t.throws(() => ttlOnly.set('foo', 'bar', { size: 1 }), TypeError)

  const sizeTTL = new LRU({ maxSize: 100, ttl: 1000 })
  t.type(sizeTTL, LRU)
  t.end()
})

t.test('setting ttl with non-integer values', t => {
  t.throws(() => new LRU({ max: 10, ttl: 10.5 }), TypeError)
  t.throws(() => new LRU({ max: 10, ttl: -10 }), TypeError)
  // @ts-expect-error
  t.throws(() => new LRU({ max: 10, ttl: 'banana' }), TypeError)
  t.throws(() => new LRU({ max: 10, ttl: Infinity }), TypeError)
  t.end()
})

t.test('setting maxSize with non-integer values', t => {
  t.throws(() => new LRU({ max: 10, maxSize: 10.5 }), TypeError)
  t.throws(() => new LRU({ max: 10, maxSize: -10 }), TypeError)
  t.throws(() => new LRU({ max: 10, maxEntrySize: 10.5 }), TypeError)
  t.throws(() => new LRU({ max: 10, maxEntrySize: -10 }), TypeError)
  t.throws(
    // @ts-expect-error
    () => new LRU({ max: 10, maxEntrySize: 'banana' }),
    TypeError
  )
  t.throws(
    () => new LRU({ max: 10, maxEntrySize: Infinity }),
    TypeError
  )
  // @ts-expect-error
  t.throws(() => new LRU({ max: 10, maxSize: 'banana' }), TypeError)
  t.throws(() => new LRU({ max: 10, maxSize: Infinity }), TypeError)
  t.end()
})

t.test('bad sizeCalculation', t => {
  t.throws(() => {
    // @ts-expect-error
    new LRU({ max: 1, sizeCalculation: true })
  }, TypeError)
  t.throws(() => {
    // @ts-expect-error
    new LRU({ max: 1, maxSize: 1, sizeCalculation: true })
  }, TypeError)
  t.end()
})

t.test('delete from middle, reuses that index', t => {
  const c = new LRU({ max: 5 })
  for (let i = 0; i < 5; i++) {
    c.set(i, i)
  }
  c.delete(2)
  c.set(5, 5)
  t.strictSame(expose(c).valList, [0, 1, 5, 3, 4])
  t.end()
})

t.test('peek does not disturb order', t => {
  const c = new LRU({ max: 5 })
  for (let i = 0; i < 5; i++) {
    c.set(i, i)
  }
  t.equal(c.peek(2), 2)
  t.strictSame([...c.values()], [4, 3, 2, 1, 0])
  t.end()
})

t.test('re-use key before initial fill completed', t => {
  const c = new LRU({ max: 5 })
  c.set(0, 0)
  c.set(1, 1)
  c.set(2, 2)
  c.set(1, 2)
  c.set(3, 3)
  t.same(
    [...c.entries()],
    [
      [3, 3],
      [1, 2],
      [2, 2],
      [0, 0],
    ]
  )
  t.end()
})
