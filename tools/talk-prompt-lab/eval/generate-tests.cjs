module.exports = async function generateTalkTests() {
  const { loadScenarios, dateContext } = await import('../scenario-catalog.mjs')
  return loadScenarios()
    .filter((scenario) => scenario.expect)
    .map((scenario) => ({
      description: `${scenario.id}: ${scenario.label}`,
      vars: { scenarioId: scenario.id, DATE_CONTEXT: dateContext(scenario.anchor) },
      assert: [
        {
          type: 'javascript',
          value: 'file://eval/assertions.cjs:validateTalkBehavior',
          config: scenario.expect,
        },
        ...(scenario.rubric ? [{ type: 'llm-rubric', value: scenario.rubric, provider: 'openai:chat:gpt-4o-mini' }] : []),
      ],
    }))
}
