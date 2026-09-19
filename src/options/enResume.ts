/**
 * 中文档案 → 简洁英文简历档案。
 * 精选逻辑（规则驱动，体现英文简历惯例）：
 * - Summary：自我介绍/个人优势压缩成一两句
 * - Education：只取最近 1-2 段
 * - Experience/Projects：描述拆 bullet，按「量化 + 能力动词 + 实质长度」评分只留最强的 3 条
 * - Awards：只留国家级/省级，最多 2 条；论文/专利保留（强信号）
 * - 砍掉英文简历禁忌项：家庭、政治面貌、身高体重、证件号、紧急联系人、照片相关等
 * 翻译分两层：词典翻常见的枚举/职位/城市；机构名与自由文本进入 pending 列表，
 * 交给可选配置的 LLM 翻译（未配置则保留中文待人工编辑）。
 */
import { emptyProfile, type Profile } from '../shared/types'

// ---------- 词典 ----------

const DEGREE_EN: Record<string, string> = {
  初中: 'Middle School',
  高中: 'High School',
  大专: 'Associate Degree',
  本科: "Bachelor's Degree",
  硕士: "Master's Degree",
  博士: 'Ph.D.'
}

const GENDER_EN: Record<string, string> = { 男: 'Male', 女: 'Female' }

const TITLE_MAP: [RegExp, string][] = [
  [/前端开发|前端/, 'Frontend Engineer'],
  [/后端开发|后端|服务端/, 'Backend Engineer'],
  [/全栈/, 'Full-stack Engineer'],
  [/算法工程师|机器学习|深度学习/, 'Machine Learning Engineer'],
  [/数据分析/, 'Data Analyst'],
  [/数据开发|数据工程师/, 'Data Engineer'],
  [/测试|QA/, 'QA Engineer'],
  [/运维|SRE/, 'DevOps Engineer'],
  [/嵌入式/, 'Embedded Engineer'],
  [/安全工程师/, 'Security Engineer'],
  [/架构师/, 'Architect'],
  [/产品经理/, 'Product Manager'],
  [/产品助理/, 'Product Assistant'],
  [/项目经理/, 'Project Manager'],
  [/交互设计|UI设计|视觉设计/, 'Designer'],
  [/用户研究/, 'User Researcher'],
  [/内容运营|用户运营|运营/, 'Operations Specialist'],
  [/市场|营销/, 'Marketing Specialist'],
  [/人力|HR/, 'HR Specialist'],
  [/财务|会计/, 'Accountant'],
  [/行政/, 'Administrative Staff'],
  [/实习生/, 'Intern'],
  [/工程师/, 'Engineer'],
  [/经理|负责人/, 'Manager'],
  [/主管/, 'Supervisor'],
  [/专员|助理/, 'Specialist']
]

const MAJOR_MAP: Record<string, string> = {
  计算机科学与技术: 'Computer Science and Technology',
  计算机技术: 'Computer Technology',
  软件工程: 'Software Engineering',
  人工智能: 'Artificial Intelligence',
  数据科学: 'Data Science',
  大数据: 'Big Data Technology',
  网络工程: 'Network Engineering',
  信息安全: 'Information Security',
  信息与通信工程: 'Information and Communication Engineering',
  电子信息: 'Electronic Information Engineering',
  电子科学与技术: 'Electronic Science and Technology',
  自动化: 'Automation',
  机械工程: 'Mechanical Engineering',
  电气工程: 'Electrical Engineering',
  土木工程: 'Civil Engineering',
  数学: 'Mathematics',
  应用数学: 'Applied Mathematics',
  统计学: 'Statistics',
  物理学: 'Physics',
  金融学: 'Finance',
  会计学: 'Accounting',
  工商管理: 'Business Administration',
  市场营销: 'Marketing',
  人力资源管理: 'Human Resource Management',
  英语: 'English',
  法学: 'Law',
  新闻学: 'Journalism',
  工业设计: 'Industrial Design',
  视觉传达: 'Visual Communication'
}

const CITY_MAP: Record<string, string> = {
  北京: 'Beijing', 上海: 'Shanghai', 广州: 'Guangzhou', 深圳: 'Shenzhen',
  杭州: 'Hangzhou', 成都: 'Chengdu', 武汉: 'Wuhan', 南京: 'Nanjing',
  西安: "Xi'an", 长沙: 'Changsha', 重庆: 'Chongqing', 苏州: 'Suzhou',
  天津: 'Tianjin', 合肥: 'Hefei', 厦门: 'Xiamen', 青岛: 'Qingdao',
  大连: 'Dalian', 济南: 'Jinan', 郑州: 'Zhengzhou', 福州: 'Fuzhou',
  昆明: 'Kunming', 无锡: 'Wuxi', 佛山: 'Foshan', 东莞: 'Dongguan',
  珠海: 'Zhuhai', 中山: 'Zhongshan', 惠州: 'Huizhou', 宁波: 'Ningbo'
}

