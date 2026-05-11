import type { AgentId } from './types'
import prisonEye from '../referenceImage/PrisonEye.png'
import developerEye from '../referenceImage/DeveloperEye.png'
import townEye from '../referenceImage/TownEye.png'

export type DisplayKey = 'prison' | 'developer' | 'town'

export interface AgentDisplayConfig {
  key: DisplayKey
  id: AgentId
  label: string
  role: string
  screenName: string
  image: string
}

export const AGENT_DISPLAYS: Record<DisplayKey, AgentDisplayConfig> = {
  prison: {
    key: 'prison',
    id: 'Agent_Prison',
    label: 'Prison',
    role: 'Concord Prison',
    screenName: 'Prison Agent',
    image: prisonEye,
  },
  developer: {
    key: 'developer',
    id: 'Agent_Developer',
    label: 'Developer',
    role: 'Government / Developer',
    screenName: 'Developer Agent',
    image: developerEye,
  },
  town: {
    key: 'town',
    id: 'Agent_Town',
    label: 'Town',
    role: 'Concord Community',
    screenName: 'Town Agent',
    image: townEye,
  },
}

export const DISPLAY_ORDER: DisplayKey[] = ['prison', 'developer', 'town']

export function getDisplayByPath(pathname: string): AgentDisplayConfig {
  const key = pathname.split('/').filter(Boolean).pop() as DisplayKey | undefined
  if (key && key in AGENT_DISPLAYS) return AGENT_DISPLAYS[key]
  return AGENT_DISPLAYS.prison
}

export function getDisplayByAgent(agentId: AgentId): AgentDisplayConfig {
  return DISPLAY_ORDER.map((key) => AGENT_DISPLAYS[key]).find((item) => item.id === agentId) ?? AGENT_DISPLAYS.prison
}
