/**
 * PDF 简历导入：pdf.js 提取文本 → 启发式解析为档案字段。
 * 纯本地、不联网；简历版式千差万别，解析是尽力而为，
 * 结果写入新档案后在编辑器里人工核对补全。
 */
import { emptyProfile, type Profile } from '../shared/types'

export interface ImportResult {
  profile: Profile
  filledCount: number
}

export async function importResumeFile(file: File): Promise<ImportResult> {
  const label = file.name.replace(/\.pdf$/i, '').replace(/\.[^.]+$/, '') || '导入简历'
  const text = await extractPdfText(await file.arrayBuffer())
  return parseResumeText(text, label)
}

// ---------- PDF 文本提取 ----------

async function extractPdfText(buf: ArrayBuffer): Promise<string> {
  const [{ getDocument, GlobalWorkerOptions }, workerMod] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ])
  GlobalWorkerOptions.workerSrc = (workerMod as { default: string }).default
  const loadingTask = getDocument({ data: new Uint8Array(buf) })
  const doc = await loadingTask.promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (!('str' in item)) continue
      out += item.str
      if (item.hasEOL) out += '\n'
    }
    out += '\n'
  }
  await loadingTask.destroy()
  return out
}

// ---------- 文本 → 结构化档案 ----------

type SectionId =
  | 'head' | 'basic' | 'intent' | 'edu' | 'work' | 'intern' | 'project' | 'cadre'
  | 'language' | 'cert' | 'award' | 'patent' | 'paper' | 'family' | 'skills' | 'self'

const SECTION_PATTERNS: [SectionId, string[]][] = [
  ['basic', ['个人信息', '基本信息', '个人资料', '联系方式', '联系信息']],
  ['intent', ['求职意向', '职业目标', '求职目标']],
  ['edu', ['教育经历', '教育背景', '教育信息', '教育情况', '学习经历', '教育']],
  ['work', ['工作经历', '工作历史', '职业经历', '工作经验', '工作']],
  ['intern', ['实习经历', '实习经验', '实习']],
  ['project', ['项目经历', '项目经验', '项目背景', '项目']],
  ['cadre', ['干部任职', '学生工作', '任职经历', '校园经历']],
  ['language', ['外语能力', '语言能力', '外语水平', '外语']],
  ['cert', ['资格证书', '资质证书', '证书']],
  ['award', ['获奖经历', '所获荣誉', '荣誉奖项', '获奖', '奖项', '荣誉']],
  ['patent', ['专利信息', '专利']],
  ['paper', ['论文发表', '发表论文', '学术论文', '学术成果', '发表文章', '论文']],
  ['family', ['家庭情况', '家庭成员', '家庭关系', '家庭']],
  ['skills', ['技能专长', '专业技能', '技能特长', 'IT技能', '技能']],
  ['self', ['自我介绍', '自我评价', '个人简介', '自我描述', '个人评价', '个人优势']]
]

function stripHeadingDecor(s: string): string {
  return s
    .replace(/^[（(【\[]?[一二三四五六七八九十0-9]{1,3}[)）】\]]?[、..．\s]*/, '')
    .replace(/[:：\s【】()（）\[\]|｜]/g, '')
    .trim()
}

function headingSectionId(line: string): SectionId | null {
  const h = stripHeadingDecor(line)
  if (!h || h.length > 14) return null
  for (const [id, words] of SECTION_PATTERNS) {
    for (const w of words) {
      if (h === w || (h.startsWith(w) && h.length <= w.length + 4)) return id
    }
  }
  return null
}

interface LineBlock {
  section: SectionId
  lines: string[]
}

function splitSections(text: string): LineBlock[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const blocks: LineBlock[] = [{ section: 'head', lines: [] }]
  for (const line of lines) {
    const id = headingSectionId(line)
    if (id) {
      const last = blocks[blocks.length - 1]
      if (last.section === id && last.lines.length === 0) continue // 重复标题
      blocks.push({ section: id, lines: [] })
    } else {
      blocks[blocks.length - 1].lines.push(line)
    }
  }
  return blocks
}

// ---------- 通用小工具 ----------

