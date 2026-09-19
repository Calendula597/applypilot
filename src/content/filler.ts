/**
 * 填充引擎：把 Profile 写进扫出来的字段。
 * 关键点：React/Vue 受控组件需要原生 value setter + input/change 事件；
 * 自定义下拉/日期控件用「点触发器 → 找弹层 → 点选项」的尽力而为流程；
 * 多段经历用视觉行聚类 + 自动点「添加」。
 * 字段 key 与 Profile 属性一一对应，直接按键取值。
 */
import {
  DEGREE_SYNONYMS,
  GENDER_SYNONYMS,
  YES_NO_SYNONYMS,
  matchOption,
  matchOptionWithSynonyms,
  matchYearsOption,
  type SectionKind
} from './rules'
import { scanForm, type FormField, type SectionAnchor } from './scanner'
import { runLlmFallback } from './llmFill'
import { isLlmFallbackEnabled } from '../shared/llm'
import type { FillResult, Profile } from '../shared/types'

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

function highlight(el: HTMLElement): void {
  const prev = el.style.boxShadow
  el.style.transition = 'box-shadow .25s'
  el.style.boxShadow = '0 0 0 2px #3b74ff, 0 0 6px rgba(59,116,255,.65)'
  setTimeout(() => {
    el.style.boxShadow = prev
  }, 2600)
}

/** React 受控组件感知的赋值：用原生 prototype setter 绕过框架劫持，再派发事件。 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  if (descriptor?.set) {
    descriptor.set.call(el, value)
  } else {
    el.value = value
  }
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

/** 模拟完整的指针事件序列，兼容只监听 mousedown/click 的自研组件。 */
function clickEvents(el: HTMLElement): void {
  const opts = { bubbles: true, cancelable: true, view: window }
  el.dispatchEvent(new PointerEvent('pointerdown', opts))
  el.dispatchEvent(new MouseEvent('mousedown', opts))
  el.dispatchEvent(new PointerEvent('pointerup', opts))
  el.dispatchEvent(new MouseEvent('mouseup', opts))
  el.click()
}

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
}

function dismissPopups(): void {
  const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  document.activeElement?.dispatchEvent(ev)
  document.body.dispatchEvent(ev)
}

type OptionMatcher = (value: string, optionTexts: string[]) => string | null

const TEXT_MATCHER: OptionMatcher = (v, texts) => matchOption(v, texts)
const DEGREE_MATCHER: OptionMatcher = (v, texts) => matchOptionWithSynonyms(v, texts, DEGREE_SYNONYMS)
const GENDER_MATCHER: OptionMatcher = (v, texts) => matchOptionWithSynonyms(v, texts, GENDER_SYNONYMS)
const YEARS_MATCHER: OptionMatcher = (v, texts) => matchYearsOption(v, texts)
const YES_NO_MATCHER: OptionMatcher = (v, texts) => matchOptionWithSynonyms(v, texts, YES_NO_SYNONYMS)

const DEGREE_FIELDS = new Set(['education', 'highestEducation', 'degreeName'])
const GENDER_FIELDS = new Set(['gender'])
const YES_NO_FIELDS = new Set([
  'isFreshGraduate', 'isRecommended', 'hasOverseasExperience', 'acceptRelocation', 'isOverseas'
])

function matcherFor(field: FormField): OptionMatcher {
  const key = field.fieldType ?? ''
  if (GENDER_FIELDS.has(key)) return GENDER_MATCHER
  if (DEGREE_FIELDS.has(key)) return DEGREE_MATCHER
  if (key === 'yearsOfExp') return YEARS_MATCHER
  if (YES_NO_FIELDS.has(key)) return YES_NO_MATCHER
  return TEXT_MATCHER
}

/** 'YYYY-MM' / 'YYYY-MM-DD' → 控件需要的格式。 */
function formatDateTime(v: string, inputType: string): string {
  if (!v) return v
  if (/^\d{4}$/.test(v)) v = v + '-01'
  if (inputType === 'date') {
    if (/^\d{4}-\d{2}$/.test(v)) return v + '-01'
    return v
  }
  return v
}

// ---------- 单字段填充 ----------

