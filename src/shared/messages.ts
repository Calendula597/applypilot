import type { FillResult, Profile } from './types'
import type { LlmMapPayload } from './llm'

/** popup → content：注入后发送，要求填充当前页。 */
export interface FillRequestMessage {
  type: 'FILL_RESUME'
  profile: Profile
}

/** popup → content：打开 givemeoc 岗位雷达面板。 */
export interface OpenOcPanelMessage {
  type: 'OPEN_OC_PANEL'
}

/** content 面板 → background：打开报名页并自动填充。 */
export interface OcApplyMessage {
  type: 'OC_APPLY'
  url: string
}

/** background → content：页面内横幅提示。 */
export interface ShowBannerMessage {
  type: 'SHOW_BANNER'
  text: string
}

export type PopupToContentMessage = FillRequestMessage | OpenOcPanelMessage | ShowBannerMessage

/** content → background：把未识别字段交给 LLM 映射（content 受宿主页 CORS 约束，必须由扩展进程发起请求）。 */
export interface LlmMapFieldsMessage {
  type: 'LLM_MAP_FIELDS'
  payload: LlmMapPayload
}

export type LlmMapResponse = { ok: true; mappings: { i: number; key: string }[] } | { ok: false; error: string }

/** content → popup：回包。 */
export type FillResponse = { ok: true; result: FillResult } | { ok: false; error: string }
