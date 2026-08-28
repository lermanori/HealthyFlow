import { test, expect } from './fixtures/ai-stubs'
import type { Page } from '@playwright/test'

function formatLocalDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

async function pasteImageFiles(page: Page, files: Array<{ name: string; type: string; size?: number }>) {
  await page.getByPlaceholder(/Add anything/).evaluate((element, pastedFiles) => {
    const transfer = new DataTransfer()
    for (const file of pastedFiles) {
      transfer.items.add(new File(
        [new Uint8Array(file.size ?? 4)],
        file.name,
        { type: file.type },
      ))
    }
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }))
  }, files)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('healthyflow-assistant-conversations-v1')
  })
})

test('Demo Talk stays deterministic without calling the billable chat API', async ({ page }) => {
  let billableChatRequests = 0
  await page.addInitScript(() => {
    localStorage.setItem('demoPersona', 'noam')
  })
  await page.route('**/api/ai/chat', (route) => {
    billableChatRequests += 1
    return route.fulfill({
      status: 402,
      json: { error: 'Insufficient AI tokens', code: 'insufficient_credits' },
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Give me one more small next step.')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText("Here's a stable reset plan for Noam:")).toBeVisible()
  expect(billableChatRequests).toBe(0)
})

test('Talk can speak an assistant response without adding speech controls to user messages', async ({ page }) => {
  await page.addInitScript(() => {
    const spokenTexts: string[] = []
    Object.defineProperty(window, '__healthyFlowSpokenTexts', {
      configurable: true,
      value: spokenTexts,
    })
    window.speechSynthesis.speak = (utterance) => {
      spokenTexts.push(utterance.text)
      utterance.onstart?.(new SpeechSynthesisEvent('start', { utterance }))
    }
  })
  await page.route('**/api/ai/conversations', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    await route.fulfill({
      contentType: 'application/json',
      body: route.request().postData() ?? '{}',
    })
  })
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      message: 'This Talk response should be spoken.',
      toolEvents: [],
      pendingActions: [],
    }),
  }))

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Give me one small next step.')
  await page.getByRole('button', { name: 'Send' }).click()

  const response = 'This Talk response should be spoken.'
  await expect(page.getByText(response)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Speak response' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Speak response' }).click()

  await expect.poll(() => page.evaluate(() => (
    (window as typeof window & { __healthyFlowSpokenTexts?: string[] }).__healthyFlowSpokenTexts ?? []
  ))).toEqual([expect.stringContaining(response)])
})

test('Native iOS Talk uses keyboard dictation instead of showing the custom microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeWindow = window as typeof window & { CapacitorCustomPlatform?: { name: string } }
    nativeWindow.CapacitorCustomPlatform = { name: 'ios' }
  })

  await page.goto('/talk')
  await page.getByRole('navigation', { name: 'Application' }).waitFor()
  await page.evaluate(() => {
    window.history.pushState({}, '', '/talk')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })

  await expect(page.getByPlaceholder(/Add anything/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start dictation' })).toHaveCount(0)
})

test('Mobile Add handoff focuses Talk and Back returns to the manual form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/ai/conversations', (route) => route.fulfill({ json: [] }))

  await page.goto('/app/add')
  await page.getByRole('button', { name: 'Open Talk', exact: true }).click()

  await expect(page).toHaveURL(/\/app\/talk$/)
  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toHaveValue(/Help me add a Task/)
  await expect(composer).toBeFocused()

  await page.goBack()
  await expect(page).toHaveURL(/\/app\/add$/)
  await expect(page.getByRole('heading', { name: 'Add Item' })).toBeVisible()
})