function fillNativeSelect(sel: HTMLSelectElement, value: string, matcher: OptionMatcher): boolean {
  const options = Array.from(sel.options)
  const matched = matcher(value, options.map(o => o.text ?? o.value))
  if (!matched) return false
  const idx = options.findIndex(o => (o.text ?? '') === matched || o.value === matched)
  if (idx < 0) return false
  sel.selectedIndex = idx
  sel.dispatchEvent(new Event('input', { bubbles: true }))
  sel.dispatchEvent(new Event('change', { bubbles: true }))
  return true
}

function radioLabelText(radio: HTMLInputElement): string[] {
  const texts: string[] = []
  if (radio.id) {
    const label = document.querySelector(`label[for="${CSS.escape(radio.id)}"]`)
    if (label) texts.push(label.textContent ?? '')
  }
  const wrap = radio.closest('label')
  if (wrap) texts.push(wrap.textContent ?? '')
  const parent = radio.parentElement
  if (parent) texts.push(parent.textContent ?? '')
  if (radio.value) texts.push(radio.value)
  return texts.filter(t => t && t.trim())
}

function fillRadioGroup(radio: HTMLInputElement, value: string, matcher: OptionMatcher): boolean {
  const group = radio.name
    ? Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(radio.name)}"]`))
    : [radio]
  for (const r of group) {
    if (r.disabled) continue
    if (matcher(value, radioLabelText(r))) {
      clickEvents(r)
      return true
    }
  }
  return false
}

/** 自定义下拉/日期：点击触发器 → 等弹层 → 匹配选项点击 → 验证。 */
async function fillCustomControl(field: FormField, value: string, matcher: OptionMatcher): Promise<boolean> {
  const el = field.el
  const trigger =
    el.closest('.ant-select') ??
    el.closest('.ant-picker') ??
    el.closest('[role="combobox"]') ??
    (el.tagName === 'INPUT' && (el as HTMLInputElement).readOnly ? el.parentElement : null) ??
    el
  const before = trigger.textContent ?? ''
  clickEvents(trigger as HTMLElement)
  await sleep(350)

  const layers = Array.from(
    document.querySelectorAll<HTMLElement>(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden), [role="listbox"], [class*="dropdown" i], [class*="popup" i], [class*="overlay" i], [class*="panel" i]'
    )
  ).filter(l => isVisible(l) && !l.contains(el))

  let clicked = false
  for (const layer of layers) {
    const optionEls = Array.from(layer.querySelectorAll<HTMLElement>('[role="option"], li, [class*="option" i]')).filter(
      o => isVisible(o) && (o.textContent ?? '').trim()
    )
    if (optionEls.length === 0) continue
    const matched = matcher(value, optionEls.map(o => (o.textContent ?? '').trim()))
    if (!matched) continue
    const target = optionEls.find(o => (o.textContent ?? '').trim() === matched)
    if (target) {
      clickEvents(target)
      clicked = true
      break
    }
  }

  if (!clicked) {
    // 日期面板：弹层里可能有可输入框（如 antd DatePicker 的输入）
    for (const layer of layers) {
      const input = layer.querySelector<HTMLInputElement>('input')
      if (input) {
        setNativeValue(input, value)
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        clicked = true
        break
      }
    }
  }

  await sleep(250)
  dismissPopups()
  if (!clicked) return false
  const after = trigger.textContent ?? ''
  return after !== before || (field.el as HTMLInputElement).value !== ''
}

async function fillField(field: FormField, value: string): Promise<boolean> {
  if (!value) return false
  const el = field.el
  if (field.kind === 'radio') {
    const ok = fillRadioGroup(el as HTMLInputElement, value, matcherFor(field))
    if (ok) highlight(el)
    return ok
  }
  if (field.kind === 'select') {
    const ok = fillNativeSelect(el as HTMLSelectElement, value, matcherFor(field))
    if (ok) highlight(el)
    return ok
  }
  if (field.kind === 'text' || field.kind === 'textarea') {
    const input = el as HTMLInputElement
    setNativeValue(
      input,
      field.signals.inputType === 'date' || field.signals.inputType === 'month'
        ? formatDateTime(value, field.signals.inputType)
        : value
    )
    highlight(el)
    return true
  }
  const ok = await fillCustomControl(field, value, matcherFor(field))
  if (ok) highlight(el)
  return ok
}

// ---------- 多段经历 ----------

function commonAncestor(els: HTMLElement[]): HTMLElement {
  if (els.length === 0) return document.body
  let cur: HTMLElement | null = els[0]
  while (cur) {
    if (els.every(e => cur!.contains(e))) return cur
    cur = cur.parentElement
  }
  return document.body
}

