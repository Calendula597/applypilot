/**
 * 岗位雷达（givemeoc.com 专用）：
 * 读取用户档案 → 解析汇总表行 → 按岗位词/城市/届别/学历打分排序 → 面板展示推荐 →
 * 「去投递」授权后由 background 打开报名页并自动触发一键填充。
 */
import { loadStore, getActiveProfile } from '../shared/storage'
import type { Profile } from '../shared/types'

// ---------- 数据解析 ----------

export interface OcRow {
  company: string
  type: string
  industry: string
  recruitType: string
  target: string // 招聘对象，如 "2026届,2027届"
  locations: string
  positions: string
  progress: string // 未投递/已投递/…
  deadline: string // "招满为止" 或 YYYY-MM-DD
  applyUrl: string
  note: string
  el: HTMLElement | null // 当前行在页面里时用于滚动定位
}

export function parseRow(tr: Element): OcRow | null {
  const cells = Array.from(tr.children) as HTMLElement[]
  if (cells.length < 11) return null
  const applyLink = cells[10]?.querySelector('a') as HTMLAnchorElement | null
  const progressSel = cells[7]?.querySelector('select') as HTMLSelectElement | null
  const row: OcRow = {
    company: (cells[0]?.textContent ?? '').trim(),
    type: (cells[1]?.textContent ?? '').trim(),
    industry: (cells[2]?.textContent ?? '').trim(),
    recruitType: (cells[3]?.textContent ?? '').trim(),
    target: (cells[4]?.textContent ?? '').trim(),
    locations: (cells[5]?.textContent ?? '').trim(),
    positions: (cells[6]?.textContent ?? '').trim(),
    progress: progressSel ? progressSel.value : (cells[7]?.textContent ?? '').trim(),
    deadline: (cells[9]?.textContent ?? '').trim(),
    applyUrl: applyLink?.href ?? '',
    note: (cells[14]?.textContent ?? cells[13]?.textContent ?? '').trim(),
    el: tr as HTMLElement
  }
  if (!row.company || !row.applyUrl) return null
  return row
}

export function collectRows(root: Document | HTMLElement): OcRow[] {
  const trs = root.querySelectorAll('table tbody tr')
  const rows: OcRow[] = []
  for (const tr of trs) {
    const r = parseRow(tr)
    if (r) rows.push(r)
  }
  return rows
}

// ---------- 匹配打分 ----------

const CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京', '西安', '长沙',
  '重庆', '苏州', '天津', '合肥', '厦门', '青岛', '大连', '济南', '郑州', '福州',
  '昆明', '无锡', '佛山', '东莞', '珠海', '中山', '惠州', '宁波', '南昌', '贵阳',
  '太原', '石家庄', '哈尔滨', '长春', '沈阳', '兰州', '乌鲁木齐', '南宁', '海口', '香港'
]

const POSITION_TOKENS = [
  '前端', '后端', '全栈', '算法', '测试', '开发', '软件', '产品', '运营', '数据分析',
  '数据开发', '安全', '运维', '嵌入式', '硬件', '交互设计', '视觉设计', 'UI', '人力',
  '财务', '会计', '法务', '市场', '营销', '行政', '咨询', '量化', '风控', '机械', '电气'
]

const DEGREE_RANK: Record<string, number> = { 高中: 1, 大专: 2, 本科: 3, 硕士: 4, 博士: 5 }

export interface MatchPref {
  positionTokens: string[]
  techTokens: string[]
  cityTokens: string[]
  gradYear: string // "2026"
  degreeRank: number
  degreeName: string
}