test('Talk sends a bounded verified Habit-history snapshot with the turn', async ({ page }) => {
  const to = formatLocalDate(new Date())
  let requestBody: { assistantContext?: { habitHistory?: unknown } } | null = null
  await page.route('**/api/ai/chat', async (route) => {
    requestBody = route.request().postDataJSON() as typeof requestBody
    await route.fulfill({ json: { message: 'History received.', toolEvents: [], pendingActions: [] } })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('What should I focus on today?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('History received.')).toBeVisible()
  await expect.poll(() => requestBody?.assistantContext?.habitHistory).toEqual(
    expect.objectContaining({
      status: 'ready',
      record: expect.objectContaining({
        to,
        habits: expect.any(Array),
      }),
    }),
  )
})

test('Talk pauses, resumes, switches, and stops response playback predictably', async ({ page }) => {
  await page.addInitScript(() => {
    const playback = {
      spoken: [] as string[],
      pauses: 0,
      resumes: 0,
      cancels: 0,
      speaking: false,
      paused: false,
    }
    Object.defineProperty(window, '__healthyFlowPlayback', {
      configurable: true,
      value: playback,
    })
    Object.defineProperty(window.speechSynthesis, 'speaking', {
      configurable: true,
      get: () => playback.speaking,
    })
    Object.defineProperty(window.speechSynthesis, 'paused', {
      configurable: true,
      get: () => playback.paused,
    })
    window.speechSynthesis.speak = (utterance) => {
      playback.spoken.push(utterance.text)
      playback.speaking = true
      playback.paused = false
      utterance.onstart?.(new SpeechSynthesisEvent('start', { utterance }))
    }
    window.speechSynthesis.pause = () => {
      playback.pauses += 1
      playback.speaking = false
      playback.paused = true
    }
    window.speechSynthesis.resume = () => {
      playback.resumes += 1
      playback.speaking = true
      playback.paused = false
    }
    window.speechSynthesis.cancel = () => {
      playback.cancels += 1
      playback.speaking = false
      playback.paused = false
    }
  })
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  let responseNumber = 0
  await page.route('**/api/ai/chat', async (route) => {
    responseNumber += 1
    await route.fulfill({
      json: {
        message: responseNumber === 1 ? 'First spoken response.' : 'Second spoken response.',
        toolEvents: [],
        pendingActions: [],
      },
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('First turn')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('First spoken response.')).toBeVisible()
  await page.getByRole('button', { name: 'Speak response' }).click()

  await page.getByRole('button', { name: 'Pause response' }).click()
  await expect(page.getByRole('button', { name: 'Resume response' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume response' }).click()

  await page.getByPlaceholder(/Add anything/).fill('Second turn')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Second spoken response.')).toBeVisible()
  await page.getByRole('button', { name: 'Speak response' }).click()
  await page.getByRole('button', { name: 'Stop response' }).click()

  await expect.poll(() => page.evaluate(() => (
    window as typeof window & {
      __healthyFlowPlayback?: {
        spoken: string[]
        pauses: number
        resumes: number
        cancels: number
      }
    }
  ).__healthyFlowPlayback)).toMatchObject({
    spoken: ['First spoken response.', 'Second spoken response.'],
    pauses: 1,
    resumes: 1,
    cancels: 2,
  })
  await expect(page.getByRole('button', { name: 'Replay response' })).toBeVisible()
})

test('A Talk playback failure leaves the response readable and conversation usable', async ({ page }) => {
  await page.addInitScript(() => {
    window.speechSynthesis.speak = (utterance) => {
      utterance.onerror?.(new SpeechSynthesisErrorEvent('error', {
        utterance,
        error: 'synthesis-failed',
      }))
    }
  })
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    json: {
      message: 'Readable even when audio fails.',
      toolEvents: [],
      pendingActions: [],
    },
  }))

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Give me a readable answer')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Speak response' }).click()

  await expect(page.getByText('Could not play this response. You can still read and continue.')).toBeVisible()
  await expect(page.getByText('Readable even when audio fails.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replay response' })).toBeVisible()
  await expect(page.getByPlaceholder(/Add anything/)).toBeEnabled()
})

test('Backgrounding Talk pauses audio until the user resumes it', async ({ page }) => {
  await page.addInitScript(() => {
    const playback = { speaking: false, paused: false }
    Object.defineProperty(window.speechSynthesis, 'speaking', {
      configurable: true,
      get: () => playback.speaking,
    })
    Object.defineProperty(window.speechSynthesis, 'paused', {
      configurable: true,
      get: () => playback.paused,
    })
    window.speechSynthesis.speak = (utterance) => {
      playback.speaking = true
      utterance.onstart?.(new SpeechSynthesisEvent('start', { utterance }))
    }
    window.speechSynthesis.pause = () => {
      playback.speaking = false
      playback.paused = true
    }
    window.speechSynthesis.resume = () => {
      playback.speaking = true
      playback.paused = false
    }
  })
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    json: { message: 'Pause me in the background.', toolEvents: [], pendingActions: [] },
  }))

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Read this aloud')
  await page.getByRole('button', { name: 'Send' }).click()
  await page.getByRole('button', { name: 'Speak response' }).click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

  await expect(page.getByRole('button', { name: 'Resume response' })).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('button', { name: 'Resume response' })).toBeVisible()
  await page.getByRole('button', { name: 'Resume response' }).click()
  await expect(page.getByRole('button', { name: 'Pause response' })).toBeVisible()
})

test('Talk remains usable when the browser does not support speech synthesis', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined })
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined })
  })
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    json: { message: 'Text still works without speech.', toolEvents: [], pendingActions: [] },
  }))

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Use text only')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText('Text still works without speech.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Speak response|Replay response/ })).toHaveCount(0)
  await expect(page.getByPlaceholder(/Add anything/)).toBeEnabled()
})

