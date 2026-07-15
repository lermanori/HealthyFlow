import fs from 'fs'
import {
  NUTRITION_LABEL_OCR_JSON_SCHEMA,
  NUTRITION_LABEL_OCR_PROMPT,
} from '../../src/openai'

const DEFAULT_MULLER_PHOTO_PATH =
  '/tmp/codex-remote-attachments/019f6592-a01e-7de1-858c-6da9c75c6f70/CEDD7F7B-2FB8-42C8-88BA-7379D6BBA619/1-Photo-1.jpg'

const runLiveOcrTest =
  process.env.RUN_OPENAI_LABEL_OCR_E2E === '1' &&
  process.env.OPENAI_API_KEY &&
  process.env.OPENAI_API_KEY !== 'test-openai-key'

const describeLive = runLiveOcrTest ? describe : describe.skip

function parseLabelNumber(value: string) {
  const match = value.replace(',', '.').match(/\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : null
}

function findRowValue(rows: Array<{ rawValues: string[]; rawLabel: string }>, pattern: RegExp) {
  const row = rows.find((candidate) => pattern.test(candidate.rawLabel))
  return row ? parseLabelNumber(row.rawValues[0] ?? '') : null
}

describeLive('nutrition label OCR — live OpenAI extraction', () => {
  jest.setTimeout(45_000)

  it('extracts Müller bottle table rows first, then calculates full-bottle macros', async () => {
    const photoPath = process.env.MULLER_LABEL_PHOTO_PATH ?? DEFAULT_MULLER_PHOTO_PATH
    expect(fs.existsSync(photoPath)).toBe(true)

    const photoData = fs.readFileSync(photoPath).toString('base64')
    const model = process.env.OPENAI_LABEL_OCR_MODEL ?? 'gpt-4o-mini'
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are an OCR engine for nutrition labels. Return JSON only.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: NUTRITION_LABEL_OCR_PROMPT },
              { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photoData}` } },
            ],
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'nutrition_label_ocr',
            schema: NUTRITION_LABEL_OCR_JSON_SCHEMA,
            strict: true,
          },
        },
        ...(model.startsWith('gpt-5') ? { max_completion_tokens: 1200 } : { max_tokens: 1200 }),
      }),
    })

    expect(response.ok).toBe(true)
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
    const ocr = JSON.parse(data.choices[0].message.content)
    const rows = ocr.rows as Array<{ rawValues: string[]; rawLabel: string }>

    expect(ocr.brand).toMatch(/m[uü]ller/i)
    expect(ocr.productName).toMatch(/קפה/)
    expect(ocr.claimText).toMatch(/0\s*%/)
    expect(ocr.basisText).toMatch(/100/)
    expect(ocr.packageText).toMatch(/350/)
    expect([ocr.productText, ocr.claimText].filter(Boolean).join(' ')).toMatch(/0\s*%/)
    expect(rows.length).toBeGreaterThanOrEqual(7)

    const caloriesPer100ml = findRowValue(rows, /(אנרגיה|קלוריות)/)
    const fatPer100ml = findRowValue(rows, /(שומנים|שומן)/)
    const carbsPer100ml = findRowValue(rows, /(פחמימות|סך הפחמימות)/)
    const proteinPer100ml = findRowValue(rows, /(חלבונים|חלבון)/)
    const calcium = findRowValue(rows, /סידן/)

    expect(caloriesPer100ml).toBe(45)
    expect(fatPer100ml).toBe(0)
    expect(carbsPer100ml).toBeCloseTo(4.2, 1)
    expect(proteinPer100ml).toBeCloseTo(7.15, 2)
    expect(calcium).toBe(175)

    const packageMultiplier = 350 / 100
    expect(Math.round(caloriesPer100ml! * packageMultiplier)).toBe(158)
    expect(Math.round(proteinPer100ml! * packageMultiplier * 10) / 10).toBe(25)
    expect(Math.round(carbsPer100ml! * packageMultiplier * 10) / 10).toBe(14.7)
    expect(Math.round(fatPer100ml! * packageMultiplier * 10) / 10).toBe(0)
  })
})
