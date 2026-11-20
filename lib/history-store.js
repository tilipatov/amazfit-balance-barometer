import { readFileSync, statSync, writeFileSync } from '@zos/fs'

const utf8 = { encoding: 'utf8' }

function readFile(path) {
  try {
    const data = readFileSync({ path, options: utf8 })
    if (typeof data === 'string') return { status: 'loaded', data }
    return { status: statSync({ path }) === undefined ? 'missing' : 'unreadable' }
  } catch {
    return { status: 'read-error' }
  }
}

function checksum(text) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return (hash >>> 0).toString(16)
}

function readSlot(path, valid) {
  const file = readFile(path)
  if (file.status !== 'loaded') return { path, status: file.status }
  const newline = file.data.indexOf('\n')
  if (newline >= 0) {
    const header = /^(\d+) (\d+) ([\da-f]+)$/.exec(file.data.slice(0, newline))
    const body = file.data.slice(newline + 1)
    const generation = header && Number(header[1])
    if (Number.isSafeInteger(generation) && generation > 0 && Number(header[2]) === body.length
      && header[3] === checksum(body)) {
      try {
        const items = JSON.parse(body)
        if (Array.isArray(items) && items.every(valid)) {
          return { path, status: 'loaded', generation, items }
        }
      } catch {}
    }
  }
  return { path, status: 'invalid' }
}

// A damaged legacy array may still contain complete top-level entries.
function salvageArray(data, valid) {
  const text = data.trimStart()
  if (text[0] !== '[') return []
  const items = []
  const brackets = []
  let start = -1
  let quoted = false
  let escaped = false
  let separator = false
  for (let index = 1; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') quoted = false
      continue
    }
    if (!brackets.length) {
      if (/\s/.test(char)) continue
      if (char === ']') break
      if (separator) {
        if (char !== ',') break
        separator = false
        continue
      }
      if (char !== '[' && char !== '{') break
      start = index
    }
    if (char === '"') quoted = true
    else if (char === '[' || char === '{') brackets.push(char === '[' ? ']' : '}')
    else if (char === ']' || char === '}') {
      if (char !== brackets.pop()) break
      if (!brackets.length) {
        separator = true
        try {
          const item = JSON.parse(text.slice(start, index + 1))
          if (valid(item)) items.push(item)
        } catch {}
      }
    }
  }
  return items
}

function readLegacy(path, valid) {
  const file = readFile(path)
  if (file.status !== 'loaded') return file
  try {
    const raw = JSON.parse(file.data)
    if (Array.isArray(raw)) {
      const items = raw.filter(valid)
      return { status: 'loaded', items, rejected: raw.length - items.length }
    }
  } catch {}
  const items = salvageArray(file.data, valid)
  return { status: items.length ? 'recovered' : 'invalid', items, recovered: items.length }
}

function ioError(status) {
  return status === 'unreadable' || status === 'read-error'
}

export function readHistoryStore(path, valid) {
  const first = readSlot(path + '.a', valid)
  const second = readSlot(path + '.b', valid)
  const current = first.generation > (second.generation || 0) ? first : second.generation ? second : null
  if (current) {
    const next = current === first ? second : first
    return {
      items: current.items,
      next: ioError(next.status) ? null : next.path,
      generation: current.generation,
      status: 'loaded',
      backup: next.status !== 'loaded' && next.status !== 'missing',
      slots: [first.status, second.status],
    }
  }

  const legacy = readLegacy(path, valid)
  const uncertain = ioError(first.status) || ioError(second.status) || ioError(legacy.status)
  return {
    items: legacy.items ?? (uncertain ? null : []),
    next: uncertain ? null : first.path,
    generation: 0,
    status: uncertain && !legacy.items ? 'read-error'
      : legacy.status === 'missing' && [first, second].some(slot => slot.status === 'invalid')
        ? 'invalid' : legacy.status,
    recovered: legacy.recovered,
    rejected: legacy.rejected,
    slots: [first.status, second.status],
  }
}

export function writeHistoryStore(store, items) {
  if (!store.next) return 'history-error'
  const body = JSON.stringify(items)
  const data = (store.generation + 1) + ' ' + body.length + ' ' + checksum(body) + '\n' + body
  try {
    // Only overwrite the inactive slot. The original legacy file is never changed.
    writeFileSync({ path: store.next, data, options: utf8 })
  } catch {
    return 'write-error'
  }
  return readFile(store.next).data === data ? 'saved' : 'unverified'
}