test('A user can cancel an in-flight Talk response and retry without duplicating their message', async ({ page }) => {
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  let chatRequests = 0
  await page.route('**/api/ai/chat', async (route) => {
    chatRequests += 1
    if (chatRequests === 1) {
      await new Promise((resolve) => setTimeout(resolve, 10_000))
      await route.fulfill({
        json: { message: 'Too late', toolEvents: [], pendingActions: [] },
      }).catch(() => undefined)
      return
    }
    await route.fulfill({
      json: { message: 'Recovered response.', toolEvents: [], pendingActions: [] },
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Keep this message once')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('button', { name: 'Cancel response' })).toBeVisible()
  await page.getByRole('button', { name: 'Cancel response' }).click()

  await expect(page.getByText('Response canceled.')).toBeVisible()
  await page.getByRole('button', { name: 'Retry response' }).click()
  await expect(page.getByText('Recovered response.')).toBeVisible()
  await expect(page.locator('.assistant-messages-scroll').getByText('Keep this message once', { exact: true })).toHaveCount(1)
  expect(chatRequests).toBe(2)
})

test('A failed Talk turn exposes an explicit retry that replaces the error', async ({ page }) => {
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  let chatRequests = 0
  await page.route('**/api/ai/chat', async (route) => {
    chatRequests += 1
    if (chatRequests === 1) {
      await route.fulfill({ status: 503, json: { error: 'Temporary model failure' } })
      return
    }
    await route.fulfill({
      json: { message: 'Retry succeeded.', toolEvents: [], pendingActions: [] },
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Try this once')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Temporary model failure').first()).toBeVisible()
  await expect(page.getByText('Response failed.')).toBeVisible()

  await page.getByRole('button', { name: 'Retry response' }).click()
  await expect(page.getByText('Retry succeeded.')).toBeVisible()
  await expect(page.locator('.assistant-messages-scroll').getByText('Temporary model failure')).toHaveCount(0)
  await expect(page.locator('.assistant-messages-scroll').getByText('Try this once', { exact: true })).toHaveCount(1)
  expect(chatRequests).toBe(2)
})

test('A long saved conversation continues with the latest 30 messages while preserving full history', async ({ page }) => {
  const now = new Date().toISOString()
  const storedMessages = Array.from({ length: 35 }, (_, index) => ({
    id: crypto.randomUUID(),
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: `Stored message ${index}`,
    createdAt: now,
  }))
  const conversation = {
    id: '77777777-7777-4777-8777-777777777777',
    title: 'Long conversation',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: storedMessages,
  }
  let chatMessages: Array<{ role: string; content: string }> = []
  let latestSavedMessageCount = 0

  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [conversation] })
      return
    }
    const body = route.request().postDataJSON() as { messages: unknown[] }
    latestSavedMessageCount = body.messages.length
    await route.fulfill({ json: body })
  })
  await page.route('**/api/ai/chat', async (route) => {
    chatMessages = (route.request().postDataJSON() as { messages: Array<{ role: string; content: string }> }).messages
    await route.fulfill({
      json: { message: 'Long conversation continued.', toolEvents: [], pendingActions: [] },
    })
  })

  await page.goto('/app/talk')
  await expect(page.getByText('Talk uses the latest 30 messages as context; your full chat remains saved.')).toBeVisible()
  await page.getByPlaceholder(/Add anything/).fill('Newest user turn')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Long conversation continued.')).toBeVisible()

  expect(chatMessages).toHaveLength(30)
  expect(chatMessages[0].content).toBe('Stored message 6')
  expect(chatMessages.at(-1)?.content).toBe('Newest user turn')
  await expect.poll(() => latestSavedMessageCount).toBe(37)
})

test('Pasting one supported image attaches it without losing the Talk draft', async ({ page }) => {
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  let sentAttachment: { kind?: string; name?: string; mimeType?: string; data?: string } | undefined
  await page.route('**/api/ai/chat', async (route) => {
    sentAttachment = (route.request().postDataJSON() as { attachment?: typeof sentAttachment }).attachment
    await route.fulfill({
      json: { message: 'Image received.', toolEvents: [], pendingActions: [] },
    })
  })

  await page.goto('/app/talk')
  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Keep this draft')
  await pasteImageFiles(page, [{ name: 'clipboard.png', type: 'image/png' }])

  await expect(composer).toHaveValue('Keep this draft')
  await expect(page.getByText('clipboard.png')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Replace attachment' })).toBeVisible()
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Image received.')).toBeVisible()
  expect(sentAttachment).toMatchObject({
    kind: 'image',
    name: 'clipboard.png',
    mimeType: 'image/png',
  })
  expect(sentAttachment?.data).toBeTruthy()
})

test('Pasting multiple images is rejected without losing the Talk draft', async ({ page }) => {
  await page.goto('/app/talk')
  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Draft survives multiple images')
  await pasteImageFiles(page, [
    { name: 'first.png', type: 'image/png' },
    { name: 'second.jpg', type: 'image/jpeg' },
  ])

  await expect(page.getByText('Paste one image at a time')).toBeVisible()
  await expect(composer).toHaveValue('Draft survives multiple images')
  await expect(page.getByText('first.png')).toHaveCount(0)
  await expect(page.getByText('second.jpg')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Attach file' })).toBeVisible()
})

test('Pasting an unsupported image is rejected without losing the Talk draft', async ({ page }) => {
  await page.goto('/app/talk')
  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Draft survives unsupported image')
  await pasteImageFiles(page, [{ name: 'vector.svg', type: 'image/svg+xml' }])

  await expect(page.getByText('Attach a JPG, PNG, WebP, TXT, or MD file')).toBeVisible()
  await expect(composer).toHaveValue('Draft survives unsupported image')
  await expect(page.getByText('vector.svg')).toHaveCount(0)
})

test('Pasting an oversized image is rejected without losing the Talk draft', async ({ page }) => {
  await page.goto('/app/talk')
  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Draft survives oversized image')
  await pasteImageFiles(page, [{
    name: 'too-large.png',
    type: 'image/png',
    size: (4 * 1024 * 1024) + 1,
  }])

  await expect(page.getByText('Image attachment must be 4MB or smaller')).toBeVisible()
  await expect(composer).toHaveValue('Draft survives oversized image')
  await expect(page.getByText('too-large.png')).toHaveCount(0)
})

test('Pasting a new supported image replaces the existing attachment and keeps the draft', async ({ page }) => {
  await page.goto('/app/talk')
  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Draft survives replacement')
  await pasteImageFiles(page, [{ name: 'first.png', type: 'image/png' }])
  await expect(page.getByText('first.png')).toBeVisible()

  await pasteImageFiles(page, [{ name: 'replacement.webp', type: 'image/webp' }])
  await expect(page.getByText('replacement.webp')).toBeVisible()
  await expect(page.getByText('first.png')).toHaveCount(0)
  await expect(composer).toHaveValue('Draft survives replacement')
})

test('Talk mobile composer grows to the caret and keeps every control usable at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/app/talk')

  const composer = page.getByPlaceholder(/Add anything/)
  const initialBox = await composer.boundingBox()
  expect(initialBox).toBeTruthy()

  const multilineDraft = Array.from({ length: 10 }, (_, index) => `Planning line ${index + 1}`).join('\n')
  await composer.fill(multilineDraft)
  const grownBox = await composer.boundingBox()
  expect(grownBox).toBeTruthy()
  expect(grownBox!.height).toBeGreaterThan(initialBox!.height + 24)
  expect(grownBox!.height).toBeLessThanOrEqual(112)

  const caretState = await composer.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement
    return {
      selectionStart: textarea.selectionStart,
      valueLength: textarea.value.length,
      scrollBottom: textarea.scrollTop + textarea.clientHeight,
      scrollHeight: textarea.scrollHeight,
    }
  })
  expect(caretState.selectionStart).toBe(caretState.valueLength)
  expect(caretState.scrollBottom).toBeGreaterThanOrEqual(caretState.scrollHeight - 1)

  const controls = await Promise.all([
    page.getByRole('button', { name: 'Attach file' }).boundingBox(),
    page.getByLabel('Assistant model').boundingBox(),
    page.getByRole('button', { name: /dictation/i }).boundingBox(),
    page.getByRole('button', { name: 'Send' }).boundingBox(),
  ])
  for (const box of controls) {
    expect(box).toBeTruthy()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(320)
  }
  for (let index = 1; index < controls.length; index += 1) {
    expect(controls[index]!.x).toBeGreaterThanOrEqual(controls[index - 1]!.x + controls[index - 1]!.width)
  }

  await page.setViewportSize({ width: 568, height: 320 })
  await expect(composer).toBeFocused()
  const landscapeBox = await composer.boundingBox()
  expect(landscapeBox).toBeTruthy()
  expect(landscapeBox!.x + landscapeBox!.width).toBeLessThanOrEqual(568)
})

