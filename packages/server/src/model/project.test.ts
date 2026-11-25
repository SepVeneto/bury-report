import { ObjectId } from 'mongodb'
import { getAppIdCandidates } from './project.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`)
  }
}

Deno.test('app access matches legacy ObjectId and string app ids', () => {
  const hex = '507f1f77bcf86cd799439011'
  const candidates = getAppIdCandidates(hex)

  assertEquals(candidates.length, 2)
  assertEquals(candidates[0], hex)
  assertEquals((candidates[1] as ObjectId).toHexString(), hex)
})

Deno.test('app access keeps non-ObjectId app ids as a single candidate', () => {
  const candidates = getAppIdCandidates('custom-app-id')

  assertEquals(candidates.length, 1)
  assertEquals(candidates[0], 'custom-app-id')
})