export function buildMatchPref(profile: Profile): MatchPref {
  const pos = profile.intention.targetPosition || ''
  const tokens = new Set<string>()
  for (const t of POSITION_TOKENS) if (pos.includes(t)) tokens.add(t)
  if (tokens.size === 0 && pos) tokens.add(pos.slice(0, 4))
  const tech = (profile.skills.technical || '')
    .split(/[^A-Za-z0-9+#]+/)
    .map(s => s.trim())
    .filter(s => s.length >= 2)
  const cityText = profile.intention.expectCity || profile.personal.address || ''
  const cityTokens = CITIES.filter(c => cityText.includes(c))
  let gradYear = ''
  for (const e of profile.education) {
    const m = (e.endDate || '').match(/^(\d{4})/)
    if (m && m[1] > gradYear) gradYear = m[1]
  }
  const degreeName = profile.personal.highestEducation || ''
  return {
    positionTokens: Array.from(tokens),
    techTokens: tech.slice(0, 8),
    cityTokens,
    gradYear,
    degreeRank: DEGREE_RANK[degreeName] ?? 0,
    degreeName
  }
}

export interface ScoredRow {
  row: OcRow
  score: number
  reasons: string[]
  urgent: boolean
}

const EXCLUDED_PROGRESS = new Set(['已投递', '已挂', '暂不投递', '已笔试', '已面试', '面试通过'])

export function scoreRow(row: OcRow, pref: MatchPref): ScoredRow | null {
  // 进度：进行中/已结束的直接排除
  if (row.progress && EXCLUDED_PROGRESS.has(row.progress)) return null

  // 届别不符：岗位面向的届不含用户毕业届 → 大幅降权而非硬排除（跨届也可投）
  let score = 0
  const reasons: string[] = []

  const gradHit = !pref.gradYear || row.target.includes(`${pref.gradYear}届`)
  if (gradHit) {
    score += 6
    if (pref.gradYear) reasons.push(`${pref.gradYear}届`)
  } else {
    score -= 4
  }

  // 岗位词命中
  const posHit: string[] = []
  for (const t of pref.positionTokens) {
    if (t && row.positions.includes(t)) posHit.push(t)
  }
  if (posHit.length > 0) {
    score += 10 + posHit.length * 2
    reasons.push(`岗位:${posHit.join('/')}`)
  } else if (row.positions && pref.positionTokens.length > 0) {
    score -= 2
  }

  // 技术词命中
  const techHit = pref.techTokens.filter(t => row.positions.toLowerCase().includes(t.toLowerCase()))
  if (techHit.length > 0) {
    score += 4 * Math.min(techHit.length, 3)
    reasons.push(`技术:${techHit.slice(0, 3).join('/')}`)
  }

  // 城市
  const rowCities = CITIES.filter(c => row.locations.includes(c))
  const cityHit = pref.cityTokens.filter(c => rowCities.includes(c))
  if (cityHit.length > 0) {
    score += 8
    reasons.push(`城市:${cityHit.join('/')}`)
  } else if (row.locations.includes('全国')) {
    score += 4
    reasons.push('全国')
  } else if (pref.cityTokens.length > 0 && row.locations) {
    score -= 1
  }

  // 学历门槛（备注里常见「硕士起」「硕士及以上」）
  const m = row.note.match(/(博士|硕士|本科)(?:起|及以上)/)
  if (m) {
    const need = m[1] === '博士' ? 5 : m[1] === '硕士' ? 4 : 3
    if (pref.degreeRank > 0 && pref.degreeRank < need) return null // 学历不达标，排除
    if (pref.degreeRank >= need) reasons.push(`学历${m[1]}起✓`)
  }

  // 截止时间
  let urgent = false
  if (/^\d{4}-\d{2}-\d{2}$/.test(row.deadline)) {
    const today = new Date().toISOString().slice(0, 10)
    if (row.deadline < today) return null // 已截止
    const days = Math.round((Date.parse(row.deadline) - Date.now()) / 86400000)
    if (days <= 7) {
      urgent = true
      reasons.push(`${days}天内截止`)
      score += 2
    }
  } else if (row.deadline.includes('招满为止')) {
    score += 1
  }

  // 实习 vs 校招：用户在读硕士（无毕业届或届别在今明两年）也给实习机会
  if (row.recruitType.includes('实习') && pref.gradYear) {
    score -= 1
  }

  if (score <= 0) return null
  return { row, score, reasons, urgent }
}

export function rankRows(rows: OcRow[], pref: MatchPref, limit = 15): ScoredRow[] {
  const scored: ScoredRow[] = []
  for (const r of rows) {
    const s = scoreRow(r, pref)
    if (s) scored.push(s)
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit)
}

// ---------- 面板 UI ----------

const PANEL_ID = 'rf-oc-panel'

function panelCss(): string {
  return `
  #${PANEL_ID}{position:fixed;top:70px;right:16px;width:400px;max-height:76vh;z-index:2147483000;
    background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.22);
    font:13px/1.6 system-ui,'Microsoft YaHei',sans-serif;color:#1f2329;display:flex;flex-direction:column;overflow:hidden}
  #${PANEL_ID} .rf-head{padding:12px 16px;background:linear-gradient(135deg,#254ec7,#4f7cff);color:#fff;display:flex;align-items:center;gap:8px}
  #${PANEL_ID} .rf-head b{flex:1;font-size:14px}
  #${PANEL_ID} .rf-close{border:none;background:none;color:#fff;font-size:16px;cursor:pointer}
  #${PANEL_ID} .rf-sub{padding:8px 16px;background:#f5f8ff;color:#5a6b8c;font-size:12px;border-bottom:1px solid #e5eaf5}
  #${PANEL_ID} .rf-list{overflow-y:auto;padding:8px}
  #${PANEL_ID} .rf-item{border:1px solid #eceff4;border-radius:10px;padding:10px 12px;margin-bottom:8px}
  #${PANEL_ID} .rf-item.urgent{border-color:#ffb020;background:#fffaf0}
  #${PANEL_ID} .rf-top{display:flex;align-items:center;gap:8px}
  #${PANEL_ID} .rf-co{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #${PANEL_ID} .rf-score{background:#eaf1ff;color:#2b5cd9;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:600}
  #${PANEL_ID} .rf-meta{color:#6b7480;font-size:12px;margin:3px 0}
  #${PANEL_ID} .rf-tags{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}
  #${PANEL_ID} .rf-tag{background:#eef7ee;color:#2e7d32;border-radius:4px;padding:0 6px;font-size:11px}
  #${PANEL_ID} .rf-tag.warn{background:#fff4e5;color:#ad6800}
  #${PANEL_ID} .rf-go{background:#4f7cff;color:#fff;border:none;border-radius:7px;padding:5px 12px;font-size:12px;cursor:pointer}
  #${PANEL_ID} .rf-go:hover{background:#3b6ae8}
  #${PANEL_ID} .rf-go:disabled{opacity:.5;cursor:wait}
  #${PANEL_ID} .rf-foot{padding:10px;display:flex;gap:8px;border-top:1px solid #eceff4}
  #${PANEL_ID} .rf-btn{flex:1;border:1px solid #d5d9e0;background:#fff;border-radius:8px;padding:7px;cursor:pointer;font-size:12px;color:#2b5cd9}
  #${PANEL_ID} .rf-btn:hover{background:#f5f8ff}
  #${PANEL_ID} .rf-empty{padding:24px;text-align:center;color:#8f959e}
  #rf-page-banner{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483001;
    background:#2b5cd9;color:#fff;padding:10px 18px;border-radius:10px;font:13px/1.5 system-ui,sans-serif;
    box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80vw}
  `
}

export function showPageBanner(text: string): void {
  document.getElementById('rf-page-banner')?.remove()
  const div = document.createElement('div')
  div.id = 'rf-page-banner'
  div.textContent = text
  document.body.appendChild(div)
  setTimeout(() => div.remove(), 8000)
}

async function goApply(url: string, btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true
  btn.textContent = '授权中…'
  try {
    const has = await chrome.permissions.contains({ origins: ['<all_urls>'] })
    if (!has) {
      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] })
      if (!granted) {
        btn.disabled = false
        btn.textContent = '去投递'
        showPageBanner('岗位雷达：需要「所有网站」授权才能在新打开的报名页自动填写。可改为手动：点「去投递」打开页面后再点插件图标填充。')
        return
      }
    }
    await chrome.runtime.sendMessage({ type: 'OC_APPLY', url })
    btn.textContent = '已打开✓'
  } catch (e) {
    btn.disabled = false
    btn.textContent = '去投递'
    showPageBanner(`跳转失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

function renderPanel(scored: ScoredRow[], pref: MatchPref, totalRows: number, scannedPages: number): void {
  document.getElementById(PANEL_ID)?.remove()
  if (!document.getElementById('rf-oc-style')) {
    const style = document.createElement('style')
    style.id = 'rf-oc-style'
    style.textContent = panelCss()
    document.head.appendChild(style)
  }
  const panel = document.createElement('div')
  panel.id = PANEL_ID

  const prefDesc = [
    pref.positionTokens.length ? `岗位「${pref.positionTokens.join('/')}」` : '',
    pref.cityTokens.length ? `城市「${pref.cityTokens.join('/')}」` : '',
    pref.gradYear ? `${pref.gradYear}届` : '',
    pref.degreeName
  ]
    .filter(Boolean)
    .join(' · ')

  const head = document.createElement('div')
  head.className = 'rf-head'
  head.innerHTML = `<b>🎯 岗位雷达</b>`
  const close = document.createElement('button')
  close.className = 'rf-close'
  close.textContent = '✕'
  close.onclick = () => panel.remove()
  head.appendChild(close)
  panel.appendChild(head)

  const sub = document.createElement('div')
  sub.className = 'rf-sub'
  sub.textContent = `画像：${prefDesc || '未设置（去管理简历填写期望职位/城市/教育经历）'}｜扫描 ${scannedPages} 页 ${totalRows} 家，命中 ${scored.length} 家`
  panel.appendChild(sub)

  const list = document.createElement('div')
  list.className = 'rf-list'
  if (scored.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'rf-empty'
    empty.textContent = '当前页没有匹配的岗位。试试翻页后重新打开雷达，或点下方「再扫 5 页」。'
    list.appendChild(empty)
  }
  for (const s of scored) {
    const item = document.createElement('div')
    item.className = s.urgent ? 'rf-item urgent' : 'rf-item'
    const top = document.createElement('div')
    top.className = 'rf-top'
    const co = document.createElement('span')
    co.className = 'rf-co'
    co.title = s.row.company
    co.textContent = s.row.company
    const score = document.createElement('span')
    score.className = 'rf-score'
    score.textContent = `${s.score}分`
    const go = document.createElement('button')
    go.className = 'rf-go'
    go.textContent = s.urgent ? '急·去投递' : '去投递'
    go.onclick = () => void goApply(s.row.applyUrl, go)
    top.append(co, score, go)
    item.appendChild(top)

    const meta = document.createElement('div')
    meta.className = 'rf-meta'
    meta.textContent = `${s.row.type}｜${s.row.industry}｜${s.row.recruitType} ${s.row.target}｜截止 ${s.row.deadline}`
    item.appendChild(meta)

    if (s.reasons.length > 0) {
      const tags = document.createElement('div')
      tags.className = 'rf-tags'
      for (const r of s.reasons) {
        const tag = document.createElement('span')
        tag.className = r.includes('截止') ? 'rf-tag warn' : 'rf-tag'
        tag.textContent = r
        tags.appendChild(tag)
      }
      item.appendChild(tags)
    }
    list.appendChild(item)
  }
  panel.appendChild(list)

  const foot = document.createElement('div')
  foot.className = 'rf-foot'
  const more = document.createElement('button')
  more.className = 'rf-btn'
  more.textContent = '再扫 5 页'
  more.onclick = () => void extendScan(more)
  const refresh = document.createElement('button')
  refresh.className = 'rf-btn'
  refresh.textContent = '重新扫描'
  refresh.onclick = () => void openOcPanel()
  foot.append(more, refresh)
  panel.appendChild(foot)

  document.body.appendChild(panel)
}

let scannedPages = 1

export async function openOcPanel(): Promise<void> {
  scannedPages = 1
  const store = await loadStore()
  const profile = getActiveProfile(store)
  if (!profile) return
  const pref = buildMatchPref(profile)
  const rows = collectRows(document.body)
  renderPanel(rankRows(rows, pref), pref, rows.length, scannedPages)
}

async function extendScan(btn: HTMLButtonElement): Promise<void> {
  btn.disabled = true
  btn.textContent = '抓取中…'
  try {
    const store = await loadStore()
    const profile = getActiveProfile(store)
    if (!profile) return
    const pref = buildMatchPref(profile)
    const rows = collectRows(document.body)
    for (let p = scannedPages + 1; p <= scannedPages + 5; p++) {
      const resp = await fetch(`https://www.givemeoc.com/?paged=${p}`, { credentials: 'include' })
      if (!resp.ok) break
      const html = await resp.text()
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const pageRows = collectRows(doc.body)
      if (pageRows.length === 0) break
      rows.push(...pageRows)
    }
    scannedPages += 5
    renderPanel(rankRows(rows, pref), pref, rows.length, scannedPages)
  } finally {
    btn.disabled = false
    btn.textContent = '再扫 5 页'
  }
}