test('Talk keeps the latest turn visible and restores composer focus on mobile', async ({ page }) => {
  const now = new Date().toISOString()
  const conversation = {
    id: '88888888-8888-4888-8888-888888888888',
    title: 'Scrollable mobile chat',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: Array.from({ length: 18 }, (_, index) => ({
      id: crypto.randomUUID(),
      role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
      content: `Existing mobile message ${index} with enough text to occupy a visible line`,
      createdAt: now,
    })),
  }
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [conversation] })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', async (route) => {
    await route.fulfill({
      json: { message: 'Newest mobile response.', toolEvents: [], pendingActions: [] },
    })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/talk')
  const scroll = page.locator('.assistant-messages-scroll')
  await expect.poll(() => scroll.evaluate((element) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  ))).toBe(true)

  const composer = page.getByPlaceholder(/Add anything/)
  await composer.fill('Newest mobile question')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Newest mobile response.')).toBeVisible()
  await expect(composer).toBeFocused()
  await expect.poll(() => scroll.evaluate((element) => (
    element.scrollTop + element.clientHeight >= element.scrollHeight - 1
  ))).toBe(true)
})

test('Migrates browser chat history without triggering a duplicate autosave', async ({ page }) => {
  const now = new Date().toISOString()
  const conversation = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Plan tomorrow',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: [{
      id: '22222222-2222-4222-8222-222222222222',
      role: 'user',
      content: 'Plan tomorrow',
      createdAt: now,
    }],
  }
  let saveRequests = 0

  await page.addInitScript((storedConversation) => {
    localStorage.setItem('healthyflow-assistant-conversations-v1', JSON.stringify([storedConversation]))
    localStorage.removeItem('healthyflow-assistant-conversations-v1-migrated')
  }, conversation)
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ contentType: 'application/json', body: '[]' })
      return
    }
    if (route.request().method() === 'PUT') {
      saveRequests += 1
      await route.fulfill({
        status: saveRequests === 1 ? 200 : 500,
        contentType: 'application/json',
        body: saveRequests === 1
          ? JSON.stringify(conversation)
          : JSON.stringify({ error: 'Failed to save chat history' }),
      })
      return
    }
    await route.fallback()
  })

  await page.goto('/app/talk')
  await expect(page.getByText('Plan tomorrow').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() =>
    localStorage.getItem('healthyflow-assistant-conversations-v1-migrated')
  )).toBe('true')
  await page.waitForTimeout(700)

  expect(saveRequests).toBe(1)
  await expect(page.getByText('Could not save chat history.')).toHaveCount(0)
})