const DATE_RE = /(?<!\d)((?:19|20)\d{2})(?:[.\/年-](\d{1,2}))?(?:[.\/月-](\d{1,2}))?(?:日|号)?(?!\d)/g

function findDates(s: string): string[] {
  const out: string[] = []
  for (const m of s.matchAll(DATE_RE)) {
    const y = m[1]
    const mo = m[2] ? m[2].padStart(2, '0') : ''
    if (Number(mo) > 12 || Number(m[3] ?? 0) > 31) continue
    out.push(mo ? `${y}-${mo}` : y)
  }
  return out
}

function parseRange(s: string): { start: string; end: string } {
  const dates = findDates(s)
  if (dates.length === 0) return { start: '', end: '' }
  if (dates.length >= 2) return { start: dates[0], end: dates[1] }
  return { start: dates[0], end: /至今|现在|now|present/i.test(s) ? '' : '' }
}

function labelValue(text: string, labelRe: RegExp): string {
  const m = text.match(labelRe)
  return m ? (m[1] ?? '').trim() : ''
}

function firstMatch(text: string, re: RegExp): string {
  const m = text.match(re)
  return m ? m[0] : ''
}

const clean = (s: string) =>
  s
    .replace(DATE_RE, '')
    .replace(/至今|现在|[~～—–-]{1,2}/g, '')
    .replace(/[:：|｜,，、\s]+/g, ' ')
    .trim()

// ---------- 各区块解析 ----------

interface Entry {
  head: string
  body: string[]
}

/** 按条目起始行切块（不再细分行内字段）。 */
function splitEntries(lines: string[], isEntryHead: (line: string) => boolean): Entry[] {
  const entries: Entry[] = []
  for (const line of lines) {
    if (isEntryHead(line) || entries.length === 0) {
      entries.push({ head: line, body: [] })
    } else {
      entries[entries.length - 1].body.push(line)
    }
  }
  return entries
}

