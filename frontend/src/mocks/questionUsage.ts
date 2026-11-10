import { persistentMap } from './persistence.ts'
import type { MockPersistence } from './persistence.ts'
import { FollowUpError } from './followUpStore.ts'

// One simulated guest/IP per Mock store. Real identity/IP enforcement belongs to BE.
export function createMockQuestionUsage(persistence?: MockPersistence) {
  const usage = persistentMap<string, number[]>('questionUsage', persistence)
  return (timestamp: number) => {
    const entries = (usage.get('mock-guest-and-ip') ?? []).filter(time => time > timestamp - 86400000)
    const day = new Date(timestamp); day.setHours(0, 0, 0, 0)
    if (entries.filter(time => time >= day.getTime()).length >= 30 || entries.filter(time => time > timestamp - 3600000).length >= 60) throw new FollowUpError('QUESTION_USAGE_LIMIT', 429)
    usage.set('mock-guest-and-ip', [...entries, timestamp])
  }
}