test('Serializes autosaves while an earlier chat save is still in flight', async ({ page }) => {
  const now = new Date().toISOString()
  const conversation = {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Existing plan',
    model: 'gpt-4o-mini',
    createdAt: now,
    updatedAt: now,
    messages: [{
      id: '44444444-4444-4444-8444-444444444444',
      role: 'user',
      content: 'Existing plan',
      createdAt: now,
    }],
  }
  let activeSaves = 0
  let maximumConcurrentSaves = 0
  const savedMessageCounts: number[] = []

  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([conversation]),
      })
      return
    }
    if (route.request().method() === 'PUT') {
      const snapshot = route.request().postDataJSON() as { messages: unknown[] }
      activeSaves += 1
      maximumConcurrentSaves = Math.max(maximumConcurrentSaves, activeSaves)
      savedMessageCounts.push(snapshot.messages.length)
      await new Promise((resolve) => setTimeout(resolve, 600))
      activeSaves -= 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(snapshot),
      })
      return
    }
    await route.fallback()
  })
  await page.route('**/api/ai/chat', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450))
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Here is the updated plan.',
        toolEvents: [],
        pendingActions: [],
      }),
    })
  })

  await page.goto('/app/talk')
  await page.getByPlaceholder(/Add anything/).fill('Update the plan')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByText('Here is the updated plan.')).toBeVisible()
  await expect.poll(() => savedMessageCounts, { timeout: 4_000 }).toEqual([2, 3])

  expect(maximumConcurrentSaves).toBe(1)
  await expect(page.getByText('Could not save chat history.')).toHaveCount(0)
})

test('Mobile assistant composer wraps long text instead of hiding it off-screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/talk')

  const mainBox = await page.locator('main').boundingBox()
  const talkSurfaceBox = await page.locator('main > div > div').first().boundingBox()
  const mobileHeaderBox = await page.locator('header.pwa-mobile-header').boundingBox()
  const bottomNavBox = await page.locator('div.fixed.bottom-0.left-0.right-0').boundingBox()
  const composerForm = page.locator('form').filter({ has: page.getByPlaceholder(/Add anything/) })
  const formBox = await composerForm.boundingBox()
  expect(mainBox).toBeTruthy()
  expect(talkSurfaceBox).toBeTruthy()
  expect(mobileHeaderBox).toBeTruthy()
  expect(bottomNavBox).toBeTruthy()
  expect(formBox).toBeTruthy()
  expect(mainBox!.y).toBeGreaterThanOrEqual(mobileHeaderBox!.y + mobileHeaderBox!.height - 1)
  // Deliberately no assertions on the header's background-image / backdrop-filter
  // here. They were checking that the header paints opaquely so the composer
  // cannot show through it — but they did it by pinning exact CSS, which broke
  // the moment #151 moved the header onto semantic tokens even though the header
  // still paints opaquely. Appearance is covered by the snapshots in
  // responsive-visual-system.spec.ts at this exact viewport; what belongs here is
  // the geometry this test is named for.
  const headerOpacity = await page.locator('header.pwa-mobile-header').evaluate((element) => {
    const styles = window.getComputedStyle(element)
    return { opacity: styles.opacity, paddingTop: styles.paddingTop }
  })
  expect(Number(headerOpacity.opacity)).toBe(1)
  expect(headerOpacity.paddingTop).toBe('0px')
  expect(Math.round(talkSurfaceBox!.x - mainBox!.x)).toBe(0)
  expect(Math.round(mainBox!.width - talkSurfaceBox!.width)).toBe(0)
  expect(formBox!.y).toBeLessThan(bottomNavBox!.y)
  expect(Math.abs((formBox!.y + formBox!.height) - bottomNavBox!.y)).toBeLessThanOrEqual(1)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(page.getByText('Chat history')).toHaveCount(0)

  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toBeVisible()
  await expect(page.getByLabel('Assistant model')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add manually' })).toBeHidden()
  const initialBox = await composer.boundingBox()
  const initialShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(initialBox).toBeTruthy()
  expect(initialShell).toBeTruthy()
  expect(initialBox!.height).toBeLessThanOrEqual(48)
  expect(initialShell!.height).toBeLessThanOrEqual(112)
  await composer.fill('plan a focused morning block then add groceries and send the workout notes')

  const box = await composer.boundingBox()
  const composerShell = await page.locator('form > div').filter({ has: composer }).boundingBox()
  expect(box).toBeTruthy()
  expect(composerShell).toBeTruthy()
  expect(box!.width).toBeGreaterThan(120)
  expect(box!.height).toBeGreaterThanOrEqual(initialBox!.height)
  expect(box!.height).toBeLessThanOrEqual(112)
  expect(composerShell!.height).toBeGreaterThan(box!.height)
  expect(composerShell!.y + composerShell!.height).toBeLessThanOrEqual(formBox!.y + formBox!.height)
})

