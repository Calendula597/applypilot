/**
 * 简历档案数据模型 —— 字段集对齐 cv.playoffer.cn/resumes 的完整编辑页：
 * 14 个区块、共 109 个字段。popup / options / content script 共用。
 * 各多段区块的字段 key 同时是识别词典的语义类型（rules.ts），保持一一对应。
 */

export type Region = string // 地区：'广东省 / 肇庆市 / 四会市'

/** 个人信息（50 项） */
export interface PersonalInfo {
  fullName: string
  gender: string
  email: string
  phone: string
  wechat: string
  qq: string
  birthDate: string // YYYY-MM-DD
  age: string
  citizenship: string // 国籍
  ethnicity: string // 民族
  maritalStatus: string // 婚姻状况
  politicalStatus: string // 政治面貌
  partyJoinDate: string // 入党时间
  idType: string // 证件类型
  idNumber: string // 身份证号
  address: Region // 地址/现居地
  nativePlace: Region // 籍贯
  originPlace: Region // 生源地
  degreeName: string // 学位
  highestEducation: string // 最高学历
  graduateSchool: string // 毕业院校
  studyMode: string // 学习形式
  graduateDate: string // 毕业时间
  englishLevel: string // 英语等级
  gaokaoDate: string // 高考时间
  gaokaoScore: string // 高考分数
  gaokaoSubjects: string // 高考科目
  yearsOfExp: string // 工作年限
  professionalTitle: string // 专业技术职级
  workStatus: string // 工作状态
  lastCompany: string // 上一家公司
  emergencyName: string // 紧急联系人姓名
  emergencyRelation: string // 紧急联系人关系
  emergencyPhone: string // 紧急联系电话
  postalCode: string // 邮政编码
  healthStatus: string // 健康状况
  bloodType: string // 血型
  namePinyin: string // 姓名拼音
  englishName: string // 英文姓名
  isFreshGraduate: string // 是否应届生
  isRecommended: string // 是否保研
  hasOverseasExperience: string // 是否有留学经历
  hukouType: string // 户口性质
  hukouLocation: Region // 户口所在地
  archiveLocation: Region // 档案所在地
  height: string // 身高 cm
  weight: string // 体重 kg
  selfIntro: string // 自我介绍
  personalStrengths: string // 个人优势
  hobbies: string // 兴趣爱好
}

/** 求职意向（9 项） */
export interface JobIntention {
  targetPosition: string
  joinDate: string // 预计入职/到岗时间
  expectCity: Region
  interviewCity: Region
  expectSalary: string // 期望月薪
  expectAnnualSalary: string // 期望年薪
  currentSalary: string // 当前月薪
  acceptRelocation: string // 是否接受调剂
  jobNotes: string // 求职备注
}

/** 技能专长（5 项，单组文本） */
export interface Skills {
  technical: string // 技术技能
  languages: string // 语言能力
  software: string // 软件技能
  certificates: string // 证书认证
  soft: string // 软技能
}

/** 教育背景（每段 28 项） */
export interface EducationItem {
  id: string
  school: string
  studentId: string // 学号
  department: string // 院系
  major: string
  schoolCity: Region
  education: string // 学历
  eduStatus: string // 学历状态
  durationYears: string // 学制（年）
  startDate: string
  endDate: string
  degreeName: string // 学位
  gpa: string // 成绩绩点
  schoolType: string // 学校类型
  eduMode: string // 教育方式
  enrollmentType: string // 招生类别
  failedCourses: string // 挂科数
  classRank: string
  majorRank: string
  eduCertNo: string // 学历证书编号
  degreeCertNo: string // 学位证书编号
  counselorName: string // 辅导员姓名
  counselorContact: string // 辅导员联系方式
  isOverseas: string // 是否海外学校
  eduDescription: string
  majorDescription: string
  courses: string // 专业课程
  researchDirection: string // 研究方向
  thesis: string // 毕业论文
}

/** 工作经历（每段 15 项） */
export interface WorkItem {
  id: string
  company: string
  department: string
  title: string
  startDate: string
  endDate: string
  city: Region
  industry: string
  employmentType: string // 用工性质
  monthlySalary: string
  annualSalary: string
  refereeName: string // 证明人姓名
  refereeContact: string
  refereeTitle: string
  description: string
  leaveReason: string
}

/** 实习经历（每段 12 项） */
export interface InternItem {
  id: string
  company: string
  department: string
  title: string
  startDate: string
  endDate: string
  city: Region
  industry: string
  employmentType: string
  refereeName: string
  refereeContact: string
  refereeTitle: string
  description: string
}

