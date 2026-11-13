import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropic } from '@ai-sdk/anthropic'
import { checkWorkbook } from './index'
import { DEFAULT_CHECKUP_MODEL, applyExplanation, baseResult, buildPromptPayload, explainCheckup, type Explanation } from './explain'
import { buildSyntheticWorkbook } from './testing/synthetic-workbook'

const bytes = buildSyntheticWorkbook()
const base = baseResult('sample.xlsx', bytes.length, checkWorkbook(bytes))

describe('what is sent to the model', () => {
  const payload = buildPromptPayload('sample.xlsx', base.structure, [...base.problems, ...base.questions])
  const json = JSON.stringify(payload)

  it('is the structure and the findings, not the data', () => {
    expect(payload.tabs.map((t) => t.tab)).toEqual(['Model', 'Data'])
    expect(payload.findings).toHaveLength(base.problems.length + base.questions.length)
    // At most a few sample values per column
    for (const tab of payload.tabs) for (const c of tab.columns) expect(c.samples.length).toBeLessThanOrEqual(4)
    // A price from deep in the data tab never leaves the server
    expect(json).not.toContain('137.35')
    expect(json.length).toBeLessThan(40_000)
  })

  it('carries one formula per pattern with its row count', () => {
    const model = payload.tabs[0]
    const priceA = model.columns.find((c) => c.column === 'B')!
    expect(priceA.formulas).toHaveLength(1)
    expect(priceA.formulas![0].rows).toBe(40)
  })
})

describe('laying the wording over the findings', () => {
  const first = base.problems[0]
  const question = base.questions[0]
  const ai: Explanation = {
    summary: 'It tracks three prices. It flags lows. It gives a signal.',
    columns: [
      { tab: 'Model', column: 'b', description: 'The first price for each date.' },
      { tab: 'Nowhere', column: 'A', description: 'Invented.' },
    ],
    findings: [
      { id: first.id, title: 'Price B looks at the wrong day', explanation: 'One. Two.', optionA: null, optionB: null, recommended: null, reason: null, basis: null },
      { id: 'made-up-finding', title: 'Invented problem', explanation: 'Not real.', optionA: null, optionB: null, recommended: null, reason: null, basis: null },
      { id: question.id, title: 'Running average or the day’s value?', explanation: 'One. Two.', optionA: 'Average so far', optionB: 'That day only', recommended: 'b', reason: 'A trader nets ups against downs.', basis: 'author' },
      { id: base.problems[1].id, title: 'Uses a relative reference', explanation: 'This array formula is off.', optionA: null, optionB: null, recommended: null, reason: null, basis: null },
    ],
  }
  const out = applyExplanation(base, ai)

  it('uses the model wording for known findings', () => {
    expect(out.problems[0].title).toBe('Price B looks at the wrong day')
    expect(out.summary).toContain('three prices')
    expect(out.explainedByAI).toBe(true)
    expect(out.structure.sheets[0].columns.find((c) => c.letter === 'B')!.description).toBe('The first price for each date.')
  })

  it('never adds, removes or alters findings', () => {
    expect(out.problems.map((p) => p.id)).toEqual(base.problems.map((p) => p.id))
    expect(out.questions.map((p) => p.id)).toEqual(base.questions.map((p) => p.id))
    expect(JSON.stringify(out)).not.toContain('Invented')
    expect(out.problems[0].rows).toEqual(first.rows)
    expect(out.problems[0].formulaSuggested).toBe(first.formulaSuggested)
  })

  it('labels the two choices of a question but keeps their formulas', () => {
    expect(out.questions[0].options!.map((o) => o.label)).toEqual(['Average so far', 'That day only'])
    expect(out.questions[0].options!.map((o) => o.formula)).toEqual(question.options!.map((o) => o.formula))
  })

  it('records which choice an experienced trader would make, only for questions', () => {
    expect(out.questions[0].recommended).toEqual({ key: 'b', reason: 'A trader nets ups against downs.', basis: 'author' })
    expect(out.problems.every((p) => p.recommended === undefined)).toBe(true)
    // A recommendation for something that is not a question is ignored
    const stray = applyExplanation(base, {
      ...ai,
      findings: [{ id: first.id, title: 'T', explanation: 'One. Two.', optionA: null, optionB: null, recommended: 'a', reason: 'Because.', basis: 'practice' }],
    })
    expect(stray.problems[0].recommended).toBeUndefined()
    expect(stray.questions[0].recommended).toBeUndefined()
  })

  it('falls back to the standard wording when the model uses jargon', () => {
    expect(out.problems[1].title).toBe(base.problems[1].title)
    expect(out.problems[1].explanation).toBe(base.problems[1].explanation)
  })
})

describe('when the AI is unavailable', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('still returns every finding with its standard wording', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    const out = await explainCheckup(base)
    expect(out.explainedByAI).toBe(false)
    expect(out.aiNote).toBeTruthy()
    expect(out.problems).toEqual(base.problems)
    expect(out.summary).toMatch(/found 9 problems and 2 questions/)
  })
})