test('Mobile Talk follows the visual viewport while the iOS keyboard is open', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    const events = new EventTarget()
    const viewport = {
      width: 390,
      height: 844,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    }
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: viewport,
    })
    Object.defineProperty(window, '__setTalkVisualViewport', {
      configurable: true,
      value: (height: number) => {
        viewport.height = height
        events.dispatchEvent(new Event('resize'))
      },
    })
  })

  const now = new Date().toISOString()
  const longResponse = Array.from(
    { length: 30 },
    (_, index) => `${index + 1}. A readable planning detail that should remain available while replying.`,
  ).join('\n')
  await page.route('**/api/ai/conversations**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        json: [{
          id: '55555555-5555-4555-8555-555555555555',
          title: 'Keyboard geometry',
          model: 'gpt-4o-mini',
          createdAt: now,
          updatedAt: now,
          messages: [{
            id: '66666666-6666-4666-8666-666666666666',
            role: 'assistant',
            content: longResponse,
            createdAt: now,
          }],
        }],
      })
      return
    }
    await route.fulfill({ json: route.request().postDataJSON() })
  })

  await page.goto('/app/talk')
  const transcript = page.locator('.assistant-messages-scroll')
  const composer = page.getByPlaceholder(/Add anything/)
  const composerForm = page.locator('.assistant-composer-form')
  const bottomDock = page.locator('.mobile-bottom-dock')
  await expect(page.getByText('A readable planning detail', { exact: false }).first()).toBeVisible()
  await transcript.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await composer.focus()

  await page.evaluate(() => {
    const setVisualViewport = (window as typeof window & {
      __setTalkVisualViewport: (height: number) => void
    }).__setTalkVisualViewport
    setVisualViewport(500)
  })

  await expect.poll(async () => {
    const box = await composerForm.boundingBox()
    return box ? Math.round(box.y + box.height) : null
  }).toBeLessThanOrEqual(500)
  await expect(bottomDock).toBeHidden()
  await expect.poll(async () => {
    const transcriptBox = await transcript.boundingBox()
    const formBox = await composerForm.boundingBox()
    if (!transcriptBox || !formBox) return null
    return Math.round(transcriptBox.y + transcriptBox.height - formBox.y)
  }).toBeLessThanOrEqual(1)
  await expect.poll(() => transcript.evaluate((element) => (
    element.scrollHeight - element.scrollTop - element.clientHeight
  ))).toBeLessThanOrEqual(2)

  await transcript.evaluate((element) => {
    element.scrollTop = 96
  })
  await page.evaluate(() => {
    const setVisualViewport = (window as typeof window & {
      __setTalkVisualViewport: (height: number) => void
    }).__setTalkVisualViewport
    setVisualViewport(844)
  })

  await expect(bottomDock).toBeVisible()
  await expect.poll(() => transcript.evaluate((element) => element.scrollTop)).toBeLessThan(160)
  await expect.poll(async () => {
    const formBox = await composerForm.boundingBox()
    const dockBox = await bottomDock.boundingBox()
    if (!formBox || !dockBox) return null
    return Math.round(formBox.y + formBox.height - dockBox.y)
  }).toBeLessThanOrEqual(1)
})

test('Confirmed assistant task appears on Today without a browser refresh', async ({ page }) => {
  const today = formatLocalDate(new Date())
  const title = `Assistant cache task ${Date.now()}`
  const createdAt = new Date().toISOString()
  await page.route('**/api/ai/conversations**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    return route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Prepared a Task for confirmation.',
        toolEvents: [],
        pendingActions: [{
          id: 'pending-add-task',
          capability: 'add_task',
          args: { title, category: 'personal', scheduledDate: today },
          preview: { title, category: 'personal', scheduledDate: today },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }],
      }),
    })
  )
  await page.route('**/api/ai/chat/confirm', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          item: {
            id: 'assistant-created-task',
            title,
            category: 'personal',
            type: 'task',
            repeat: 'none',
            completed: false,
            scheduledDate: today,
            startTime: null,
            duration: 30,
            location: null,
            createdAt,
            position: null,
            isHabitInstance: false,
            originalHabitId: null,
            rolledOverFromTaskId: null,
            originalCreatedAt: null,
            googleEventId: null,
            syncedToGoogle: false,
          },
        },
        action: {
          id: 'pending-add-task',
          capability: 'add_task',
          args: { title, category: 'personal', scheduledDate: today },
          preview: { title, category: 'personal', scheduledDate: today },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      }),
    })
  })

  await page.goto('/app')
  await page.evaluate(async () => {
    const { settingsService } = await import('/src/services/api.ts')
    await settingsService.updateSettings({ onboardingStatus: 'completed' })
  })
  await page.reload()
  await expect(page.getByText(title)).toHaveCount(0)

  await page.goto('/app/talk')
  await page.getByRole('button', { name: 'New Chat' }).click()
  await page.getByPlaceholder(/Add anything/).fill(`add ${title} today`)
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('region', { name: /Talk proposals/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('Action confirmed')).toBeVisible()

  await expect.poll(() => page.evaluate(async ({ date, expectedTitle }) => {
    const { taskService } = await import('/src/services/api.ts')
    return (await taskService.getTasks(date)).some((item) => item.title === expectedTitle)
  }, { date: today, expectedTitle: title })).toBe(true)

  await page.goto('/app')
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
})