/** 项目经历（每段 13 项） */
export interface ProjectItem {
  id: string
  name: string
  role: string // 项目职务
  practiceType: string // 实践方式
  startDate: string
  endDate: string
  city: Region
  link: string // 项目链接
  refereeName: string
  refereeContact: string
  refereeTitle: string
  description: string
  duty: string // 项目职责
  achievement: string // 项目成果
}

/** 干部任职经历（每段 6 项） */
export interface CadreItem {
  id: string
  organization: string
  title: string
  startDate: string
  endDate: string
  description: string
  duty: string
}

/** 外语能力（每段 7 项） */
export interface LanguageItem {
  id: string
  language: string
  obtainedDate: string
  certName: string
  score: string
  proficiency: string
  listeningSpeaking: string
  readingWriting: string
}

/** 证书（每段 3 项） */
export interface CertificateItem {
  id: string
  name: string
  type: string
  obtainedDate: string
}

/** 获奖经历（每段 8 项） */
export interface AwardItem {
  id: string
  name: string
  issuer: string // 颁发机构
  date: string
  endDate: string
  level: string // 奖项级别
  awardType: string // 奖励类型
  grade: string // 奖励等级
  description: string
}

/** 专利信息（每段 6 项） */
export interface PatentItem {
  id: string
  name: string
  patentNo: string
  applyDate: string
  status: string
  inventor: string
  description: string
}

/** 论文发表（每段 6 项） */
export interface PaperItem {
  id: string
  title: string
  journal: string
  authors: string
  publishDate: string
  doi: string
  abstract: string
}

/** 家庭情况（每段 11 项） */
export interface FamilyMember {
  id: string
  name: string
  relation: string
  gender: string
  education: string
  birthDate: string
  phone: string
  company: string
  title: string
  politicalStatus: string
  address: Region
}

export interface Profile {
  id: string
  label: string
  /** 英文简历档案标记：导出 PDF 时切换为英文版式与标题。 */
  lang?: 'en'
  personal: PersonalInfo
  intention: JobIntention
  skills: Skills
  education: EducationItem[]
  work: WorkItem[]
  intern: InternItem[]
  project: ProjectItem[]
  cadre: CadreItem[]
  language: LanguageItem[]
  certificate: CertificateItem[]
  award: AwardItem[]
  patent: PatentItem[]
  paper: PaperItem[]
  family: FamilyMember[]
}

export interface FillFailure {
  reason: string
  cause: 'unmatched' | 'no-value' | 'unsupported' | 'custom-control-failed'
}

export interface FillResult {
  filled: number
  failed: FillFailure[]
  pageDetected: boolean
  /** 其中由 LLM 兜底识别填充的字段数（规则引擎之外）。 */
  llmFilled: number
  /** LLM 兜底失败原因（未开启兜底或无失败时为空）。 */
  llmError?: string
}

export function emptyEducation(): EducationItem {
  return {
    id: crypto.randomUUID(), school: '', studentId: '', department: '', major: '', schoolCity: '',
    education: '本科', eduStatus: '在读', durationYears: '', startDate: '', endDate: '',
    degreeName: '', gpa: '', schoolType: '', eduMode: '全日制', enrollmentType: '统招',
    failedCourses: '', classRank: '', majorRank: '', eduCertNo: '', degreeCertNo: '',
    counselorName: '', counselorContact: '', isOverseas: '否',
    eduDescription: '', majorDescription: '', courses: '', researchDirection: '', thesis: ''
  }
}

export function emptyWork(): WorkItem {
  return {
    id: crypto.randomUUID(), company: '', department: '', title: '', startDate: '', endDate: '',
    city: '', industry: '', employmentType: '', monthlySalary: '', annualSalary: '',
    refereeName: '', refereeContact: '', refereeTitle: '', description: '', leaveReason: ''
  }
}

export function emptyIntern(): InternItem {
  return {
    id: crypto.randomUUID(), company: '', department: '', title: '', startDate: '', endDate: '',
    city: '', industry: '', employmentType: '', refereeName: '', refereeContact: '',
    refereeTitle: '', description: ''
  }
}

export function emptyProject(): ProjectItem {
  return {
    id: crypto.randomUUID(), name: '', role: '', practiceType: '', startDate: '', endDate: '',
    city: '', link: '', refereeName: '', refereeContact: '', refereeTitle: '',
    description: '', duty: '', achievement: ''
  }
}

