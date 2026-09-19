/**
 * 简历内容润色：挑出自由文本类字段（经历描述、自我评价、技能等），
 * 交 LLM 润色后在预览里逐条确认，再写回档案。
 * dot 路径约定与 enResume 一致：'personal.selfIntro'、'work.1.description'。
 */
import type { Profile } from '../shared/types'
import { setByPath } from './enResume'

export interface PolishItem {
  path: string
  label: string
  before: string
}

/** 低于该长度的文本多是关键词罗列，润色无意义。 */
const MIN_LEN = 12
/** 单次润色的最大条目数，控制 token 与等待时间。 */
export const MAX_POLISH_ITEMS = 40

type FlatArea = 'personal' | 'intention' | 'skills'
type ListKey = 'education' | 'work' | 'intern' | 'project' | 'cadre' | 'award' | 'patent' | 'paper'

interface TextFieldDef {
  key: string
  label: string
}

const FLAT_TEXT: { area: FlatArea; fields: TextFieldDef[] }[] = [
  {
    area: 'personal',
    fields: [
      { key: 'selfIntro', label: '自我介绍' },
      { key: 'personalStrengths', label: '个人优势' },
      { key: 'hobbies', label: '兴趣爱好' }
    ]
  },
  { area: 'intention', fields: [{ key: 'jobNotes', label: '求职备注' }] },
  {
    area: 'skills',
    fields: [
      { key: 'technical', label: '技术技能' },
      { key: 'languages', label: '语言能力' },
      { key: 'software', label: '软件技能' },
      { key: 'certificates', label: '证书认证' },
      { key: 'soft', label: '软技能' }
    ]
  }
]

const SECTION_TEXT: { key: ListKey; title: string; fields: TextFieldDef[] }[] = [
  {
    key: 'education',
    title: '教育经历',
    fields: [
      { key: 'eduDescription', label: '教育描述' },
      { key: 'majorDescription', label: '专业描述' },
      { key: 'courses', label: '专业课程' },
      { key: 'researchDirection', label: '研究方向' },
      { key: 'thesis', label: '毕业论文' }
    ]
  },
  {
    key: 'work',
    title: '工作经历',
    fields: [
      { key: 'description', label: '工作内容' },
      { key: 'leaveReason', label: '离职原因' }
    ]
  },
  { key: 'intern', title: '实习经历', fields: [{ key: 'description', label: '实习内容' }] },
  {
    key: 'project',
    title: '项目经历',
    fields: [
      { key: 'description', label: '项目描述' },
      { key: 'duty', label: '项目职责' },
      { key: 'achievement', label: '项目成果' }
    ]
  },
  {
    key: 'cadre',
    title: '干部任职',
    fields: [
      { key: 'description', label: '任职描述' },
      { key: 'duty', label: '任职职责' }
    ]
  },
  { key: 'award', title: '获奖经历', fields: [{ key: 'description', label: '获奖描述' }] },
  { key: 'patent', title: '专利信息', fields: [{ key: 'description', label: '专利描述' }] },
  { key: 'paper', title: '论文发表', fields: [{ key: 'abstract', label: '论文摘要' }] }
]

/** 挑出可润色的自由文本项：非空且达到最小长度。 */
export function buildPolishItems(profile: Profile): PolishItem[] {
  const items: PolishItem[] = []

  for (const { area, fields } of FLAT_TEXT) {
    const data = profile[area] as unknown as Record<string, string>
    for (const field of fields) {
      const text = (data[field.key] ?? '').trim()
      if (text.length >= MIN_LEN) items.push({ path: `${area}.${field.key}`, label: field.label, before: text })
    }
  }

  for (const section of SECTION_TEXT) {
    const list = profile[section.key] as unknown as Record<string, string>[]
    if (!Array.isArray(list)) continue
    list.forEach((item, index) => {
      for (const field of section.fields) {
        const text = (item[field.key] ?? '').trim()
        if (text.length >= MIN_LEN) {
          items.push({
            path: `${section.key}.${index}.${field.key}`,
            label: `${section.title}${index + 1} · ${field.label}`,
            before: text
          })
        }
      }
    })
  }

  return items.slice(0, MAX_POLISH_ITEMS)
}

/** 把确认过的润色结果写回档案副本（不改原对象）。 */
export function applyPolish(profile: Profile, applied: Record<string, string>): Profile {
  const next = structuredClone(profile)
  for (const [path, text] of Object.entries(applied)) {
    if (text.trim()) setByPath(next, path, text.trim())
  }
  return next
}