describe('the request made to Claude (no network: the HTTP call is intercepted)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sent: any = null
  const reply: Explanation = {
    summary: 'One. Two. Three.',
    columns: [],
    findings: [{ id: base.problems[0].id, title: 'Reworded title', explanation: 'First. Second.', optionA: null, optionB: null, recommended: null, reason: null, basis: null }],
  }
  const respond = (status: number, body: unknown) =>
    (async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body))
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
  const ok = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: DEFAULT_CHECKUP_MODEL,
    content: [{ type: 'text', text: JSON.stringify(reply) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  }

  it('uses a current model with schema-constrained output and no retired parameters', async () => {
    const model = createAnthropic({ apiKey: 'test-key', fetch: respond(200, ok) })(DEFAULT_CHECKUP_MODEL)
    const out = await explainCheckup(base, { model })
    expect(out.explainedByAI).toBe(true)
    expect(out.problems[0].title).toBe('Reworded title')
    expect(out.problems[1].title).toBe(base.problems[1].title)

    expect(sent.model).toBe('claude-opus-5-5')
    expect(sent.output_config.format.type).toBe('json_schema')
    expect(sent.output_config.effort).toBe('medium')
    // These are rejected by current models
    expect(sent.temperature).toBeUndefined()
    expect(sent.top_p).toBeUndefined()
    expect(sent.tool_choice).toBeUndefined()
    expect(sent.tools).toBeUndefined()
    expect(sent.thinking?.type === undefined || sent.thinking.type === 'adaptive').toBe(true)
    expect(sent.thinking?.budget_tokens).toBeUndefined()
    // The workbook goes in the user turn as data; the rules stay in the system prompt
    expect(JSON.stringify(sent.messages)).toContain(base.problems[0].id)
    expect(JSON.stringify(sent.system)).toContain('Never add a finding')
    expect(JSON.stringify(sent.output_config.format.schema)).toContain('recommended')
  })

  it('passes pasted text and a screenshot from the method\'s author along as data', async () => {
    const withChoice = {
      ...ok,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...reply,
            findings: [
              { id: base.questions[0].id, title: 'Add or subtract', explanation: 'One. Two.', optionA: 'Adds them', optionB: 'Subtracts them', recommended: 'b', reason: 'The email says ups minus downs.', basis: 'author' },
            ],
          }),
        },
      ],
    }
    const model = createAnthropic({ apiKey: 'test-key', fetch: respond(200, withChoice) })(DEFAULT_CHECKUP_MODEL)
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const out = await explainCheckup(base, {
      model,
      reference: { text: 'Net = number of up days minus number of down days.', image: { bytes: png, mediaType: 'image/png' } },
    })
    const user = sent.messages[0].content
    expect(JSON.stringify(user)).toContain('Net = number of up days minus number of down days.')
    expect(user.some((part: { type: string }) => part.type === 'image')).toBe(true)
    expect(out.usedReference).toBe(true)
    expect(out.questions[0].recommended).toEqual({ key: 'b', reason: 'The email says ups minus downs.', basis: 'author' })
  })

  it('never credits the author when no reference material was given', async () => {
    const claims = {
      ...ok,
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...reply,
            findings: [
              { id: base.questions[0].id, title: 'T', explanation: 'One. Two.', optionA: 'A', optionB: 'B', recommended: 'a', reason: 'Standard practice.', basis: 'author' },
            ],
          }),
        },
      ],
    }
    const model = createAnthropic({ apiKey: 'test-key', fetch: respond(200, claims) })(DEFAULT_CHECKUP_MODEL)
    const out = await explainCheckup(base, { model })
    expect(out.usedReference).toBe(false)
    expect(out.questions[0].recommended?.basis).toBe('practice')
    expect(sent.messages[0].content.some((part: { type: string }) => part.type === 'image')).toBe(false)
  })

  it('keeps the standard wording when the call fails', async () => {
    const model = createAnthropic({ apiKey: 'test-key', fetch: respond(400, { type: 'error', error: { type: 'invalid_request_error', message: 'nope' } }) })(DEFAULT_CHECKUP_MODEL)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await explainCheckup(base, { model })
    spy.mockRestore()
    expect(out.explainedByAI).toBe(false)
    expect(out.aiNote).toMatch(/standard wording/)
    expect(out.problems).toEqual(base.problems)
  })

  it('keeps the standard wording when the reply is not the agreed shape', async () => {
    const bad = { ...ok, content: [{ type: 'text', text: '{"summary": 42}' }] }
    const model = createAnthropic({ apiKey: 'test-key', fetch: respond(200, bad) })(DEFAULT_CHECKUP_MODEL)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await explainCheckup(base, { model })
    spy.mockRestore()
    expect(out.explainedByAI).toBe(false)
    expect(out.problems).toEqual(base.problems)
  })
})