/** 按视觉行聚类：同 top（±20px）的字段视为一段经历的一行。 */
function clusterRows(fields: FormField[]): FormField[][] {
  const sorted = [...fields].sort((a, b) => a.el.getBoundingClientRect().top - b.el.getBoundingClientRect().top)
  const rows: FormField[][] = []
  let current: FormField[] = []
  let rowTop = 0
  for (const f of sorted) {
    const top = f.el.getBoundingClientRect().top
    if (current.length === 0) {
      current = [f]
      rowTop = top
    } else if (Math.abs(top - rowTop) <= 20) {
      current.push(f)
    } else {
      rows.push(current)
      current = [f]
      rowTop = top
    }
  }
  if (current.length) rows.push(current)
  return rows
}

function rowIsBlank(row: FormField[]): boolean {
  if (row.some(f => 'rfFilled' in f.el.dataset)) return false
  return row.every(f => {
    if (f.kind === 'radio' || f.kind === 'custom') return true
    return !(f.el as HTMLInputElement).value
  })
}

const ADD_BTN_TEXT = /^(添加|新增|增加|继续添加|再加一段|添加经历|添加教育|添加工作|新增教育背景|新增工作经历|新增项目经历|新增实习经历|新增一条|\+|＋)/
const REMOVE_BTN_TEXT = /(删除|移除|取消|收起)/

function findAddButton(root: HTMLElement): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"], a, span, div, i')).filter(el => {
    const text = (el.textContent ?? '').trim()
    if (!text || text.length > 12) return false
    if (REMOVE_BTN_TEXT.test(text)) return false
    return ADD_BTN_TEXT.test(text)
  })
  if (candidates.length === 0) return null
  // 嵌套命中时取最内层
  return candidates[candidates.length - 1]
}

/** 区块在 Profile 中的列表字段名与中文标题。 */
const SECTION_META: Record<SectionKind, { itemsKey: keyof Profile; title: string }> = {
  education: { itemsKey: 'education', title: '教育经历' },
  work: { itemsKey: 'work', title: '工作经历' },
  intern: { itemsKey: 'intern', title: '实习经历' },
  project: { itemsKey: 'project', title: '项目经历' },
  cadre: { itemsKey: 'cadre', title: '干部任职经历' },
  language: { itemsKey: 'language', title: '外语能力' },
  certificate: { itemsKey: 'certificate', title: '证书' },
  award: { itemsKey: 'award', title: '获奖经历' },
  patent: { itemsKey: 'patent', title: '专利信息' },
  paper: { itemsKey: 'paper', title: '论文发表' },
  family: { itemsKey: 'family', title: '家庭情况' }
}

async function fillSectionRow(
  row: FormField[],
  item: Record<string, string>,
  llmKeys?: Map<HTMLElement, string>
): Promise<{ filled: number; llmFilled: number }> {
  let filled = 0
  let llmFilled = 0
  for (const field of row) {
    // 段内未识别字段默认不乱填；LLM 兜底给出 key 时按 key 取值
    let target = field
    if (field.score <= 0) {
      const llmKey = llmKeys?.get(field.el)
      if (!llmKey) continue
      target = { ...field, fieldType: llmKey, score: 1 }
    }
    const value = item[target.fieldType ?? ''] ?? ''
    if (!value) continue
    const ok = await fillField(target, value)
    if (ok) {
      filled++
      if (target !== field) llmFilled++
    }
  }
  for (const field of row) field.el.dataset.rfFilled = '1'
  return { filled, llmFilled }
}

async function fillSection(
  kind: SectionKind,
  profile: Profile,
  anchors: SectionAnchor[],
  result: FillResult,
  llmKeys?: Map<HTMLElement, string>
): Promise<void> {
  const meta = SECTION_META[kind]
  const items = profile[meta.itemsKey] as unknown as Record<string, string>[]
  if (!items || items.length === 0) return

  const sectionFields = () => scanForm().fields.filter(f => f.section === kind)
  let fields = sectionFields()
  if (fields.length === 0) return

  const anchor = anchors.find(a => a.kind === kind)
  const root = commonAncestor([...fields.map(f => f.el), ...(anchor ? [anchor.el] : [])])
  const addButton = findAddButton(root)

  for (const [index, item] of items.entries()) {
    let rows = clusterRows(fields)
    let row = rows.find(rowIsBlank)
    if (!row && addButton) {
      clickEvents(addButton)
      await sleep(500)
      fields = sectionFields()
      rows = clusterRows(fields)
      row = rows.find(rowIsBlank)
    }
    if (!row) {
      result.failed.push({
        reason: `${meta.title}（无法新增第 ${index + 1} 段，请手动添加行后重试）`,
        cause: 'unsupported'
      })
      return
    }
    const { filled, llmFilled } = await fillSectionRow(row, item, llmKeys)
    result.filled += filled
    result.llmFilled += llmFilled
  }
}

