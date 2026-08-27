export const MODELS = ['gpt-4o-mini', 'gpt-5-mini', 'gpt-5.4-mini']

export function initialState(promptCount, scenarioCount) {
  return {
    promptIndex: 0,
    scenarioIndex: 0,
    modelIndex: 0,
    promptCount,
    scenarioCount,
    status: 'ready',
    busy: false,
    view: 'result',
    runs: [],
    error: null,
  }
}

function next(index, count) {
  return count === 0 ? 0 : (index + 1) % count
}

export function reduceLabState(state, action) {
  switch (action.type) {
    case 'next_prompt':
      return { ...state, promptIndex: next(state.promptIndex, state.promptCount), runs: [], error: null }
    case 'next_scenario':
      return { ...state, scenarioIndex: next(state.scenarioIndex, state.scenarioCount), runs: [], error: null }
    case 'next_model':
      return { ...state, modelIndex: next(state.modelIndex, MODELS.length), runs: [], error: null }
    case 'toggle_view':
      return {
        ...state,
        view: state.view === 'result' ? 'prompt' : state.view === 'prompt' ? 'full' : 'result',
      }
    case 'run_started':
      return { ...state, busy: true, status: action.status, runs: [], error: null, view: 'result' }
    case 'run_finished':
      return { ...state, busy: false, status: 'ready', runs: action.runs, error: null }
    case 'run_failed':
      return { ...state, busy: false, status: 'ready', error: action.error }
    default:
      return state
  }
}