test('Multiple Talk proposals are reviewed one card at a time on a narrow reduced-motion screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const expiresAt = new Date(Date.now() + 600_000).toISOString()
  const createdAt = new Date().toISOString()
  const proposals = [
    {
      id: 'proposal-one',
      capability: 'add_task',
      args: {
        title: 'A deliberately long first proposal title that must remain readable without widening the card',
        category: 'personal',
        scheduledDate: '2026-08-28',
      },
      preview: {},
      expiresAt,
    },
    {
      id: 'proposal-two',
      capability: 'add_task',
      args: { title: 'Second proposal', category: 'work', scheduledDate: '2026-08-28' },
      preview: {},
      expiresAt,
    },
    {
      id: 'proposal-three',
      capability: 'add_task',
      args: { title: 'Third proposal', category: 'health', scheduledDate: '2026-08-28' },
      preview: {},
      expiresAt,
    },
  ]
  const confirmed: string[] = []
  const canceled: string[] = []

  await page.route('**/api/ai/conversations**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    return route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat', (route) => route.fulfill({
    json: {
      message: 'I prepared three independent changes for review.',
      toolEvents: [],
      pendingActions: proposals,
    },
  }))
  await page.route('**/api/ai/chat/confirm', async (route) => {
    const body = route.request().postDataJSON() as { actionId: string; args: Record<string, unknown> }
    if (body.actionId === 'proposal-one') {
      return route.fulfill({
        status: 409,
        json: { error: 'This proposal expired after the underlying Item changed. Review a fresh proposal before confirming.' },
      })
    }
    confirmed.push(body.actionId)
    await new Promise((resolve) => setTimeout(resolve, 250))
    const action = proposals.find((proposal) => proposal.id === body.actionId)!
    return route.fulfill({
      json: {
        action: { ...action, args: body.args },
        result: {
          item: {
            id: `item-${body.actionId}`,
            title: body.args.title,
            category: body.args.category,
            type: 'task',
            repeat: 'none',
            completed: false,
            scheduledDate: body.args.scheduledDate,
            startTime: null,
            duration: 30,
            location: null,
            createdAt,
            position: null,
            isHabitInstance: false,
            originalHabitId: null,
            rolledOverFromTaskId: null,
            originalCreatedAt: null,
            googleEventId: null,
            syncedToGoogle: false,
          },
        },
      },
    })
  })
  await page.route('**/api/ai/chat/cancel', async (route) => {
    const body = route.request().postDataJSON() as { actionId: string }
    canceled.push(body.actionId)
    await new Promise((resolve) => setTimeout(resolve, 150))
    return route.fulfill({ json: proposals.find((proposal) => proposal.id === body.actionId) })
  })

  await page.goto('/app/talk')
  await page.getByRole('button', { name: 'New Chat' }).click()
  await page.getByPlaceholder(/Add anything/).fill('Prepare three changes')
  await page.getByRole('button', { name: 'Send' }).click()

  const deck = page.getByRole('region', { name: '3 Talk proposals' })
  await expect(deck).toBeVisible()
  await expect(page.getByText('Proposal 1 of 3', { exact: true })).toBeVisible()
  await expect(deck.getByRole('group', { name: /Proposal 1 of 3/ })).toBeVisible()
  await expect(deck.getByTestId('talk-proposal-card')).toHaveCount(3)
  await expect(deck.getByRole('group')).toHaveCount(1)
  await expect.poll(() => deck.evaluate((element) => ({
    overflowX: getComputedStyle(element).overflowX,
    snap: getComputedStyle(element).scrollSnapType,
    fits: element.scrollWidth > element.clientWidth,
  }))).toEqual({ overflowX: 'auto', snap: 'x mandatory', fits: true })

  await page.getByRole('button', { name: 'Next proposal' }).click()
  await expect(page.getByText('Proposal 2 of 3', { exact: true })).toBeVisible()
  const second = deck.getByRole('group', { name: /Proposal 2 of 3/ })
  const confirmSecond = second.getByRole('button', { name: 'Confirm this proposal' })
  await confirmSecond.click()
  await expect(second.getByRole('button', { name: /Working/ })).toBeDisabled()
  await expect(second.getByText(/Completed: Item: Second proposal/)).toBeVisible()
  expect(confirmed).toEqual(['proposal-two'])

  await page.getByRole('button', { name: 'Next proposal' }).click()
  await expect(page.getByText('Proposal 3 of 3', { exact: true })).toBeVisible()
  const third = deck.getByRole('group', { name: /Proposal 3 of 3/ })
  await third.getByRole('button', { name: 'Cancel this proposal' }).click()
  await expect(third.getByText('Canceled', { exact: true })).toBeVisible()
  expect(canceled).toEqual(['proposal-three'])

  await deck.focus()
  await deck.press('ArrowLeft')
  await expect(page.getByText('Proposal 2 of 3', { exact: true })).toBeVisible()
  await deck.press('ArrowLeft')
  await expect(page.getByText('Proposal 1 of 3', { exact: true })).toBeVisible()
  const first = deck.getByRole('group', { name: /Proposal 1 of 3/ })
  await first.getByRole('button', { name: 'Confirm this proposal' }).click()
  await expect(first.getByText(/This proposal expired after the underlying Item changed/)).toBeVisible()
  await page.getByRole('button', { name: 'Next proposal' }).click()
  await expect(deck.getByRole('group', { name: /Proposal 2 of 3/ }).getByText(/Completed: Item: Second proposal/)).toBeVisible()
  await page.getByRole('button', { name: 'Next proposal' }).click()
  await expect(deck.getByRole('group', { name: /Proposal 3 of 3/ }).getByText('Canceled', { exact: true })).toBeVisible()
})