const SCHOOL_RE = /[\u4e00-\u9fa5A-Za-z（(]+(?:大学|学院|学校|University|College|Institute)/i
const COMPANY_RE = /[\u4e00-\u9fa5A-Za-z（）()]+(?:有限公司|股份公司|集团|公司|银行|事务所|Ltd\.?|Inc\.?|LLC)/i
const DEGREE_RE = /(博士研究生|硕士研究生|研究生|博士|硕士|本科|大学本科|学士|大专|专科|中专|高中)/

function degreeOf(s: string): string {
  const m = s.match(DEGREE_RE)
  if (!m) return ''
  switch (m[1]) {
    case '博士研究生': case '博士': return '博士'
    case '硕士研究生': case '研究生': case '硕士': return '硕士'
    case '大学本科': case '本科': return '本科'
    case '大专': case '专科': return '大专'
    default: return m[1]
  }
}

export function parseResumeText(text: string, label: string): ImportResult {
  const profile = emptyProfile(label)
  const p = profile.personal
  const blocks = splitSections(text)
  const blockLines = (id: SectionId): string[] => {
    const b = blocks.find(x => x.section === id)
    return b ? b.lines : []
  }
  const blockText = (id: SectionId): string => blockLines(id).join('\n')
  const headText = blocks.map(b => b.lines.join('\n')).join('\n')

  // ---- 基本信息（全文范围，标签优先） ----
  p.fullName =
    labelValue(headText, /姓名[:：]?\s*([\u4e00-\u9fa5·]{2,4})\b/) ||
    (() => {
      const first = blockLines('head')[0] ?? ''
      const seg = first.split(/[|｜/／]/)[0].trim()
      if (/^[\u4e00-\u9fa5·]{2,4}$/.test(seg) && !headingSectionId(seg)) return seg
      return ''
    })()
  p.phone = firstMatch(headText, /(?<!\d)1[3-9]\d{9}(?!\d)/)
  p.email = firstMatch(headText, /[\w.+-]+@[\w-]+\.[\w.-]+/)
  p.gender = labelValue(headText, /性\s*别[:：]?\s*(男|女)/) || firstMatch(headText, /(?<![^\s:：])(男|女)(?=[\s,，、])/)
  p.birthDate = labelValue(headText, /出生(?:日期|年月)?[:：]?\s*((?:19|20)\d{2}[.\/年-]\d{1,2}(?:[.\/月-]\d{1,2})?)/)
    .replace(/[年月]/g, '-')
    .replace(/日$/, '')
  p.wechat = labelValue(headText, /微信(?:号|号码)?[:：]?\s*([A-Za-z][A-Za-z0-9_-]{4,19})/)
  p.qq = labelValue(headText, /QQ(?:号|号码)?[:：]?\s*(\d{5,12})/i)
  p.idNumber = labelValue(headText, /身份证(?:号码|号)?[:：]?\s*(\d{17}[0-9Xx]|\d{15})/)
  p.ethnicity = (() => {
    const m = headText.match(/([\u4e00-\u9fa5]{1,6}族)/)
    return m ? m[1] : ''
  })()
  p.politicalStatus = firstMatch(headText, /(中共党员|中共预备党员|预备党员|共青团员|民主党派|群众)/)
  p.nativePlace = labelValue(headText, /籍\s*贯[:：]?\s*([\u4e00-\u9fa5]{2,10})/)
  p.address =
    labelValue(
      headText,
      /(?:现居|居住地|所在城市|现居城市|联系地址|地址)[:：]?\s*([\u4e00-\u9fa5]{2,12}(?:\s*[\u4e00-\u9fa5]{2,12}){0,2})/
    ) || ''
  p.highestEducation = (() => {
    for (const d of ['博士', '硕士', '本科', '大专', '高中']) {
      if (headText.includes(d)) return d
    }
    return ''
  })()
  p.yearsOfExp =
    labelValue(headText, /工作(?:年限|经验|年数)[:：]?\s*([^\s,，;；]{1,10})/) ||
    firstMatch(headText, /\d+\s*(?:-\s*\d+\s*)?年以上?(?:工作)?经验/) ||
    (headText.includes('应届') ? '应届' : '')
  p.englishLevel = firstMatch(headText, /(CET-?[46]|大学英语[四六]级|[四六]级|雅思|IELTS|托福|TOEFL)\s*[:：]?\s*\d{0,4}/)
  const emergencyLine = blockLines('basic').concat(blockLines('head')).find(l => /紧急联系/.test(l))
  if (emergencyLine) {
    p.emergencyPhone = firstMatch(emergencyLine, /(?<!\d)1[3-9]\d{9}(?!\d)/)
    p.emergencyRelation = labelValue(emergencyLine, /(?:关系|称谓)[:：]?\s*([\u4e00-\u9fa5]{1,6})/)
    const nameM = emergencyLine.match(/紧急联系人[:：]?\s*([\u4e00-\u9fa5]{2,4})/)
    if (nameM) p.emergencyName = nameM[1]
  }

  // ---- 求职意向 ----
  const intentText = blockText('intent')
  profile.intention.targetPosition =
    labelValue(intentText, /(?:期望|意向|目标|应聘)(?:工作)?(?:职位|岗位|方向)[:：]?\s*([^\s,，;；|｜]{2,20})/) ||
    labelValue(headText, /求职意向[:：]?\s*([^\s,，;；|｜]{2,20})/)
  profile.intention.expectCity = labelValue(intentText, /(?:期望|意向)(?:工作)?(?:城市|地点|地区)[:：]?\s*([\u4e00-\u9fa5]{2,10})/)
  profile.intention.expectSalary = labelValue(intentText, /(?:期望|意向|月薪|薪资|薪水)[:：]?\s*(\d+[kK千万]?(?:[ \t]*[-~～—–][ \t]*\d*[kK千万]?)?元?(?:[ \t]*\/[ \t]*[月年到])?)/)
  profile.intention.joinDate = labelValue(intentText, /(?:到岗|入职|到职)(?:时间)?[:：]?\s*([^\s,，;；]{2,10})/)

  // ---- 教育经历 ----
  const eduEntries = splitEntries(blockLines('edu'), line => SCHOOL_RE.test(line) && findDates(line).length > 0)
  for (const e of eduEntries) {
    const seg = e.head.split(/[|｜/／]/)
    const schoolSeg = seg.find(s => SCHOOL_RE.test(s)) ?? e.head
    const dates = parseRange(e.head)
    const edu: (typeof profile.education)[number] = {
      ...emptyEduItem(),
      school: clean(schoolSeg.match(SCHOOL_RE)?.[0] ?? schoolSeg),
      startDate: dates.start,
      endDate: dates.end
    }
    for (const part of seg) {
      if (part !== schoolSeg) {
        if (/专业|Major/i.test(part)) edu.major = clean(labelValue(part, /(?:专业|Major)[:：]?([\u4e00-\u9fa5A-Za-z]+)/))
        else if (DEGREE_RE.test(part)) edu.education = degreeOf(part)
        else if (part.trim() && !edu.major) edu.major = clean(part)
      }
    }
    if (!edu.education) edu.education = degreeOf(e.head)
    for (const line of e.body) {
      if (/专业[:：]/.test(line) && !edu.major) edu.major = clean(labelValue(line, /专业[:：]\s*(\S+)/))
      else if (/院系|学院[:：]/.test(line)) edu.department = clean(labelValue(line, /(?:院系|学院)[:：]\s*(\S+)/))
      else if (/GPA|绩点/i.test(line)) edu.gpa = labelValue(line, /(?:GPA|绩点)[:：]?\s*([\d.]+)/i)
      else if (/课程/.test(line)) edu.courses = labelValue(line, /(?:专业)?课程[:：]?\s*(.+)$/).trim()
      else if (/研究方向/.test(line)) edu.researchDirection = labelValue(line, /研究方向[:：]?\s*(.+)$/).trim()
      else if (/排名/.test(line)) edu.classRank = clean(labelValue(line, /(.*?)排名[:：]?\s*(\S+)/))
    }
    profile.education.push(edu)
  }

  // ---- 工作 / 实习 ----
  const isJobHead = (line: string): boolean =>
    COMPANY_RE.test(line) || (findDates(line).length > 0 && line.length <= 40)
  const parseJobEntry = (e: Entry) => {
    const dates = parseRange(e.head)
    const seg = e.head.split(/[|｜/／]/)
    const companySeg = seg.find(s => COMPANY_RE.test(s)) ?? seg[0]
    const out = {
      company: clean(companySeg.match(COMPANY_RE)?.[0] ?? companySeg),
      title: '',
      startDate: dates.start,
      endDate: dates.end,
      description: '',
      leaveReason: ''
    }
    for (const part of seg) {
      if (part === companySeg) continue
      if (/职位|岗位|职务|Title/i.test(part)) out.title = clean(labelValue(part, /(?:职位|岗位|职务|Title)[:：]?\s*(\S+)/i))
      else if (!out.title && part.trim() && findDates(part).length === 0) out.title = clean(part)
    }
    const descParts: string[] = []
    for (const line of e.body) {
      if (/离职原因/.test(line)) out.leaveReason = clean(labelValue(line, /离职原因[:：]?\s*(.+)$/))
      else if (!out.title && /职位|岗位|职务/.test(line)) out.title = clean(labelValue(line, /(?:职位|岗位|职务)[:：]?\s*(\S+)/))
      else descParts.push(line)
    }
    out.description = descParts.join('\n')
    return out
  }
  for (const e of splitEntries(blockLines('work'), isJobHead)) {
    const j = parseJobEntry(e)
    profile.work.push({ ...emptyWorkItem(), ...j })
  }
  for (const e of splitEntries(blockLines('intern'), isJobHead)) {
    const { leaveReason: _drop, ...j } = parseJobEntry(e)
    void _drop
    profile.intern.push({ ...emptyInternItem(), ...j })
  }

  // ---- 项目经历 ----
  const projectEntries = splitEntries(
    blockLines('project'),
    line => findDates(line).length > 0 || /^项目(名称)?[:：]/.test(line)
  )
  for (const e of projectEntries) {
    const proj = emptyProjectItem()
    const dates = parseRange(e.head)
    proj.name = clean(e.head.split(/[|｜/／]/)[0])
    proj.startDate = dates.start
    proj.endDate = dates.end
    const descParts: string[] = []
    for (const line of e.body) {
      if (/职责|负责/.test(line)) proj.duty = (labelValue(line, /(?:项目)?职责[:：]?\s*(.+)$/) || line).trim()
      else if (/成果|业绩|结果/.test(line)) proj.achievement = labelValue(line, /(?:项目)?(?:成果|业绩)[:：]?\s*(.+)$/).trim()
      else descParts.push(line)
    }
    proj.description = descParts.join('\n')
    profile.project.push(proj)
  }

  // ---- 技能 / 外语 / 证书 / 获奖 / 其他区块 ----
  if (blocks.find(b => b.section === 'language')) {
    profile.skills.languages = blockText('language').slice(0, 300)
  }
  for (const line of blockLines('skills')) {
    if (/语言[:：]/.test(line)) profile.skills.languages = clean(labelValue(line, /语言(?:能力)?[:：]\s*(.+)$/))
    else if (profile.skills.technical.length + line.length < 500) profile.skills.technical += (profile.skills.technical ? '\n' : '') + line
  }
  const langLines = blockLines('language').length
    ? blockLines('language')
    : blockLines('skills').filter(l => /(CET|雅思|IELTS|托福|TOEFL|英语|日语|韩语|法语|德语|俄语)/.test(l))
  for (const line of langLines) {
    const lang = emptyLanguageItem()
    lang.language = firstMatch(line, /(英语|日语|韩语|法语|德语|俄语|西班牙语)/)
    if (!lang.language) continue
    lang.certName = firstMatch(line, /(CET-?[46]|大学英语[四六]级|[四六]级|雅思|IELTS|托福|TOEFL)/)
    lang.score = firstMatch(line, /(?<!\d)(\d{3})(?!\d)/) || labelValue(line, /(?:成绩|分数)[:：]?\s*(\d{2,4})/)
    const dm = line.match(/(精通|熟练|良好|一般)/)
    if (dm) lang.proficiency = dm[1]
    profile.language.push(lang)
  }
  for (const line of blockLines('cert')) {
    const name = line.replace(/^(证书|资格证书|资质证书)[:：]?/, '').trim()
    if (name) profile.certificate.push({ ...emptyCertificateItem(), name: name.slice(0, 60), obtainedDate: findDates(line)[0] ?? '' })
  }
  for (const line of blockLines('award')) {
    if (!/(奖|竞赛|大赛|荣誉|scholar|prize|award)/i.test(line)) continue
    profile.award.push({
      ...emptyAwardItem(),
      name: line.trim().slice(0, 80),
      date: findDates(line)[0] ?? '',
      level: firstMatch(line, /(国家级|省级|市级|校级|院级)/),
      grade: firstMatch(line, /(特等奖|一等奖|二等奖|三等奖|优秀奖)/)
    })
  }
  for (const line of blockLines('paper')) {
    profile.paper.push({
      ...emptyPaperItem(),
      title: line.trim().slice(0, 120),
      journal: labelValue(line, /(?:期刊|会议|杂志|Journal)[:：]\s*(\S+)/),
      publishDate: findDates(line)[0] ?? '',
      doi: firstMatch(line, /(10\.\d{4,}\/\S+)/)
    })
  }
  for (const line of blockLines('patent')) {
    profile.patent.push({ ...emptyPatentItem(), name: line.trim().slice(0, 80) })
  }
  for (const line of blockLines('cadre')) {
    if (!/(会长|主席|部长|委员|书记|班长|组长|干事|干部)/.test(line)) continue
    profile.cadre.push({
      ...emptyCadreItem(),
      organization: clean(line.split(/(学生会|社团|协会|团委|党支部)/)[0] || line).slice(0, 40) || '—',
      title: firstMatch(line, /(会长|主席|部长|委员|书记|班长|组长|干事)/),
      startDate: findDates(line)[0] ?? '',
      endDate: findDates(line)[1] ?? ''
    })
  }
  for (const line of blockLines('family')) {
    const rel = firstMatch(line, /(父亲|母亲|哥哥|姐姐|弟弟|妹妹|配偶|妻子|丈夫|儿子|女儿)/)
    if (!rel) continue
    profile.family.push({
      ...emptyFamilyItem(),
      relation: rel,
      name: labelValue(line, /姓名[:：]?\s*([\u4e00-\u9fa5]{2,4})/),
      phone: firstMatch(line, /(?<!\d)1[3-9]\d{9}(?!\d)/)
    })
  }

  // ---- 自我评价 ----
  const selfText = blockText('self')
  if (selfText) p.selfIntro = selfText.slice(0, 800)
  const hobby = labelValue(headText, /兴趣(?:爱好)?[:：]?\s*([\u4e00-\u9fa5A-Za-z、，, ]{2,40})/)
  if (hobby) p.hobbies = hobby

  // ---- 统计填充数 ----
  let filledCount = 0
  const countObj = (o: object) => {
    for (const v of Object.values(o as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) filledCount++
    }
  }
  countObj(profile.personal)
  countObj(profile.intention)
  countObj(profile.skills)
  for (const arr of [profile.education, profile.work, profile.intern, profile.project, profile.cadre, profile.language, profile.certificate, profile.award, profile.patent, profile.paper, profile.family]) {
    for (const item of arr) countObj(item)
  }
  return { profile, filledCount }
}

// empty item 工厂（避免与 types.ts 循环依赖之外再引一次；直接内联）
function emptyEduItem() {
  return {
    id: crypto.randomUUID(), school: '', studentId: '', department: '', major: '', schoolCity: '',
    education: '', eduStatus: '', durationYears: '', startDate: '', endDate: '', degreeName: '', gpa: '',
    schoolType: '', eduMode: '', enrollmentType: '', failedCourses: '', classRank: '', majorRank: '',
    eduCertNo: '', degreeCertNo: '', counselorName: '', counselorContact: '', isOverseas: '',
    eduDescription: '', majorDescription: '', courses: '', researchDirection: '', thesis: ''
  }
}
function emptyWorkItem() {
  return {
    id: crypto.randomUUID(), company: '', department: '', title: '', startDate: '', endDate: '', city: '',
    industry: '', employmentType: '', monthlySalary: '', annualSalary: '', refereeName: '', refereeContact: '',
    refereeTitle: '', description: '', leaveReason: ''
  }
}
function emptyInternItem() {
  return {
    id: crypto.randomUUID(), company: '', department: '', title: '', startDate: '', endDate: '', city: '',
    industry: '', employmentType: '', refereeName: '', refereeContact: '', refereeTitle: '', description: ''
  }
}
function emptyProjectItem() {
  return {
    id: crypto.randomUUID(), name: '', role: '', practiceType: '', startDate: '', endDate: '', city: '',
    link: '', refereeName: '', refereeContact: '', refereeTitle: '', description: '', duty: '', achievement: ''
  }
}
function emptyLanguageItem() {
  return { id: crypto.randomUUID(), language: '', obtainedDate: '', certName: '', score: '', proficiency: '', listeningSpeaking: '', readingWriting: '' }
}
function emptyCertificateItem() {
  return { id: crypto.randomUUID(), name: '', type: '', obtainedDate: '' }
}
function emptyAwardItem() {
  return { id: crypto.randomUUID(), name: '', issuer: '', date: '', endDate: '', level: '', awardType: '', grade: '', description: '' }
}
function emptyPatentItem() {
  return { id: crypto.randomUUID(), name: '', patentNo: '', applyDate: '', status: '', inventor: '', description: '' }
}
function emptyPaperItem() {
  return { id: crypto.randomUUID(), title: '', journal: '', authors: '', publishDate: '', doi: '', abstract: '' }
}
function emptyCadreItem() {
  return { id: crypto.randomUUID(), organization: '', title: '', startDate: '', endDate: '', description: '', duty: '' }
}
function emptyFamilyItem() {
  return { id: crypto.randomUUID(), name: '', relation: '', gender: '', education: '', birthDate: '', phone: '', company: '', title: '', politicalStatus: '', address: '' }
}