// ---------- 主流程 ----------

/** basic 区取值：personal + intention + skills 拼平，key 与词典一致。 */
function basicValueOf(profile: Profile, key: string): string {
  return (
    (profile.personal as unknown as Record<string, string>)[key] ??
    (profile.intention as unknown as Record<string, string>)[key] ??
    (profile.skills as unknown as Record<string, string>)[key] ??
    ''
  )
}

/** LLM 兜底候选判定用：区块字段取任一段里的值（只用于判断「档案里有没有这个信息」）。 */
function anyValueOf(profile: Profile, section: SectionKind | 'basic', key: string): string {
  if (section === 'basic') return basicValueOf(profile, key)
  const items = profile[SECTION_META[section].itemsKey] as unknown as Record<string, string>[]
  if (!Array.isArray(items)) return ''
  for (const item of items) {
    const v = item?.[key]
    if (v && String(v).trim()) return String(v)
  }
  return ''
}

export async function fillPage(profile: Profile): Promise<FillResult> {
  const { fields, anchors } = scanForm()
  const result: FillResult = { filled: 0, failed: [], pageDetected: fields.length > 0, llmFilled: 0 }
  if (fields.length === 0) return result

  const radioGroupDone = new Set<string>()
  const unmatched: FormField[] = []
  const radioSeen = new Set<string>()
  const noteUnmatched = (field: FormField) => {
    if (field.kind === 'radio') {
      const input = field.el as HTMLInputElement
      const group = input.name || input.id || `#${unmatched.length}`
      if (radioSeen.has(group)) return
      radioSeen.add(group)
    }
    unmatched.push(field)
  }

  for (const field of fields) {
    if (field.section !== 'basic') continue
    if (field.kind === 'radio') {
      const input = field.el as HTMLInputElement
      const key = input.name || input.id || String(radioGroupDone.size)
      if (radioGroupDone.has(key)) continue
      radioGroupDone.add(key)
      if (field.fieldType) {
        const value = basicValueOf(profile, field.fieldType)
        if (value) {
          const ok = await fillField(field, value)
          if (ok) result.filled++
          else result.failed.push({ reason: field.label, cause: 'custom-control-failed' })
        }
      } else if (field.score <= 0) {
        noteUnmatched(field)
      }
      continue
    }
    if (field.fieldType && field.score >= 2) {
      const value = basicValueOf(profile, field.fieldType)
      if (!value) continue
      const ok = await fillField(field, value)
      if (ok) result.filled++
      else result.failed.push({ reason: field.label, cause: field.kind === 'custom' ? 'custom-control-failed' : 'unsupported' })
    } else if (field.score <= 0) {
      noteUnmatched(field)
    }
  }

  // 区块内未识别字段一并送审；整页只发一次请求
  for (const field of fields) {
    if (field.section !== 'basic' && field.score <= 0) noteUnmatched(field)
  }

  const claimed = new Set<HTMLElement>()
  let llmKeys: Map<HTMLElement, string> | undefined
  if (unmatched.length > 0 && (await isLlmFallbackEnabled())) {
    try {
      const fallback = await runLlmFallback(unmatched, (section, key) => anyValueOf(profile, section, key), fillField, document.title)
      fallback.claimed.forEach(el => claimed.add(el))
      result.filled += fallback.filled
      result.llmFilled += fallback.filled
      llmKeys = fallback.sectionKeys
    } catch (e) {
      // 兜底失败不影响规则引擎已完成的填充
      result.llmError = e instanceof Error ? e.message : String(e)
      console.warn('投递副驾：LLM 兜底识别失败，已跳过', e)
    }
  }

  for (const kind of Object.keys(SECTION_META) as SectionKind[]) {
    await fillSection(kind, profile, anchors, result, llmKeys)
  }

  for (const field of unmatched) {
    if (claimed.has(field.el)) continue
    result.failed.push({ reason: field.label, cause: 'unmatched' })
  }
  return result
}