test('Workout handoff reviews, edits, and confirms one reusable plan on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const createdAt = new Date().toISOString()
  let plans: Array<Record<string, unknown>> = []
  let confirmedArgs: Record<string, unknown> | null = null
  let firstChatRequest: Record<string, unknown> | null = null
  let chatCalls = 0

  await page.route('**/api/workouts/plans**', (route) => route.fulfill({ json: plans }))
  await page.route('**/api/workouts/exercises**', (route) => route.fulfill({ json: [] }))
  await page.route(/\/api\/workouts\?/, (route) => route.fulfill({ json: [] }))
  await page.route('**/api/ai/conversations**', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    return route.fulfill({ json: route.request().postDataJSON() })
  })
  await page.route('**/api/ai/chat/confirm', (route) => {
    const body = route.request().postDataJSON() as { actionId: string; args: Record<string, unknown> }
    confirmedArgs = body.args
    const exercises = body.args.exercises as Array<Record<string, unknown>>
    const plan = {
      id: 'talk-plan-1',
      userId: 'e2e-user',
      name: body.args.name,
      color: body.args.color,
      note: body.args.note,
      position: 0,
      exercises: exercises.map((exercise, index) => ({
        ...exercise,
        id: `talk-plan-exercise-${index + 1}`,
        planId: 'talk-plan-1',
        position: index,
      })),
      createdAt,
      updatedAt: createdAt,
    }
    plans = [plan]
    return route.fulfill({
      json: {
        result: { plan },
        action: {
          id: body.actionId,
          capability: 'add_workout_plan',
          args: body.args,
          preview: { action: 'add_workout_plan', willCreate: { plan: body.args } },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        },
      },
    })
  })
  await page.route('**/api/ai/chat', (route) => {
    chatCalls += 1
    if (chatCalls === 1) firstChatRequest = route.request().postDataJSON() as Record<string, unknown>
    if (chatCalls > 1) {
      return route.fulfill({ json: { message: 'The Workout plan is saved.', toolEvents: [], pendingActions: [] } })
    }
    return route.fulfill({
      json: {
        message: 'I prepared a reusable Workout plan. Review every field before saving.',
        toolEvents: [],
        pendingActions: [{
          id: '11111111-1111-4111-8111-111111111111',
          capability: 'add_workout_plan',
          args: {
            requestId: 'workout-plan-strength-1',
            name: 'Starter strength',
            color: '#22d3ee',
            note: 'Two balanced sessions each week.',
            exercises: [{
              name: 'Goblet squat',
              sets: 3,
              reps: 8,
              weightKg: 20,
              durationMinutes: null,
              distanceKm: null,
              notes: 'Controlled tempo',
              position: 0,
            }],
          },
          preview: { action: 'add_workout_plan', willCreate: { plan: { name: 'Starter strength' } } },
          expiresAt: new Date(Date.now() + 600_000).toISOString(),
        }],
      },
    })
  })

  await page.goto('/app/workouts?mode=plan')
  await page.getByRole('button', { name: 'New Plan' }).click()
  await page.getByTestId('workout-plan-editor').getByRole('button', { name: 'Open Talk' }).click()
  const composer = page.getByPlaceholder(/Add anything/)
  await expect(composer).toHaveValue(/reusable Workout plan/)
  await expect(composer).toHaveValue(/approval before saving/i)
  await composer.press('Enter')

  expect(firstChatRequest).toMatchObject({
    handoff: { source: 'workouts', intent: 'draft_workout_plan' },
  })

  await page.getByLabel('Plan name').fill('Edited full body')
  await page.getByLabel('Plan note').fill('Three balanced sessions each week.')
  await page.getByLabel('Exercise 1 name').fill('Front squat')
  await page.getByLabel('Exercise 1 sets').fill('4')
  await page.getByLabel('Exercise 1 reps').fill('6')
  await page.getByLabel('Exercise 1 weight kg').fill('45')
  await page.getByLabel('Exercise 1 duration minutes').fill('10')
  await page.getByLabel('Exercise 1 distance km').fill('1')
  await page.getByLabel('Exercise 1 notes').fill('Leave two reps in reserve')
  await page.getByRole('button', { name: 'Confirm' }).click()

  await expect(page.getByText('Completed: Workout plan: Edited full body')).toBeVisible()
  expect(confirmedArgs).toMatchObject({
    name: 'Edited full body',
    note: 'Three balanced sessions each week.',
    exercises: [{
      name: 'Front squat',
      sets: 4,
      reps: 6,
      weightKg: 45,
      durationMinutes: 10,
      distanceKm: 1,
      notes: 'Leave two reps in reserve',
      position: 0,
    }],
  })

  await page.goto('/app/workouts?mode=plan')
  await expect(page.getByTestId('workout-plan-card').filter({ hasText: 'Edited full body' })).toHaveCount(1)
  await expect(page.getByText('Front squat')).toBeVisible()
})