export function emptyCadre(): CadreItem {
  return { id: crypto.randomUUID(), organization: '', title: '', startDate: '', endDate: '', description: '', duty: '' }
}

export function emptyLanguage(): LanguageItem {
  return {
    id: crypto.randomUUID(), language: '', obtainedDate: '', certName: '', score: '',
    proficiency: '', listeningSpeaking: '', readingWriting: ''
  }
}

export function emptyCertificate(): CertificateItem {
  return { id: crypto.randomUUID(), name: '', type: '', obtainedDate: '' }
}

export function emptyAward(): AwardItem {
  return {
    id: crypto.randomUUID(), name: '', issuer: '', date: '', endDate: '',
    level: '', awardType: '', grade: '', description: ''
  }
}

export function emptyPatent(): PatentItem {
  return { id: crypto.randomUUID(), name: '', patentNo: '', applyDate: '', status: '', inventor: '', description: '' }
}

export function emptyPaper(): PaperItem {
  return { id: crypto.randomUUID(), title: '', journal: '', authors: '', publishDate: '', doi: '', abstract: '' }
}

export function emptyFamily(): FamilyMember {
  return {
    id: crypto.randomUUID(), name: '', relation: '', gender: '', education: '',
    birthDate: '', phone: '', company: '', title: '', politicalStatus: '', address: ''
  }
}

export function emptyProfile(label = '我的简历'): Profile {
  return {
    id: crypto.randomUUID(),
    label,
    personal: {
      fullName: '', gender: '', email: '', phone: '', wechat: '', qq: '', birthDate: '', age: '',
      citizenship: '中国', ethnicity: '汉族', maritalStatus: '', politicalStatus: '', partyJoinDate: '',
      idType: '身份证', idNumber: '', address: '', nativePlace: '', originPlace: '',
      degreeName: '', highestEducation: '', graduateSchool: '', studyMode: '', graduateDate: '',
      englishLevel: '', gaokaoDate: '', gaokaoScore: '', gaokaoSubjects: '',
      yearsOfExp: '', professionalTitle: '', workStatus: '', lastCompany: '',
      emergencyName: '', emergencyRelation: '', emergencyPhone: '',
      postalCode: '', healthStatus: '健康', bloodType: '', namePinyin: '', englishName: '',
      isFreshGraduate: '', isRecommended: '', hasOverseasExperience: '否',
      hukouType: '', hukouLocation: '', archiveLocation: '',
      height: '', weight: '', selfIntro: '', personalStrengths: '', hobbies: ''
    },
    intention: {
      targetPosition: '', joinDate: '', expectCity: '', interviewCity: '',
      expectSalary: '', expectAnnualSalary: '', currentSalary: '',
      acceptRelocation: '', jobNotes: ''
    },
    skills: { technical: '', languages: '', software: '', certificates: '', soft: '' },
    education: [],
    work: [],
    intern: [],
    project: [],
    cadre: [],
    language: [],
    certificate: [],
    award: [],
    patent: [],
    paper: [],
    family: []
  }
}

/**
 * 旧版（v0：basics + education + work）档案迁移到 v1 结构。
 * 旧字段：fullName/phone/email/gender/birthDate/city/degree/yearsOfExp/
 * expectPosition/expectSalary/selfIntro；education{school,major,degree,start,end}；
 * work{company,title,start,end,description}。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateProfile(old: any): Profile {
  if (old && old.personal && old.intention) return old as Profile
  const p = emptyProfile(old?.label ?? '我的简历')
  p.id = old?.id ?? p.id
  const b = old?.basics ?? {}
  Object.assign(p.personal, {
    fullName: b.fullName ?? '', phone: b.phone ?? '', email: b.email ?? '', gender: b.gender ?? '',
    birthDate: b.birthDate ?? '', highestEducation: b.degree ?? '', yearsOfExp: b.yearsOfExp ?? '',
    selfIntro: b.selfIntro ?? ''
  })
  Object.assign(p.intention, {
    targetPosition: b.expectPosition ?? '', expectSalary: b.expectSalary ?? ''
  })
  p.education = (old?.education ?? []).map((e: Record<string, string>) => ({
    ...emptyEducation(),
    school: e.school ?? '', major: e.major ?? '', education: e.degree ?? '',
    startDate: e.start ?? '', endDate: e.end ?? ''
  }))
  p.work = (old?.work ?? []).map((w: Record<string, string>) => ({
    ...emptyWork(),
    company: w.company ?? '', title: w.title ?? '',
    startDate: w.start ?? '', endDate: w.end ?? '', description: w.description ?? ''
  }))
  return p
}
