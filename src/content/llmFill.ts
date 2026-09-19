/**
 * LLM 兜底识别：规则引擎认不出的字段，交给 LLM 映射到档案字段 key。
 *
 * 隐私边界：请求里只有表单侧描述（label / placeholder / name / 下拉选项）
 * 和「哪些候选字段有值」的字段名，不含简历内容；
 * 取值与选项匹配仍在本地由 filler 完成。
 */
import { BASIC_KEYWORDS, SECTION_FIELD_KEYWORDS, type SectionKind } from './rules'
import type { FormField } from './scanner'
import type { LlmFieldDescriptor, LlmMapPayload } from '../shared/llm'
import type { LlmMapResponse } from '../shared/messages'

/** 单次兜底最多送审的字段数，控制 token 与延迟。 */
const MAX_FIELDS = 40
const MAX_TEXT_LEN = 40

export interface LlmFallbackOutcome {
  /** 本地填充成功的字段数 */
  filled: number
  /** LLM 已认领的控件（不再计入「未处理」） */
  claimed: Set<HTMLElement>
  /** 区块内控件 → 映射 key，供 fillSectionRow 取值 */
  sectionKeys: Map<HTMLElement, string>
}

type SectionId = SectionKind | 'basic'

function dictOf(section: SectionId): Record<string, { cn: string[]; en: string[] }> {
  return section === 'basic' ? BASIC_KEYWORDS : SECTION_FIELD_KEYWORDS[section]
}

function clip(s: string): string {
  const t = s.trim()
  return t.length > MAX_TEXT_LEN ? t.slice(0, MAX_TEXT_LEN) : t
}

/** 只送可见控件：隐藏字段（模板残留等）会给 LLM 噪声。 */
function isRenderable(field: FormField): boolean {
  const hasBox = (el: HTMLElement | null | undefined): boolean => {
    if (!el) return false
    const rect = el.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  if (hasBox(field.el)) return true
  // 原生 radio 常被隐藏、只渲染样式化的 label，用 label / 父容器尺寸兜底
  if (field.kind !== 'radio') return false
  return hasBox(field.el.closest('label')) || hasBox(field.el.parentElement)
}

/** 候选字段：只列出档案里确实有值的 key，避免 LLM 映射到空字段。 */
function candidatesOf(section: SectionId, getValue: (section: SectionId, key: string) => string): { key: string; label: string }[] {
  const dict = dictOf(section)
  const out: { key: string; label: string }[] = []
  for (const [key, entry] of Object.entries(dict)) {
    if (!getValue(section, key).trim()) continue
    out.push({ key, label: entry.cn[0] ?? key })
  }
  return out
}

export function buildMapPayload(
  fields: FormField[],
  getValue: (section: SectionId, key: string) => string,
  pageTitle: string
): LlmMapPayload {
  const descriptors: LlmFieldDescriptor[] = fields.map((f, i) => ({
    i,
    section: f.section,
    kind: f.kind,
    label: clip(f.signals.labelText || f.label),
    placeholder: clip(f.signals.placeholder),
    name: clip(f.signals.name),
    id: clip(f.signals.id),
    inputType: f.signals.inputType,
    options: f.optionTexts
  }))

  const candidates: LlmMapPayload['candidates'] = {}
  for (const section of new Set(fields.map(f => f.section))) {
    const list = candidatesOf(section, getValue)
    if (list.length > 0) candidates[section] = list
  }
  return { pageTitle: clip(pageTitle), fields: descriptors, candidates }
}

async function requestMapping(payload: LlmMapPayload): Promise<{ i: number; key: string }[]> {
  const resp = (await chrome.runtime.sendMessage({ type: 'LLM_MAP_FIELDS', payload })) as LlmMapResponse | undefined
  if (!resp || !resp.ok) throw new Error(resp?.error ?? 'LLM 未响应')
  return resp.mappings
}

/**
 * 兜底填充：basic 区字段直接填，区块内字段把 key 交给调用方在分行填充时取值。
 * 失败一律抛错，由调用方静默降级为「未处理」。
 */
export async function runLlmFallback(
  unmatched: FormField[],
  getValue: (section: SectionId, key: string) => string,
  fill: (field: FormField, value: string) => Promise<boolean>,
  pageTitle: string
): Promise<LlmFallbackOutcome> {
  const claimed = new Set<HTMLElement>()
  const sectionKeys = new Map<HTMLElement, string>()
  let filled = 0

  const targets = unmatched.filter(isRenderable).slice(0, MAX_FIELDS)
  if (targets.length === 0) return { filled, claimed, sectionKeys }

  const mappings = await requestMapping(buildMapPayload(targets, getValue, pageTitle))
  const usedBasicKeys = new Set<string>()

  for (const m of mappings) {
    const field = targets[m.i]
    if (!field) continue
    if (claimed.has(field.el)) continue // 同一控件只认一条映射
    const dict = dictOf(field.section)
    if (!dict[m.key]) continue // LLM 编造的 key：丢弃
    const value = getValue(field.section, m.key).trim()
    if (!value) continue

    if (field.section === 'basic') {
      if (usedBasicKeys.has(m.key)) continue // 一个 key 只填一次
      usedBasicKeys.add(m.key)
      const ok = await fill({ ...field, fieldType: m.key, score: 1 }, value)
      if (ok) {
        filled++
        claimed.add(field.el)
      }
    } else {
      claimed.add(field.el)
      sectionKeys.set(field.el, m.key)
    }
  }
  return { filled, claimed, sectionKeys }
}