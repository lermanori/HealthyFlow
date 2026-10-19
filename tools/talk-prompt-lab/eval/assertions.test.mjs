import assert from 'node:assert/strict'
import test from 'node:test'
import assertions from './assertions.cjs'

const config = {
  requiredTools: ['get_today', 'list_goals'],
  forbiddenTools: ['add_task'],
  replyIncludes: ['App Store reviewer notes'],
  replyIncludesOneOf: [['upper bound', 'at most', 'not exact'], ['16:30', 'later sessions', '4 of 5']],
  replyExcludes: ['estimate', 'about 75'],
  requireNoPendingActions: true,
}

test('deterministic grader accepts a grounded read-only recommendation', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'Finish App Store reviewer notes before 16:30. Capacity is an upper bound because Calendar is unavailable.',
    toolEvents: [{ name: 'get_today' }, { name: 'list_goals' }],
    pendingActions: [],
  }), { config })

  assert.equal(grade.pass, true)
  assert.equal(grade.score, 1)
})

test('deterministic grader rejects missing context and an unsolicited write', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'I added a new task for you.',
    toolEvents: [{ name: 'get_today' }, { name: 'add_task' }],
    pendingActions: [{ capability: 'add_task' }],
  }), { config })

  assert.equal(grade.pass, false)
  assert.ok(grade.score < 1)
  assert.ok(grade.componentResults.some((component) => !component.pass))
})

test('deterministic grader rejects an upper bound described as an estimate', () => {
  const grade = assertions.validateTalkBehavior(JSON.stringify({
    reply: 'Finish App Store reviewer notes before 16:30. Capacity is estimated at 75 minutes because Calendar is unavailable.',
    toolEvents: [{ name: 'get_today' }, { name: 'list_goals' }, { name: 'list_habit_history' }],
    pendingActions: [],
  }), { config })

  assert.equal(grade.pass, false)
  assert.ok(grade.componentResults.some((component) => component.reason.includes('estimate') && !component.pass))
})
