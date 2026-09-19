/** 从表单控件周围提取识别信号：可见 label 文本、placeholder、name/id 属性等。 */

export interface FieldSignals {
  labelText: string
  placeholder: string
  name: string
  id: string
  inputType: string
  ariaLabel: string
}

const MAX_LABEL_LEN = 24

/** 取容器文本，排除嵌套控件（select 的 option 等）自身的文本。 */
export function textWithoutControls(root: Element): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      let p: Element | null = node.parentElement
      while (p && p !== root) {
        const tag = p.tagName
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return NodeFilter.FILTER_REJECT
        p = p.parentElement
      }
      return NodeFilter.FILTER_ACCEPT
    }
  })
  let out = ''
  while (walker.nextNode()) out += walker.currentNode.textContent ?? ''
  return out.trim()
}

function visibleTextLen(s: string): number {
  return s.replace(/[\s:：*]/g, '').length
}

/**
 * 多策略提取 label 文本：
 * 1. aria-labelledby / aria-label
 * 2. label[for=id]
 * 3. 祖先链上的 <label>
 * 4. 逐层向上爬容器（最多 6 层），优先容器内的 <label>，其次容器短文本
 * 5. 前置兄弟短文本
 * 6. placeholder / title
 */
export function extractSignals(el: HTMLElement): FieldSignals {
  const input = el as HTMLInputElement
  const signals: FieldSignals = {
    labelText: '',
    placeholder: input.placeholder ?? '',
    name: (input.name as string) ?? '',
    id: el.id ?? '',
    inputType: input.type ?? '',
    ariaLabel: el.getAttribute('aria-label') ?? ''
  }

  // 1. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby')
  if (labelledBy) {
    for (const refId of labelledBy.split(/\s+/)) {
      const ref = document.getElementById(refId)
      if (ref) {
        const t = textWithoutControls(ref)
        if (t) {
          signals.labelText = t
          return signals
        }
      }
    }
  }
  if (signals.ariaLabel) {
    signals.labelText = signals.ariaLabel
    return signals
  }

  // 2. label[for=id]
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (label) {
      const t = textWithoutControls(label)
      if (t) {
        signals.labelText = t
        return signals
      }
    }
  }

  // 3. 祖先 <label>
  const ancestorLabel = el.closest('label')
  if (ancestorLabel) {
    const t = textWithoutControls(ancestorLabel)
    if (t) {
      signals.labelText = t
      return signals
    }
  }

  // 4. 向上爬容器找短文本
  const candidates: string[] = []
  let cur: HTMLElement | null = el.parentElement
  for (let depth = 0; depth < 6 && cur; depth++) {
    const innerLabel = cur.querySelector('label')
    if (innerLabel && !innerLabel.contains(el)) {
      const t = textWithoutControls(innerLabel)
      if (t && visibleTextLen(t) <= MAX_LABEL_LEN) candidates.push(t)
    }
    const t = textWithoutControls(cur)
    if (t && visibleTextLen(t) <= MAX_LABEL_LEN) candidates.push(t)
    cur = cur.parentElement
  }
  if (candidates.length > 0) {
    // 最短的候选最可能是本字段的 label
    signals.labelText = candidates.reduce((a, b) => (visibleTextLen(a) <= visibleTextLen(b) ? a : b))
    return signals
  }

  // 5. 前置兄弟短文本
  let sib: Element | null = el.previousElementSibling
  for (let i = 0; i < 3 && sib; i++) {
    const t = textWithoutControls(sib).trim()
    if (t && visibleTextLen(t) <= MAX_LABEL_LEN) {
      signals.labelText = t
      return signals
    }
    sib = sib.previousElementSibling
  }

  // 6. placeholder / title 兜底
  signals.labelText = signals.placeholder || el.title || ''
  return signals
}
