/**
 * 表单扫描器：收集控件 → 找区块标题锚点 → 按文档顺序把字段划入区块 → 词典打分定类型。
 * 字段类型 key 与 Profile 属性名一致，filler 直接按 key 取值。
 */
import {
  BASIC_KEYWORDS,
  SECTION_FIELD_KEYWORDS,
  SECTION_KEYWORDS,
  normalizeText,
  type KeywordEntry,
  type SectionKind
} from './rules'
import { extractSignals, textWithoutControls, type FieldSignals } from './label'

export type FieldKind = 'text' | 'textarea' | 'select' | 'radio' | 'custom'

export interface FormField {
  el: HTMLElement
  kind: FieldKind
  signals: FieldSignals
  section: SectionKind | 'basic'
  /** basic 区：BASIC_KEYWORDS 的 key；区块内：SECTION_FIELD_KEYWORDS[section] 的 key */
  fieldType?: string
  score: number
  /** 人类可读的字段描述，用于失败提示。 */
  label: string
  /** 下拉选项文本，供 LLM 兜底识别判断字段语义。 */
  optionTexts?: string[]
}

export interface SectionAnchor {
  kind: SectionKind
  el: HTMLElement
}

const SKIP_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'file', 'image', 'password', 'checkbox'])

function isCandidateControl(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type
    if (SKIP_INPUT_TYPES.has(type)) return false
    if ((el as HTMLInputElement).disabled) return false
    return true
  }
  if (el.getAttribute('role') === 'combobox') return true
  if (el.classList.contains('ant-select') || el.classList.contains('ant-picker')) return true
  return false
}

function kindOf(el: HTMLElement): FieldKind {
  if (el.tagName === 'TEXTAREA') return 'textarea'
  if (el.tagName === 'SELECT') return 'select'
  if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'radio') return 'radio'
  if (el.tagName === 'INPUT' && !(el as HTMLInputElement).readOnly) return 'text'
  return 'custom'
}

const MAX_OPTION_TEXTS = 24

function collectSelectOptions(sel: HTMLSelectElement): string[] {
  return Array.from(sel.options)
    .map(o => (o.text || o.value || '').trim())
    .filter(Boolean)
    .slice(0, MAX_OPTION_TEXTS)
}

/** 找区块标题锚点：短文本命中区块词的标题类元素。 */
export function findSectionAnchors(): SectionAnchor[] {
  const selector = [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b',
    '[class*="title" i]', '[class*="head" i]', '[class*="section" i]', '[class*="block" i]',
    'legend'
  ].join(',')
  const anchors: SectionAnchor[] = []
  for (const el of document.querySelectorAll<HTMLElement>(selector)) {
    const text = normalizeText(textWithoutControls(el))
    if (!text || text.length > 12) continue
    // 命中多个区块词时取词最长（最具体）的那个
    let bestKind: SectionKind | null = null
    let bestLen = 0
    for (const kind of Object.keys(SECTION_KEYWORDS) as SectionKind[]) {
      for (const kw of SECTION_KEYWORDS[kind]) {
        const nk = normalizeText(kw)
        if (text.includes(nk) && nk.length > bestLen) {
          bestLen = nk.length
          bestKind = kind
        }
      }
    }
    if (bestKind) anchors.push({ kind: bestKind, el })
  }
  anchors.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  // 去掉同 kind 的嵌套重复标题（父子同时命中保留文本更具体的）
  const deduped: SectionAnchor[] = []
  for (const a of anchors) {
    const last = deduped[deduped.length - 1]
    if (last && last.kind === a.kind && (a.el.contains(last.el) || last.el.contains(a.el))) continue
    deduped.push(a)
  }
  return deduped
}

/** 字段在文档顺序上前面最近的区块锚点决定其归属。 */
function sectionOf(el: HTMLElement, anchors: SectionAnchor[]): SectionKind | 'basic' {
  let nearest: SectionAnchor | null = null
  for (const a of anchors) {
    const rel = el.compareDocumentPosition(a.el)
    const aIsBeforeEl = (rel & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    if (!aIsBeforeEl) continue
    if (!nearest) {
      nearest = a
      continue
    }
    const aAfterNearest = (a.el.compareDocumentPosition(nearest.el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0
    if (aAfterNearest) nearest = a
  }
  return nearest ? nearest.kind : 'basic'
}

function scoreAgainstEntry(signals: FieldSignals, entry: KeywordEntry): number {
  let score = 0
  const label = normalizeText(signals.labelText)
  if (label) {
    for (const kw of entry.cn) {
      const nk = normalizeText(kw)
      if (!nk) continue
      if (label === nk) score = Math.max(score, 5 + nk.length * 0.5)
      else if (label.includes(nk)) score = Math.max(score, 3 + nk.length * 0.5)
    }
  }
  const attrs = [signals.name, signals.id].map(normalizeText)
  for (const attr of attrs) {
    if (!attr) continue
    for (const kw of entry.en) {
      const nk = normalizeText(kw)
      if (!nk) continue
      if (attr === nk) score = Math.max(score, 4.5)
      else if (attr.includes(nk)) score = Math.max(score, 2.5)
    }
  }
  const ph = normalizeText(signals.placeholder)
  if (ph) {
    for (const kw of [...entry.cn, ...entry.en]) {
      const nk = normalizeText(kw)
      if (nk && ph.includes(nk)) score = Math.max(score, 2)
    }
  }
  return score
}

function classify(signals: FieldSignals, dict: Record<string, KeywordEntry>): { type?: string; score: number } {
  let bestType: string | undefined
  let bestScore = 0
  for (const [type, entry] of Object.entries(dict)) {
    const score = scoreAgainstEntry(signals, entry)
    if (score > bestScore) {
      bestScore = score
      bestType = type
    }
  }
  return { type: bestType, score: bestScore }
}

export function scanForm(): { fields: FormField[]; anchors: SectionAnchor[] } {
  const anchors = findSectionAnchors()
  const fields: FormField[] = []
  const seen = new Set<HTMLElement>()

  for (const el of document.querySelectorAll<HTMLElement>('input, select, textarea, [role="combobox"]')) {
    if (seen.has(el)) continue
    if (!isCandidateControl(el)) continue
    seen.add(el)
    const kind = kindOf(el)
    const signals = extractSignals(el)
    const section = sectionOf(el, anchors)
    const dict = section === 'basic' ? BASIC_KEYWORDS : SECTION_FIELD_KEYWORDS[section]
    const { type, score } = classify(signals, dict)
    // 输入框类型的强信号（仅 basic 区适用）
    let finalType = type
    let finalScore = score
    if (section === 'basic') {
      const t = signals.inputType
      if (t === 'email') {
        finalType = 'email'
        finalScore = Math.max(score, 6)
      } else if (t === 'tel') {
        finalType = 'phone'
        finalScore = Math.max(score, 5)
      }
    }
    fields.push({
      el,
      kind,
      signals,
      section,
      fieldType: finalType,
      score: finalScore,
      label: signals.labelText || signals.name || signals.placeholder || '未命名字段',
      optionTexts: kind === 'select' ? collectSelectOptions(el as HTMLSelectElement) : undefined
    })
  }
  return { fields, anchors }
}
