if (typeof performance === 'undefined') {
  global.performance = require('perf_hooks').performance
}
import t from 'tap'
const { LRUCache } = require('../index.js')

const Clock = require('clock-mock')
const clock = new Clock()

const runTests = (LRU: typeof LRUCache, t: Tap.Test) => {
  const { setTimeout, clearTimeout } = global
  t.teardown(() =>
    // @ts-ignore
    Object.assign(global, { setTimeout, clearTimeout })
  )
  global.setTimeout = clock.setTimeout.bind(clock)
  global.clearTimeout = clock.clearTimeout.bind(clock)

  t.test('ttl tests defaults', t => {
    // have to advance it 1 so we don't start with 0
    // NB: this module will misbehave if you create an entry at a
    // clock time of 0, for example if you are filling an LRU cache
    // in a node lacking perf_hooks, at midnight UTC on 1970-01-01.
    // This is a known bug that I am ok with.
    clock.advance(1)
    const c = new LRU({ max: 5, ttl: 10, ttlResolution: 0 })
    c.set(1, 1)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    clock.advance(5)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    t.equal(c.getRemainingTTL(1), 5, '5ms left to live')
    t.equal(
      c.getRemainingTTL('not in cache'),
      0,
      'thing doesnt exist'
    )
    clock.advance(5)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    t.equal(c.getRemainingTTL(1), 0, 'almost stale')
    clock.advance(1)
    t.equal(c.getRemainingTTL(1), -1, 'gone stale')
    clock.advance(1)
    t.equal(c.getRemainingTTL(1), -2, 'even more stale')
    t.equal(c.has(1), false, '1 has stale', {
      now: clock._now,
      ttls: c.ttls,
      starts: c.starts,
      index: c.keyMap.get(1),
      stale: c.isStale(c.keyMap.get(1)),
    })
    t.equal(c.get(1), undefined)
    t.equal(c.size, 0)

    c.set(2, 2, { ttl: 100 })
    clock.advance(50)
    t.equal(c.has(2), true)
    t.equal(c.get(2), 2)
    clock.advance(51)
    t.equal(c.has(2), false)
    t.equal(c.get(2), undefined)

    c.clear()
    for (let i = 0; i < 9; i++) {
      c.set(i, i)
    }
    // now we have 9 items
    // get an expired item from old set
    clock.advance(11)
    t.equal(c.peek(4), undefined)
    t.equal(c.has(4), false)
    t.equal(c.get(4), undefined)

    // set an item WITHOUT a ttl on it
    c.set('immortal', true, { ttl: 0 })
    clock.advance(100)
    t.equal(c.getRemainingTTL('immortal'), Infinity)
    t.equal(c.get('immortal'), true)
    c.get('immortal', { updateAgeOnGet: true })
    clock.advance(100)
    t.equal(c.get('immortal'), true)
    t.end()
  })

  t.test('ttl tests with ttlResolution=100', t => {
    const c = new LRU({ ttl: 10, ttlResolution: 100, max: 10 })
    c.set(1, 1)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    clock.advance(5)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    clock.advance(5)
    t.equal(c.get(1), 1, '1 get not stale', { now: clock._now })
    clock.advance(1)
    t.equal(c.has(1), true, '1 has stale', {
      now: clock._now,
      ttls: c.ttls,
      starts: c.starts,
      index: c.keyMap.get(1),
      stale: c.isStale(c.keyMap.get(1)),
    })
    t.equal(c.get(1), 1)
    clock.advance(100)
    t.equal(c.has(1), false, '1 has stale', {
      now: clock._now,
      ttls: c.ttls,
      starts: c.starts,
      index: c.keyMap.get(1),
      stale: c.isStale(c.keyMap.get(1)),
    })
    t.equal(c.get(1), undefined)
    t.equal(c.size, 0)
    t.end()
  })

  t.test(
    'ttlResolution only respected if non-negative integer',
    t => {
      const invalids = [-1, null, undefined, 'banana', {}]
      for (const i of invalids) {
        const c = new LRU({ ttl: 5, ttlResolution: i, max: 5 })
        t.not(c.ttlResolution, i)
        t.equal(c.ttlResolution, Math.floor(c.ttlResolution))
        t.ok(c.ttlResolution >= 0)
      }
      t.end()
    }
  )

  t.test('ttlAutopurge', t => {
    const c = new LRU({
      ttl: 10,
      ttlAutopurge: true,
      ttlResolution: 0,
    })
    c.set(1, 1)
    c.set(2, 2)
    t.equal(c.size, 2)
    c.set(2, 3, { ttl: 11 })
    clock.advance(11)
    t.equal(c.size, 1)
    clock.advance(1)
    t.equal(c.size, 0)
    t.end()
  })

  t.test('ttl on set, not on cache', t => {
    const c = new LRU({ max: 5, ttlResolution: 0 })
    c.set(1, 1, { ttl: 10 })
    t.equal(c.get(1), 1)
    clock.advance(5)
    t.equal(c.get(1), 1)
    clock.advance(5)
    t.equal(c.get(1), 1)
    clock.advance(1)
    t.equal(c.has(1), false)
    t.equal(c.get(1), undefined)
    t.equal(c.size, 0)

    c.set(2, 2, { ttl: 100 })
    clock.advance(50)
    t.equal(c.has(2), true)
    t.equal(c.get(2), 2)
    clock.advance(51)
    t.equal(c.has(2), false)
    t.equal(c.get(2), undefined)

    c.clear()
    for (let i = 0; i < 9; i++) {
      c.set(i, i, { ttl: 10 })
    }
    // now we have 9 items
    // get an expired item from old set
    clock.advance(11)
    t.equal(c.has(4), false)
    t.equal(c.get(4), undefined)

    t.end()
  })

  t.test('ttl with allowStale', t => {
    const c = new LRU({
      max: 5,
      ttl: 10,
      allowStale: true,
      ttlResolution: 0,
    })
    c.set(1, 1)
    t.equal(c.get(1), 1)
    clock.advance(5)
    t.equal(c.get(1), 1)
    clock.advance(5)
    t.equal(c.get(1), 1)
    clock.advance(1)
    t.equal(c.has(1), false)
    t.equal(c.get(1), 1)
    t.equal(c.get(1), undefined)
    t.equal(c.size, 0)

    c.set(2, 2, { ttl: 100 })
    clock.advance(50)
    t.equal(c.has(2), true)
    t.equal(c.get(2), 2)
    clock.advance(51)
    t.equal(c.has(2), false)
    t.equal(c.get(2), 2)
    t.equal(c.get(2), undefined)

    c.clear()
    for (let i = 0; i < 9; i++) {
      c.set(i, i)
    }
    // now we have 9 items
    // get an expired item from old set
    clock.advance(11)
    t.equal(c.has(4), false)
    t.equal(c.get(4), 4)
    t.equal(c.get(4), undefined)

    t.end()
  })

  t.test('ttl with updateAgeOnGet/updateAgeOnHas', t => {
    const c = new LRU({
      max: 5,
      ttl: 10,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
      ttlResolution: 0,
    })
    c.set(1, 1)
    t.equal(c.get(1), 1)
    clock.advance(5)
    t.equal(c.has(1), true)
    clock.advance(5)
    t.equal(c.get(1), 1)
    clock.advance(1)
    t.equal(c.getRemainingTTL(1), 9)
    t.equal(c.has(1), true)
    t.equal(c.getRemainingTTL(1), 10)
    t.equal(c.get(1), 1)
    t.equal(c.size, 1)
    c.clear()

    c.set(2, 2, { ttl: 100 })
    for (let i = 0; i < 10; i++) {
      clock.advance(50)
      t.equal(c.has(2), true)
      t.equal(c.get(2), 2)
    }
    clock.advance(101)
    t.equal(c.has(2), false)
    t.equal(c.get(2), undefined)

    c.clear()
    for (let i = 0; i < 9; i++) {
      c.set(i, i)
    }
    // now we have 9 items
    // get an expired item
    t.equal(c.has(3), false)
    t.equal(c.get(3), undefined)
    clock.advance(11)
    t.equal(c.has(4), false)
    t.equal(c.get(4), undefined)

    t.end()
  })

  t.test('purge stale items', t => {
    const c = new LRU({ max: 10, ttlResolution: 0 })
    for (let i = 0; i < 10; i++) {
      c.set(i, i, { ttl: i + 1 })
    }
    clock.advance(3)
    t.equal(c.size, 10)
    t.equal(c.purgeStale(), true)
    t.equal(c.size, 8)
    t.equal(c.purgeStale(), false)

    clock.advance(100)
    t.equal(c.size, 8)
    t.equal(c.purgeStale(), true)
    t.equal(c.size, 0)
    t.equal(c.purgeStale(), false)
    t.equal(c.size, 0)
    t.end()
  })

  t.test('no update ttl', t => {
    const c = new LRU({
      max: 10,
      ttlResolution: 0,
      noUpdateTTL: true,
      ttl: 10,
    })
    for (let i = 0; i < 3; i++) {
      c.set(i, i)
    }
    clock.advance(9)
    // set, but do not update ttl.  this will fall out.
    c.set(0, 0)

    // set, but update the TTL
    c.set(1, 1, { noUpdateTTL: false })
    clock.advance(9)
    c.purgeStale()

    t.equal(c.get(2), undefined, 'fell out of cache normally')
    t.equal(c.get(1), 1, 'still in cache, ttl updated')
    t.equal(c.get(0), undefined, 'fell out of cache, despite update')

    clock.advance(9)
    c.purgeStale()
    t.equal(c.get(1), undefined, 'fell out of cache after ttl update')

    t.end()
  })

  // https://github.com/isaacs/node-lru-cache/issues/203
  t.test('indexes/rindexes can walk over stale entries', t => {
    const c = new LRU({ max: 10, ttl: 10 })
    for (let i = 0; i < 3; i++) {
      c.set(i, i)
    }
    clock.advance(9)
    for (let i = 3; i < 10; i++) {
      c.set(i, i)
    }
    c.get(1)
    c.get(3)
    clock.advance(9)
    const indexes = [...c.indexes()]
    const indexesStale = [...c.indexes({ allowStale: true })]
    const rindexes = [...c.rindexes()]
    const rindexesStale = [...c.rindexes({ allowStale: true })]
    t.same(
      {
        indexes,
        indexesStale,
        rindexes,
        rindexesStale,
      },
      {
        indexes: [3, 9, 8, 7, 6, 5, 4],
        indexesStale: [3, 1, 9, 8, 7, 6, 5, 4, 2, 0],
        rindexes: [4, 5, 6, 7, 8, 9, 3],
        rindexesStale: [0, 2, 4, 5, 6, 7, 8, 9, 1, 3],
      }
    )
    t.end()
  })

  // https://github.com/isaacs/node-lru-cache/issues/203
  t.test('clear() disposes stale entries', t => {
    const disposed: any[] = []
    const disposedAfter: any[] = []
    const c = new LRU({
      max: 3,
      ttl: 10,
      dispose: (v: any, k: any) => disposed.push([v, k]),
      disposeAfter: (v: any, k: any) => disposedAfter.push([v, k]),
    })
    for (let i = 0; i < 4; i++) {
      c.set(i, i)
    }
    t.same(disposed, [[0, 0]])
    t.same(disposedAfter, [[0, 0]])
    clock.advance(20)
    c.clear()
    t.same(disposed, [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    t.same(disposedAfter, [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ])
    t.end()
  })

  t.test('purgeStale() lockup', t => {
    const c = new LRU({
      max: 3,
      ttl: 10,
      updateAgeOnGet: true,
    })
    c.set(1, 1)
    c.set(2, 2)
    c.set(3, 3)
    clock.advance(5)
    c.get(2)
    clock.advance(15)
    c.purgeStale()
    t.pass('did not get locked up')
    t.end()
  })

  t.test('set item pre-stale', t => {
    const c = new LRU({
      max: 3,
      ttl: 10,
      allowStale: true,
    })
    c.set(1, 1)
    t.equal(c.has(1), true)
    t.equal(c.get(1), 1)
    c.set(2, 2, { start: clock.now() - 11 })
    t.equal(c.has(2), false)
    t.equal(c.get(2), 2)
    t.equal(c.get(2), undefined)
    c.set(2, 2, { start: clock.now() - 11 })
    const dump = c.dump()
    t.matchSnapshot(dump, 'dump with stale values')
    const d = new LRU({ max: 3, ttl: 10, allowStale: true })
    d.load(dump)
    t.equal(d.has(2), false)
    t.equal(d.get(2), 2)
    t.equal(d.get(2), undefined)
    t.end()
  })

  t.test('no delete on stale get', t => {
    const c = new LRU({
      noDeleteOnStaleGet: true,
      ttl: 10,
      max: 3,
    })
    c.set(1, 1)
    clock.advance(11)
    t.equal(c.has(1), false)
    t.equal(c.get(1), undefined)
    t.equal(c.get(1, { allowStale: true }), 1)
    t.equal(
      c.get(1, { allowStale: true, noDeleteOnStaleGet: false }),
      1
    )
    t.equal(c.get(1, { allowStale: true }), undefined)
    t.end()
  })

  t.end()
}

t.test('tests with perf_hooks.performance.now()', t => {
  const { performance, Date } = global
  // @ts-ignore
  t.teardown(() => Object.assign(global, { performance, Date }))
  global.Date = clock.Date
  global.performance = clock
  const LRU = t.mock('../', {})
  runTests(LRU, t)
})

t.test('tests using Date.now()', t => {
  const { performance, Date } = global
  // @ts-ignore
  t.teardown(() => Object.assign(global, { performance, Date }))
  global.Date = clock.Date
  // @ts-ignore
  global.performance = null
  const LRU = t.mock('../', {})
  runTests(LRU, t)
})