function translateTitle(zh: string): string {
  if (!zh) return ''
  if (/^[A-Za-z][A-Za-z\s/.-]*$/.test(zh)) return zh // 已是英文
  for (const [re, en] of TITLE_MAP) if (re.test(zh)) return en
  return ''
}

function translateCity(zh: string): string {
  if (!zh) return ''
  if (/^[A-Za-z]/.test(zh)) return zh
  const m = zh.match(/(北京|上海|广州|深圳|杭州|成都|武汉|南京|西安|长沙|重庆|苏州|天津|合肥|厦门|青岛|大连|济南|郑州|福州|昆明|无锡|佛山|东莞|珠海|中山|惠州|宁波)/)
  return m ? CITY_MAP[m[1]] : ''
}

function translateMajor(zh: string): string {
  if (!zh) return ''
  if (/^[A-Za-z]/.test(zh)) return zh
  return MAJOR_MAP[zh.trim()] ?? ''
}

function capitalizeWords(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function translateYears(zh: string): string {
  if (!zh) return ''
  if (zh.includes('应届')) return 'Fresh Graduate'
  const m = zh.match(/(\d+)\s*-\s*(\d+)\s*年/)
  if (m) return `${m[1]}-${m[2]} years`
  const n = zh.match(/(\d+)\s*年/)
  if (n) return `${n[1]} year${Number(n[1]) > 1 ? 's' : ''}`
  if (/10年以上/.test(zh)) return '10+ years'
  return ''
}

// ---------- 精选 ----------

/** 把中文描述拆成 bullet，按「量化 + 能力动词 + 实质」评分取最强的 n 条。 */
export function topBullets(text: string, n: number): string[] {
  const parts = text
    .split(/\r?\n|。|；|;|•|·|、(?=[^、]{8,})/)
    .map(s => s.replace(/^[\s\-–—*•\d.、]+/, '').trim())
    .filter(s => s.length >= 4)
  const score = (s: string): number => {
    let v = 0
    if (/\d+(\.\d+)?\s*%|\d+(\.\d+)?\s*[万亿]|\d+\s*[kK wW]|\b\d{2,}\b/.test(s)) v += 3
    if (/主导|负责|带领|搭建|设计|重构|优化|提升|实现|开发|上线|发表|申请|获得|完成/.test(s)) v += 2
    v += Math.min(s.length / 30, 2)
    return v
  }
  return parts
    .map(s => ({ s, v: score(s) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, n)
    .map(x => x.s)
}

function firstSentence(text: string, max = 80): string {
  if (!text) return ''
  const m = text.split(/[。；;.!?！？\n]/)[0]?.trim() ?? ''
  return m.length > max ? m.slice(0, max) : m
}

function byEndDesc(a: { endDate?: string; startDate?: string }, b: { endDate?: string; startDate?: string }): number {
  return (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '')
}

export interface EnDraft {
  /** 词典翻译后的档案骨架；自由文本字段暂存中文原文。 */
  profile: Profile
  /** 需要 LLM 翻译的项（dot 路径 → 中文原文）。未配置 API 时保留中文。 */
  pending: { key: string; zh: string }[]
  stats: { bullets: number; sectionsKept: number; dropped: string[] }
}

export function setByPath(obj: unknown, path: string, value: string): void {
  const parts = path.split('.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    cur = cur[Array.isArray(cur) ? Number(k) : k]
  }
  cur[parts[parts.length - 1]] = value
}

export function buildEnglishDraft(src: Profile): EnDraft {
  const p = emptyProfile(`${src.label}-EN`)
  p.lang = 'en'
  const s = src.personal
  const pending: { key: string; zh: string }[] = []
  const dropped: string[] = []
  let bullets = 0
  let sectionsKept = 0

  const add = (key: string, zh: string) => {
    if (zh && zh.trim()) pending.push({ key, zh: zh.trim() })
  }

  // ---- 头部：只留英文简历该有的 ----
  p.personal.fullName = s.englishName || (s.namePinyin ? capitalizeWords(s.namePinyin) : '') || s.fullName
  p.personal.englishName = s.englishName || (s.namePinyin ? capitalizeWords(s.namePinyin) : '')
  p.personal.email = s.email
  p.personal.phone = s.phone
  p.personal.gender = GENDER_EN[s.gender] ?? ''
  p.personal.address = translateCity(s.address) || s.address
  if (/[\u4e00-\u9fa5]/.test(p.personal.address)) add('personal.address', s.address)
  p.personal.highestEducation = DEGREE_EN[s.highestEducation] ?? ''
  p.personal.yearsOfExp = translateYears(s.yearsOfExp)

  // Summary：自我介绍 + 个人优势各取首句
  const summaryZh = [firstSentence(s.selfIntro), firstSentence(s.personalStrengths)].filter(Boolean).join(' ')
  if (summaryZh) add('personal.selfIntro', summaryZh)

  // 求职意向（填英文表单用）
  if (src.intention.targetPosition) {
    const t = translateTitle(src.intention.targetPosition)
    p.intention.targetPosition = t
    if (!t) add('intention.targetPosition', src.intention.targetPosition)
  }
  p.intention.expectCity = translateCity(src.intention.expectCity) || ''
  p.intention.expectSalary = src.intention.expectSalary

  // ---- Education：最近 2 段，只留核心字段 ----
  const edu = [...src.education].sort(byEndDesc).slice(0, 2)
  for (const e of edu) {
    const eduItem = {
      ...(emptyEdu()),
      school: e.school,
      major: translateMajor(e.major) || e.major,
      education: DEGREE_EN[e.education] ?? '',
      degreeName: DEGREE_EN[e.degreeName] ?? '',
      startDate: e.startDate,
      endDate: e.endDate,
      gpa: e.gpa
    }
    p.education.push(eduItem)
    add(`education.${p.education.length - 1}.school`, e.school)
    if (!translateMajor(e.major)) add(`education.${p.education.length - 1}.major`, e.major)
  }
  if (p.education.length) sectionsKept++

  // ---- Work：全部保留（倒序），描述取最强 3 bullet ----
  const works = [...src.work].sort(byEndDesc)
  for (const w of works) {
    const zhDesc = topBullets(w.description, 3).join('\n')
    bullets += zhDesc ? zhDesc.split('\n').length : 0
    p.work.push({
      ...emptyWork(),
      company: w.company,
      title: translateTitle(w.title) || w.title,
      startDate: w.startDate,
      endDate: w.endDate,
      description: zhDesc
    })
    const i = p.work.length - 1
    add(`work.${i}.company`, w.company)
    if (!translateTitle(w.title)) add(`work.${i}.title`, w.title)
    if (zhDesc) add(`work.${i}.description`, zhDesc)
  }
  if (p.work.length) sectionsKept++

  // ---- Intern：最多 2 段 ----
  const interns = [...src.intern].sort(byEndDesc).slice(0, 2)
  for (const w of interns) {
    const zhDesc = topBullets(w.description, 2).join('\n')
    bullets += zhDesc ? zhDesc.split('\n').length : 0
    p.intern.push({
      ...emptyWork(),
      company: w.company,
      title: translateTitle(w.title) || w.title,
      startDate: w.startDate,
      endDate: w.endDate,
      description: zhDesc
    })
    const i = p.intern.length - 1
    add(`intern.${i}.company`, w.company)
    if (!translateTitle(w.title)) add(`intern.${i}.title`, w.title)
    if (zhDesc) add(`intern.${i}.description`, zhDesc)
  }
  if (p.intern.length) sectionsKept++

  // ---- Projects：按「近期 + 有成果 + 有职责」评分取最强 2 个 ----
  const projectScore = (x: typeof src.project[number]): number =>
    (x.endDate ? 2 : 0) + (x.achievement ? 2 : 0) + (x.duty ? 1 : 0) + Math.min((x.description || '').length / 100, 2)
  const projects = [...src.project].sort((a, b) => projectScore(b) - projectScore(a)).slice(0, 2)
  for (const x of projects) {
    const zhDesc = [x.achievement, x.duty, ...topBullets(x.description, 1)]
      .filter(Boolean)
      .slice(0, 3)
      .join('\n')
    bullets += zhDesc ? zhDesc.split('\n').length : 0
    p.project.push({
      ...emptyProject(),
      name: x.name,
      role: translateTitle(x.role) || x.role,
      startDate: x.startDate,
      endDate: x.endDate,
      description: zhDesc
    })
    const i = p.project.length - 1
    add(`project.${i}.name`, x.name)
    if (x.role && !translateTitle(x.role)) add(`project.${i}.role`, x.role)
    if (zhDesc) add(`project.${i}.description`, zhDesc)
  }
  if (p.project.length) sectionsKept++

  // ---- Skills / Languages ----
  if (src.skills.technical) {
    p.skills.technical = src.skills.technical
    add('skills.technical', src.skills.technical)
  }
  const langLine = src.personal.englishLevel || src.skills.languages || (src.language[0] ? `${src.language[0].language} ${src.language[0].certName} ${src.language[0].score}`.trim() : '')
  if (langLine) {
    p.skills.languages = langLine
    if (/[\u4e00-\u9fa5]/.test(langLine)) add('skills.languages', langLine)
  }
  if (p.skills.technical || p.skills.languages) sectionsKept++

  // ---- Awards：国家级/省级，最多 2 条 ----
  const awards = src.award.filter(a => !a.level || /国家级|省级|国家|省/.test(a.level)).slice(0, 2)
  for (const a of awards) {
    p.award.push({ ...emptyAward(), name: a.name, date: a.date, level: a.level })
    add(`award.${p.award.length - 1}.name`, a.name)
  }
  if (p.award.length) sectionsKept++

  // ---- Papers / Patents：强信号，最多 2 / 1 ----
  for (const x of src.paper.slice(0, 2)) {
    p.paper.push({ ...emptyPaper(), title: x.title, journal: x.journal, publishDate: x.publishDate, authors: x.authors, doi: x.doi })
    add(`paper.${p.paper.length - 1}.title`, x.title)
    if (x.journal) add(`paper.${p.paper.length - 1}.journal`, x.journal)
  }
  if (p.paper.length) sectionsKept++
  const patent = src.patent[0]
  if (patent) {
    p.patent.push({ ...emptyPatent(), name: patent.name, patentNo: patent.patentNo, applyDate: patent.applyDate })
    add('patent.0.name', patent.name)
    sectionsKept++
  }

  // ---- 英文简历禁忌/冗余项直接丢弃 ----
  if (src.family.length) dropped.push('家庭情况')
  if (s.politicalStatus) dropped.push('政治面貌')
  if (s.idNumber) dropped.push('证件号')
  if (s.height || s.weight) dropped.push('身高体重')
  if (src.cadre.length) dropped.push('干部任职')
  if (src.certificate.length) dropped.push('证书（并入技能）')

  return { profile: p, pending, stats: { bullets, sectionsKept, dropped } }
}

/** 应用 LLM 翻译结果（路径 → 英文）。 */
export function applyTranslations(draft: EnDraft, tr: Record<string, string>): Profile {
  for (const { key } of draft.pending) {
    const en = tr[key]
    if (en && en.trim()) setByPath(draft.profile, key, en.trim())
  }
  return draft.profile
}

// item 工厂（与档案默认值一致）
function emptyEdu() {
  return {
    id: crypto.randomUUID(), school: '', studentId: '', department: '', major: '', schoolCity: '',
    education: '', eduStatus: '', durationYears: '', startDate: '', endDate: '', degreeName: '', gpa: '',
    schoolType: '', eduMode: '', enrollmentType: '', failedCourses: '', classRank: '', majorRank: '',
    eduCertNo: '', degreeCertNo: '', counselorName: '', counselorContact: '', isOverseas: '',
    eduDescription: '', majorDescription: '', courses: '', researchDirection: '', thesis: ''
  }
}
function emptyWork() {
  return {
    id: crypto.randomUUID(), company: '', department: '', title: '', startDate: '', endDate: '', city: '',
    industry: '', employmentType: '', monthlySalary: '', annualSalary: '', refereeName: '', refereeContact: '',
    refereeTitle: '', description: '', leaveReason: ''
  }
}
function emptyProject() {
  return {
    id: crypto.randomUUID(), name: '', role: '', practiceType: '', startDate: '', endDate: '', city: '',
    link: '', refereeName: '', refereeContact: '', refereeTitle: '', description: '', duty: '', achievement: ''
  }
}
function emptyAward() {
  return { id: crypto.randomUUID(), name: '', issuer: '', date: '', endDate: '', level: '', awardType: '', grade: '', description: '' }
}
function emptyPaper() {
  return { id: crypto.randomUUID(), title: '', journal: '', authors: '', publishDate: '', doi: '', abstract: '' }
}
function emptyPatent() {
  return { id: crypto.randomUUID(), name: '', patentNo: '', applyDate: '', status: '', inventor: '', description: '' }
}
