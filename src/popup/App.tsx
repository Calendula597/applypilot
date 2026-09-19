import { useEffect, useState } from 'preact/hooks'
import { getActiveProfile, loadStore, saveStore, type Store } from '../shared/storage'
import type { FillResponse } from '../shared/messages'

export function App() {
  const [store, setStore] = useState<Store | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<FillResponse | null>(null)

  useEffect(() => {
    loadStore().then(setStore)
  }, [])

  async function switchProfile(id: string) {
    if (!store) return
    const next = { ...store, activeId: id }
    setStore(next)
    await saveStore(next)
  }

  async function onFill() {
    if (!store || busy) return
    const profile = getActiveProfile(store)
    setBusy(true)
    setOutcome(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('找不到当前标签页')
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      const resp = (await chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_RESUME',
        profile
      })) as FillResponse
      setOutcome(resp)
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  async function onOpenRadar() {
    setBusy(true)
    setOutcome(null)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) throw new Error('找不到当前标签页')
      if (!tab.url?.includes('givemeoc.com')) {
        throw new Error('请先打开 givemeoc.com 的校招汇总表页面，再点「岗位雷达」')
      }
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
      await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_OC_PANEL' })
      window.close()
    } catch (e) {
      setOutcome({ ok: false, error: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const profile = store ? getActiveProfile(store) : undefined
  const emptyProfileData =
    profile &&
    !profile.personal.fullName &&
    !profile.personal.phone &&
    profile.education.length === 0 &&
    profile.work.length === 0 &&
    profile.project.length === 0

  return (
    <div class="popup">
      <header class="popup-header">
        <span class="logo" />
        <h1>投递副驾</h1>
        <button class="link" title="编辑简历" onClick={() => chrome.runtime.openOptionsPage()}>
          管理简历
        </button>
      </header>

      {store && (
        <label class="field">
          <span>使用档案</span>
          <select value={store.activeId} onChange={e => switchProfile((e.target as HTMLSelectElement).value)}>
            {store.profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {emptyProfileData && (
        <div class="notice">
          当前档案还是空的，先去「管理简历」把简历填好，再回来一键填充。
        </div>
      )}

      <button class="primary" disabled={busy || !store} onClick={onFill}>
        {busy ? '正在填充…' : '⚡ 一键填充'}
      </button>

      <button class="secondary" disabled={busy || !store} onClick={onOpenRadar} title="在 givemeoc.com 汇总表页使用：按你的档案推荐最适合的岗位并可一键跳转投递">
        🎯 岗位雷达（givemeoc）
      </button>

      {outcome && outcome.ok && (
        <div class="result">
          {outcome.result.pageDetected ? (
            <>
              <p class="ok">
                已填入 <b>{outcome.result.filled}</b> 个字段
                {outcome.result.llmFilled > 0 && <>（其中 LLM 兜底识别 {outcome.result.llmFilled} 个）</>}
                {outcome.result.failed.length > 0 && <>，{outcome.result.failed.length} 个未自动处理</>}
              </p>
              {outcome.result.failed.length > 0 && (
                <details>
                  <summary>查看未处理字段</summary>
                  <ul>
                    {dedupeReasons(outcome.result.failed).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </details>
              )}
              {outcome.result.llmError && <p class="warn">LLM 兜底识别未生效：{outcome.result.llmError}</p>}
            </>
          ) : (
            <p class="warn">当前页面没有发现可填充的表单。</p>
          )}
        </div>
      )}

      {outcome && !outcome.ok && <div class="result error">填充失败：{outcome.error}</div>}
    </div>
  )
}

function dedupeReasons(failed: { reason: string }[]): string[] {
  return Array.from(new Set(failed.map(f => f.reason)))
}
