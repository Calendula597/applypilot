/**
 * Background service worker：
 * 接收岗位雷达的 OC_APPLY → 打开报名页 → 加载完成后自动注入 content.js 并触发一键填充；
 * 接收 content 的 LLM_MAP_FIELDS → 代发 LLM 请求（content 受宿主页 CORS 约束，扩展进程才有权限旁路）。
 * pendingFill 状态放 storage.session，service worker 被回收也能恢复。
 */
import { loadStore, getActiveProfile } from '../shared/storage'
import { loadLlmConfig, llmMapFields, type LlmMapPayload } from '../shared/llm'
import type { LlmMapResponse } from '../shared/messages'

chrome.runtime.onMessage.addListener(
  (msg: { type: string; url?: string; payload?: LlmMapPayload }, _sender, sendResponse: (resp: unknown) => void) => {
    if (msg.type === 'OC_APPLY' && msg.url) {
      void handleApply(msg.url)
      sendResponse({ ok: true })
      return false
    }
    if (msg.type === 'LLM_MAP_FIELDS' && msg.payload) {
      void handleLlmMap(msg.payload).then(sendResponse)
      return true // 异步回包
    }
    return false
  }
)

async function handleLlmMap(payload: LlmMapPayload): Promise<LlmMapResponse> {
  try {
    const cfg = await loadLlmConfig()
    if (!cfg) return { ok: false, error: '未配置 LLM API 或已关闭填充兜底' }
    return { ok: true, mappings: await llmMapFields(payload, cfg) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

async function handleApply(url: string): Promise<void> {
  const tab = await chrome.tabs.create({ url, active: true })
  if (!tab.id) return
  await chrome.storage.session.set({ [`pendingFill:${tab.id}`]: url })
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'complete') return
  void autoFillTab(tabId)
})

async function autoFillTab(tabId: number): Promise<void> {
  const key = `pendingFill:${tabId}`
  const got = await chrome.storage.session.get(key)
  if (!got[key]) return
  await chrome.storage.session.remove(key)
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
    const store = await loadStore()
    const profile = getActiveProfile(store)
    if (!profile) return
    const resp = (await chrome.tabs.sendMessage(tabId, { type: 'FILL_RESUME', profile })) as
      | { ok: true; result: { pageDetected: boolean; filled: number; failed: unknown[] } }
      | { ok: false; error: string }
      | undefined
    if (resp && resp.ok && !resp.result.pageDetected) {
      await chrome.tabs.sendMessage(tabId, {
        type: 'SHOW_BANNER',
        text: '岗位雷达：已打开投递页，但此页没有检测到报名表单（可能是职位列表页或公众号文章）。请点开具体岗位的投递入口，再点插件「⚡一键填充」。'
      })
    }
  } catch (e) {
    console.warn('投递副驾：自动填充失败', e)
  }
}
