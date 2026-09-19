/**
 * LLM 客户端（OpenAI 兼容：DeepSeek / 智谱 / Moonshot / OpenAI）。
 * 三种用途：英文简历翻译、招聘表单字段映射兜底、简历内容润色。
 * 仅在用户显式点击相关按钮、或开启「填充兜底」开关时联网；
 * 配置存 chrome.storage.local（resumeFillerLlm），不进简历档案 Store。
 */

export interface LlmConfig {
  baseUrl: string // 如 https://api.deepseek.com/v1
  apiKey: string
  model: string // 如 deepseek-chat
  /** 一键填充时，把规则引擎认不出的字段交给 LLM 映射（默认关闭）。 */
  fallbackFill?: boolean
}

const KEY = 'resumeFillerLlm'

export async function loadLlmConfig(): Promise<LlmConfig | null> {
  const got = await chrome.storage.local.get(KEY)
  const cfg = got[KEY] as LlmConfig | undefined
  if (cfg && cfg.apiKey && cfg.baseUrl) return cfg
  return null
}

export async function saveLlmConfig(cfg: LlmConfig): Promise<void> {
  await chrome.storage.local.set({ [KEY]: cfg })
}

/** 是否开启「LLM 兜底识别」——填充前由 content 脚本判断，避免无谓的跨进程消息。 */
export async function isLlmFallbackEnabled(): Promise<boolean> {
  const cfg = await loadLlmConfig()
  return cfg?.fallbackFill === true
}

/**
 * baseUrl → chrome.permissions 的 origin 匹配模式。
 * 扩展页面（含 background）绕开 CORS 的前提是该 origin 在权限里，
 * 所以在 options 页保存设置时按需申请（详见 App.tsx onSaveLlm）。
 */
export function originPatternOf(baseUrl: string): string | null {
  try {
    const u = new URL(baseUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.protocol}//${u.host}/*`
  } catch {
    return null
  }
}

interface ChatOptions {
  system: string
  user: string
  temperature?: number
}

/** 单次请求超时：避免接口挂起时填充/润色界面一直等待。 */
const REQUEST_TIMEOUT_MS = 30000

/** 一次 OpenAI 兼容的 chat 调用，返回助手文本。 */
export async function llmChat(cfg: LlmConfig, opts: ChatOptions): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let resp: Response
  try {
    resp = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: opts.temperature ?? 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user }
        ]
      })
    })
  } catch (e) {
    throw e instanceof Error && e.name === 'AbortError' ? new Error(`请求超过 ${REQUEST_TIMEOUT_MS / 1000} 秒未返回`) : e
  } finally {
    clearTimeout(timer)
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`API ${resp.status}: ${body.slice(0, 200)}`)
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

/** 解析模型返回的 JSON（容忍 ```json 代码块包裹）。 */
function parseJson<T>(content: string): T {
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new Error('API 返回的 JSON 无法解析')
  }
}

// ---------- 用途一：英文简历翻译 ----------

/**
 * 批量翻译：items 的 zh → 返回 { key: 英文 }。
 * 失败时抛错，调用方降级为保留中文。
 */
export async function llmTranslateBatch(items: { key: string; zh: string }[], cfg: LlmConfig): Promise<Record<string, string>> {
  const system = `You are a professional resume translator. Translate Chinese resume content into concise, idiomatic American English suitable for a one-page resume.
Rules:
- Prefer strong action verbs and quantified results; keep numbers/percentages exactly.
- For institution names (companies, universities), use their official English names.
- Multi-line input means separate bullet points: translate each line and keep line breaks.
- Do not add fabricated content.
Return strict JSON: {"results":[{"id":"<original id>","en":"<translation>"}]}`
  const user = JSON.stringify({ items: items.map(i => ({ id: i.key, text: i.zh })) })
  const parsed = parseJson<{ results?: { id: string; en: string }[] }>(await llmChat(cfg, { system, user }))
  const out: Record<string, string> = {}
  for (const r of parsed.results ?? []) {
    if (r?.id && typeof r.en === 'string') out[r.id] = r.en
  }
  return out
}

// ---------- 用途二：表单字段映射兜底 ----------

/** 一个未识别控件的描述。只含表单侧信息，不含简历内容。 */
export interface LlmFieldDescriptor {
  i: number
  section: string
  kind: string
  label: string
  placeholder: string
  name: string
  id: string
  inputType: string
  /** 下拉/单选的候选选项文本，帮助判断字段语义。 */
  options?: string[]
}

export interface LlmMapPayload {
  pageTitle: string
  fields: LlmFieldDescriptor[]
  /** 候选字段：区块 → [{key, label}]，只含档案里有值的键。 */
  candidates: Record<string, { key: string; label: string }[]>
}

/**
 * 让 LLM 把未识别控件映射到档案字段 key。
 * 值不参与请求，仍由本地 filler 按 key 取值填充。
 */
export async function llmMapFields(payload: LlmMapPayload, cfg: LlmConfig): Promise<{ i: number; key: string }[]> {
  const system = `你是招聘网站表单的字段映射助手。输入是一批「规则引擎未能识别」的表单控件描述，以及该简历档案中「已有值」的候选字段列表（按区块分组）。
请为每个控件选出语义最匹配的候选字段 key。
Rules:
- 只能从 candidates 里选择 key，禁止编造不存在的 key。
- 控件的 section 表示它所在的表单区块：basic 为简历通用信息区（个人信息/求职意向/技能），其余为对应经历区块；必须选择同一分组的 key。
- 语义不确定、或该分组没有合适字段时，不要为该项输出映射。
- 同一个 key 最多映射一个控件；多个控件竞争时，选 label 语义最贴近的那个。
Return strict JSON: {"mappings":[{"i":<控件序号>,"key":"<候选key>"}]}`
  const parsed = parseJson<{ mappings?: { i: number; key: string }[] }>(
    await llmChat(cfg, { system, user: JSON.stringify(payload), temperature: 0 })
  )
  return (parsed.mappings ?? []).filter(m => typeof m?.i === 'number' && typeof m?.key === 'string')
}

// ---------- 用途三：简历内容润色 ----------

export interface LlmPolishItem {
  path: string
  label: string
  text: string
}

/** 返回 { dot路径: 润色后文本 }。 */
export async function llmPolish(
  items: LlmPolishItem[],
  cfg: LlmConfig,
  context: { targetPosition?: string; label?: string }
): Promise<Record<string, string>> {
  const system = `你是资深中文简历顾问，负责润色简历文本（不改变事实）。
Rules:
- 绝不虚构事实、数字、公司、时间、头衔；原文里的数字与专有名词必须原样保留。
- 每条要点以动词开头，突出成果与影响，删掉「负责」「参与了」这类弱表达，但不得夸大。
- 原文是多行要点时保持分行结构，不要合并成一段；总长度不超过原文的 1.2 倍。
- 口语化、啰嗦、重复的表述改得简洁专业。
- 只输出润色后的文本，不要解释，不要加序号或 Markdown 标记。
Return strict JSON: {"results":[{"id":"<原id>","text":"<润色后>"}]}`
  const user = JSON.stringify({
    targetPosition: context.targetPosition ?? '',
    profileLabel: context.label ?? '',
    items: items.map(i => ({ id: i.path, label: i.label, text: i.text }))
  })
  const parsed = parseJson<{ results?: { id: string; text: string }[] }>(await llmChat(cfg, { system, user }))
  const out: Record<string, string> = {}
  for (const r of parsed.results ?? []) {
    if (r?.id && typeof r.text === 'string' && r.text.trim()) out[r.id] = r.text.trim()
  }
  return out
}