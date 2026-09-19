import { fillPage } from './filler'
import { openOcPanel, showPageBanner } from './ocPanel'
import type { PopupToContentMessage } from '../shared/messages'

declare global {
  interface Window {
    __resumeFillerLoaded?: boolean
  }
}

// popup 每次点击都会 executeScript 注入本文件，用全局标记保证只注册一次监听。
if (!window.__resumeFillerLoaded) {
  window.__resumeFillerLoaded = true
  chrome.runtime.onMessage.addListener(
    (msg: PopupToContentMessage & { type: string; text?: string }, _sender: unknown, sendResponse: (resp: unknown) => void) => {
      if (msg.type === 'FILL_RESUME') {
        fillPage(msg.profile)
          .then(result => sendResponse({ ok: true, result }))
          .catch(err => sendResponse({ ok: false, error: String(err) }))
        return true // 异步回包
      }
      if (msg.type === 'OPEN_OC_PANEL') {
        openOcPanel().catch(err => showPageBanner(`岗位雷达打开失败：${String(err)}`))
        sendResponse({ ok: true })
        return false
      }
      if (msg.type === 'SHOW_BANNER') {
        showPageBanner(msg.text ?? '')
        sendResponse({ ok: true })
        return false
      }
    }
  )
}
