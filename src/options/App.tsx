import { useEffect, useRef, useState } from 'preact/hooks'
import { loadStore, saveStore, type Store } from '../shared/storage'
import {
  emptyProfile,
  emptyEducation,
  emptyWork,
  emptyIntern,
  emptyProject,
  emptyCadre,
  emptyLanguage,
  emptyCertificate,
  emptyAward,
  emptyPatent,
  emptyPaper,
  emptyFamily,
  type Profile
} from '../shared/types'
import { printProfile } from './export'
import { importResumeFile } from './resumeImport'
import { buildEnglishDraft, applyTranslations } from './enResume'
import { buildPolishItems, applyPolish, MAX_POLISH_ITEMS, type PolishItem } from './polish'
import { loadLlmConfig, saveLlmConfig, llmTranslateBatch, llmPolish, originPatternOf, type LlmConfig } from '../shared/llm'
import './options.css'

// ---------- 字段配置 ----------

interface FieldDef {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'select'
  options?: string[]
  ph?: string
  full?: boolean
}

const GENDER_OPTS = ['', '男', '女']
const YES_NO = ['是', '否']
const DEGREE_OPTS = ['初中', '高中', '大专', '本科', '硕士', '博士']
const FAMILY_EDU_OPTS = ['小学及以下', '初中', '高中', '大专', '本科', '硕士', '博士']

const PERSONAL_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: '基础信息',
    fields: [
      { key: 'fullName', label: '姓名' },
      { key: 'gender', label: '性别', type: 'select', options: GENDER_OPTS },
      { key: 'namePinyin', label: '姓名拼音' },
      { key: 'englishName', label: '英文姓名' },
      { key: 'birthDate', label: '出生日期', ph: 'YYYY-MM-DD' },
      { key: 'age', label: '年龄' },
      { key: 'citizenship', label: '国籍' },
      { key: 'ethnicity', label: '民族' },
      { key: 'maritalStatus', label: '婚姻状况', type: 'select', options: ['', '未婚', '已婚', '离异', '丧偶'] },
      { key: 'politicalStatus', label: '政治面貌', type: 'select', options: ['', '中共党员', '中共预备党员', '共青团员', '民主党派', '群众'] },
      { key: 'partyJoinDate', label: '入党时间', ph: 'YYYY-MM-DD' }
    ]
  },
  {
    title: '联系方式',
    fields: [
      { key: 'phone', label: '手机' },
      { key: 'email', label: '邮箱' },
      { key: 'wechat', label: '微信号' },
      { key: 'qq', label: 'QQ号' },
      { key: 'address', label: '地址', ph: '省 / 市 / 区', full: true },
      { key: 'postalCode', label: '邮政编码' }
    ]
  },
  {
    title: '证件与户籍',
    fields: [
      { key: 'idType', label: '证件类型', type: 'select', options: ['身份证', '护照', '港澳台通行证', '其他'] },
      { key: 'idNumber', label: '身份证号' },
      { key: 'hukouType', label: '户口性质', type: 'select', options: ['', '城镇', '农村'] },
      { key: 'hukouLocation', label: '户口所在地', ph: '省 / 市 / 区' },
      { key: 'archiveLocation', label: '档案所在地', ph: '省 / 市 / 区' },
      { key: 'nativePlace', label: '籍贯', ph: '省 / 市' },
      { key: 'originPlace', label: '生源地', ph: '省 / 市' }
    ]
  },
  {
    title: '学业概况',
    fields: [
      { key: 'highestEducation', label: '最高学历', type: 'select', options: ['', ...DEGREE_OPTS] },
      { key: 'degreeName', label: '学位', type: 'select', options: ['', '博士', '硕士', '学士', 'MBA'] },
      { key: 'graduateSchool', label: '毕业院校' },
      { key: 'studyMode', label: '学习形式', type: 'select', options: ['全日制', '非全日制'] },
      { key: 'graduateDate', label: '毕业时间', ph: 'YYYY-MM' },
      { key: 'englishLevel', label: '英语等级', ph: '如：六级526分' },
      { key: 'gaokaoDate', label: '高考时间' },
      { key: 'gaokaoScore', label: '高考分数' },
      { key: 'gaokaoSubjects', label: '高考科目' },
      { key: 'isFreshGraduate', label: '是否应届生', type: 'select', options: ['', ...YES_NO] },
      { key: 'isRecommended', label: '是否保研', type: 'select', options: ['', ...YES_NO] },
      { key: 'hasOverseasExperience', label: '是否有留学经历', type: 'select', options: ['', ...YES_NO] }
    ]
  },
  {
    title: '工作概况',
    fields: [
      { key: 'workStatus', label: '工作状态', ph: '如：在职 / 离职 / 应届' },
      { key: 'lastCompany', label: '上一家公司' },
      { key: 'yearsOfExp', label: '工作年限', ph: '如：3年 / 3-5年 / 应届' },
      { key: 'professionalTitle', label: '专业技术职级' }
    ]
  },
  {
    title: '紧急联系人',
    fields: [
      { key: 'emergencyName', label: '紧急联系人姓名' },
      { key: 'emergencyRelation', label: '与本人关系' },
      { key: 'emergencyPhone', label: '紧急联系电话' }
    ]
  },
  {
    title: '健康与形象',
    fields: [
      { key: 'healthStatus', label: '健康状况' },
      { key: 'bloodType', label: '血型' },
      { key: 'height', label: '身高(cm)' },
      { key: 'weight', label: '体重(kg)' }
    ]
  },
  {
    title: '自我评价',
    fields: [
      { key: 'selfIntro', label: '自我介绍', type: 'textarea', full: true },
      { key: 'personalStrengths', label: '个人优势', type: 'textarea', full: true },
      { key: 'hobbies', label: '兴趣爱好', full: true }
    ]
  }
]

const INTENTION_FIELDS: FieldDef[] = [
  { key: 'targetPosition', label: '目标岗位' },
  { key: 'joinDate', label: '预计入职时间', ph: '如：随时 / 1个月内' },
  { key: 'expectCity', label: '期望城市', ph: '省 / 市' },
  { key: 'interviewCity', label: '面试城市', ph: '省 / 市' },
  { key: 'expectSalary', label: '期望月薪', ph: '如：20-30k' },
  { key: 'expectAnnualSalary', label: '期望年薪', ph: '仅数字' },
  { key: 'currentSalary', label: '当前月薪', ph: '如：15k' },
  { key: 'acceptRelocation', label: '是否接受调剂', type: 'select', options: ['', ...YES_NO] },
  { key: 'jobNotes', label: '求职备注', full: true }
]

const SKILLS_FIELDS: FieldDef[] = [
  { key: 'technical', label: '技术技能', full: true, ph: '如：Python、TypeScript、PyTorch' },
  { key: 'languages', label: '语言能力', full: true },
  { key: 'software', label: '软件技能', full: true },
  { key: 'certificates', label: '证书认证', full: true },
  { key: 'soft', label: '软技能', full: true }
]

interface ListSectionDef {
  key: 'education' | 'work' | 'intern' | 'project' | 'cadre' | 'language' | 'certificate' | 'award' | 'patent' | 'paper' | 'family'
  title: string
  empty: () => Record<string, string> & { id: string }
  titleOf: (item: Record<string, string>) => string
  fields: FieldDef[]
}

const asItem = (item: object): Record<string, string> & { id: string } =>
  item as Record<string, string> & { id: string }

const EDU_FIELDS: FieldDef[] = [
  { key: 'school', label: '学校' },
  { key: 'department', label: '院系' },
  { key: 'major', label: '专业' },
  { key: 'studentId', label: '学号' },
  { key: 'schoolCity', label: '学校城市', ph: '省 / 市' },
  { key: 'education', label: '学历', type: 'select', options: ['大专', '本科', '硕士', '博士'] },
  { key: 'degreeName', label: '学位', type: 'select', options: ['', '博士', '硕士', '学士'] },
  { key: 'eduStatus', label: '学历状态', type: 'select', options: ['在读', '毕业', '结业', '肄业'] },
  { key: 'startDate', label: '入学时间', ph: 'YYYY-MM' },
  { key: 'endDate', label: '毕业时间', ph: 'YYYY-MM' },
  { key: 'durationYears', label: '学制(年)', ph: '如：4' },
  { key: 'gpa', label: '成绩绩点' },
  { key: 'schoolType', label: '学校类型', type: 'select', options: ['', '985高校', '211高校', '普通本科', '独立学院', '专科院校', '海外院校'] },
  { key: 'eduMode', label: '教育方式', type: 'select', options: ['全日制', '非全日制', '函授', '网络教育'] },
  { key: 'enrollmentType', label: '招生类别', type: 'select', options: ['统招', '单招', '专升本', '定向', '非定向'] },
  { key: 'failedCourses', label: '挂科数' },
  { key: 'classRank', label: '班级排名' },
  { key: 'majorRank', label: '专业排名' },
  { key: 'eduCertNo', label: '学历证书编号' },
  { key: 'degreeCertNo', label: '学位证书编号' },
  { key: 'counselorName', label: '辅导员姓名' },
  { key: 'counselorContact', label: '辅导员联系方式' },
  { key: 'isOverseas', label: '是否海外学校', type: 'select', options: YES_NO },
  { key: 'courses', label: '专业课程', full: true },
  { key: 'researchDirection', label: '研究方向', full: true },
  { key: 'thesis', label: '毕业论文', full: true },
  { key: 'eduDescription', label: '教育描述', type: 'textarea', full: true },
  { key: 'majorDescription', label: '专业描述', type: 'textarea', full: true }
]

const REFREE_FIELDS: FieldDef[] = [
  { key: 'refereeName', label: '证明人姓名' },
  { key: 'refereeContact', label: '证明人联系方式' },
  { key: 'refereeTitle', label: '证明人职位' }
]

const LIST_SECTIONS: ListSectionDef[] = [
  {
    key: 'education',
    title: '教育经历',
    empty: () => asItem(emptyEducation()),
    titleOf: i => i.school || '教育经历',
    fields: EDU_FIELDS
  },
  {
    key: 'work',
    title: '工作经历',
    empty: () => asItem(emptyWork()),
    titleOf: i => i.company || '工作经历',
    fields: [
      { key: 'company', label: '公司' },
      { key: 'department', label: '部门' },
      { key: 'title', label: '职位' },
      { key: 'startDate', label: '入职时间', ph: 'YYYY-MM' },
      { key: 'endDate', label: '离职时间', ph: 'YYYY-MM，在职可留空' },
      { key: 'city', label: '工作城市' },
      { key: 'industry', label: '工作行业' },
      { key: 'employmentType', label: '用工性质', type: 'select', options: ['', '正式', '合同制', '派遣', '外包', '兼职'] },
      { key: 'monthlySalary', label: '月薪' },
      { key: 'annualSalary', label: '年薪' },
      ...REFREE_FIELDS,
      { key: 'description', label: '工作内容', type: 'textarea', full: true },
      { key: 'leaveReason', label: '离职原因', full: true }
    ]
  },
  {
    key: 'intern',
    title: '实习经历',
    empty: () => asItem(emptyIntern()),
    titleOf: i => i.company || '实习经历',
    fields: [
      { key: 'company', label: '实习公司' },
      { key: 'department', label: '部门' },
      { key: 'title', label: '实习职位' },
      { key: 'startDate', label: '开始时间', ph: 'YYYY-MM' },
      { key: 'endDate', label: '结束时间', ph: 'YYYY-MM' },
      { key: 'city', label: '实习城市' },
      { key: 'industry', label: '所属行业' },
      { key: 'employmentType', label: '用工性质', type: 'select', options: ['', '实习', '兼职', '外包'] },
      ...REFREE_FIELDS,
      { key: 'description', label: '实习内容', type: 'textarea', full: true }
    ]
  },
  {
    key: 'project',
    title: '项目经历',
    empty: () => asItem(emptyProject()),
    titleOf: i => i.name || '项目经历',
    fields: [
      { key: 'name', label: '项目名称' },
      { key: 'role', label: '项目职务' },
      { key: 'practiceType', label: '实践方式', ph: '如：企业项目、科研实践' },
      { key: 'startDate', label: '开始时间', ph: 'YYYY-MM' },
      { key: 'endDate', label: '结束时间', ph: 'YYYY-MM' },
      { key: 'city', label: '项目地区' },
      { key: 'link', label: '项目链接' },
      ...REFREE_FIELDS,
      { key: 'description', label: '项目描述', type: 'textarea', full: true },
      { key: 'duty', label: '项目职责', type: 'textarea', full: true },
      { key: 'achievement', label: '项目成果', type: 'textarea', full: true }
    ]
  },
  {
    key: 'cadre',
    title: '干部任职经历',
    empty: () => asItem(emptyCadre()),
    titleOf: i => i.organization || '干部任职',
    fields: [
      { key: 'organization', label: '组织名称' },
      { key: 'title', label: '担任职务' },
      { key: 'startDate', label: '开始时间', ph: 'YYYY-MM' },
      { key: 'endDate', label: '结束时间', ph: 'YYYY-MM' },
      { key: 'description', label: '工作内容', type: 'textarea', full: true },
      { key: 'duty', label: '本人职责', type: 'textarea', full: true }
    ]
  },
  {
    key: 'language',
    title: '外语能力',
    empty: () => asItem(emptyLanguage()),
    titleOf: i => i.language || '外语',
    fields: [
      { key: 'language', label: '语言种类' },
      { key: 'certName', label: '证书名称', ph: '如：CET-6 / 雅思' },
      { key: 'obtainedDate', label: '获得时间', ph: 'YYYY-MM-DD' },
      { key: 'score', label: '成绩' },
      { key: 'proficiency', label: '掌握程度', ph: '如：精通 / 良好' },
      { key: 'listeningSpeaking', label: '听说能力' },
      { key: 'readingWriting', label: '读写能力' }
    ]
  },
  {
    key: 'certificate',
    title: '证书',
    empty: () => asItem(emptyCertificate()),
    titleOf: i => i.name || '证书',
    fields: [
      { key: 'name', label: '证书名称' },
      { key: 'type', label: '证书类型', ph: '如：执业资格 / 职业资格' },
      { key: 'obtainedDate', label: '获取时间', ph: 'YYYY-MM-DD' }
    ]
  },
  {
    key: 'award',
    title: '获奖经历',
    empty: () => asItem(emptyAward()),
    titleOf: i => i.name || '奖项',
    fields: [
      { key: 'name', label: '奖项名称' },
      { key: 'issuer', label: '颁发机构' },
      { key: 'date', label: '获奖时间', ph: 'YYYY-MM-DD' },
      { key: 'endDate', label: '结束时间', ph: '可留空' },
      { key: 'level', label: '奖项级别', type: 'select', options: ['', '国家级', '省级', '市级', '区县级', '校级', '院系级'] },
      { key: 'awardType', label: '奖励类型', type: 'select', options: ['', '个人', '团体'] },
      { key: 'grade', label: '奖励等级', type: 'select', options: ['', '特等奖', '一等奖', '二等奖', '三等奖', '优秀奖'] },
      { key: 'description', label: '获奖描述', full: true }
    ]
  },
  {
    key: 'patent',
    title: '专利信息',
    empty: () => asItem(emptyPatent()),
    titleOf: i => i.name || '专利',
    fields: [
      { key: 'name', label: '专利名称' },
      { key: 'patentNo', label: '专利号' },
      { key: 'applyDate', label: '申请日期', ph: 'YYYY-MM-DD' },
      { key: 'status', label: '专利状态', type: 'select', options: ['', '已授权', '申请中', '已公开', '已驳回'] },
      { key: 'inventor', label: '发明人' },
      { key: 'description', label: '专利描述', type: 'textarea', full: true }
    ]
  },
  {
    key: 'paper',
    title: '论文发表',
    empty: () => asItem(emptyPaper()),
    titleOf: i => i.title || '论文',
    fields: [
      { key: 'title', label: '论文标题', full: true },
      { key: 'journal', label: '发表期刊/会议' },
      { key: 'authors', label: '作者' },
      { key: 'publishDate', label: '发表时间', ph: 'YYYY-MM-DD' },
      { key: 'doi', label: 'DOI号' },
      { key: 'abstract', label: '论文摘要', type: 'textarea', full: true }
    ]
  },
  {
    key: 'family',
    title: '家庭情况',
    empty: () => asItem(emptyFamily()),
    titleOf: i => i.name || '家庭成员',
    fields: [
      { key: 'name', label: '姓名' },
      { key: 'relation', label: '关系' },
      { key: 'gender', label: '性别', type: 'select', options: GENDER_OPTS },
      { key: 'education', label: '教育程度', type: 'select', options: ['', ...FAMILY_EDU_OPTS] },
      { key: 'birthDate', label: '出生日期', ph: 'YYYY-MM-DD' },
      { key: 'phone', label: '联系电话' },
      { key: 'company', label: '工作单位' },
      { key: 'title', label: '职位' },
      { key: 'politicalStatus', label: '政治面貌' },
      { key: 'address', label: '联系地址', full: true }
    ]
  }
]

// ---------- 主组件 ----------

type FlatArea = 'personal' | 'intention' | 'skills'

/** 待确认的润色结果：items 为产生了改动的条目。 */
interface PolishPlan {
  items: PolishItem[]
  results: Record<string, string>
  checked: Record<string, boolean>
}

export function App() {
  const [store, setStore] = useState<Store | null>(null)
  const [savedTick, setSavedTick] = useState(0)
  const [toast, setToast] = useState('')
  const [importing, setImporting] = useState(false)
  const [enBusy, setEnBusy] = useState(false)
  const [polishBusy, setPolishBusy] = useState(false)
  const [polishPlan, setPolishPlan] = useState<PolishPlan | null>(null)
  const [llm, setLlm] = useState<LlmConfig>({ baseUrl: 'https://api.deepseek.com/v1', apiKey: '', model: 'deepseek-chat' })
  const fileInput = useRef<HTMLInputElement>(null)
  const loaded = useRef(false)

  useEffect(() => {
    loadStore().then(s => {
      setStore(s)
      loaded.current = true
    })
    loadLlmConfig().then(cfg => {
      if (cfg) setLlm(cfg)
    })
  }, [])

  useEffect(() => {
    if (!loaded.current || !store) return
    saveStore(store).then(() => setSavedTick(t => t + 1))
  }, [store])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 8000)
    return () => clearTimeout(timer)
  }, [toast])

  async function onImportFile(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setImporting(true)
    setToast(`正在解析「${file.name}」…`)
    try {
      const { profile, filledCount } = await importResumeFile(file)
      setStore(prev =>
        prev ? { profiles: [...prev.profiles, profile], activeId: profile.id } : prev
      )
      setToast(`已导入「${file.name}」：自动识别 ${filledCount} 项信息，已创建为新档案，请检查补全。`)
    } catch (err) {
      setToast(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setImporting(false)
    }
  }

  async function onGenerateEn() {
    if (enBusy) return
    setEnBusy(true)
    setToast('正在精选内容并生成英文简历…')
    try {
      const draft = buildEnglishDraft(active)
      let translated = 0
      const cfg = await loadLlmConfig()
      if (cfg && draft.pending.length > 0) {
        setToast(`正在翻译 ${draft.pending.length} 项内容（${cfg.model}）…`)
        try {
          const tr = await llmTranslateBatch(draft.pending, cfg)
          applyTranslations(draft, tr)
          translated = Object.keys(tr).length
        } catch (e) {
          setToast(`翻译 API 调用失败（${e instanceof Error ? e.message : e}），未翻译项保留中文。`)
          await new Promise(r => setTimeout(r, 3500))
        }
      }
      const { profile } = draft
      setStore(prev => (prev ? { profiles: [...prev.profiles, profile], activeId: profile.id } : prev))
      const kept = draft.stats.sectionsKept
      const droppedNote = draft.stats.dropped.length ? `，已按英文简历惯例省略：${draft.stats.dropped.join('、')}` : ''
      if (cfg) {
        setToast(`已生成英文简历「${profile.label}」：精选 ${kept} 个区块、${draft.stats.bullets} 条要点，翻译 ${translated} 项${droppedNote}。请检查后可导出 PDF。`)
      } else {
        setToast(`已生成英文简历「${profile.label}」：精选 ${kept} 个区块、${draft.stats.bullets} 条要点${droppedNote}。机构名与经历描述暂保留中文——在下方「翻译 API 设置」配置后重新生成可自动翻译，或手动编辑。`)
      }
    } finally {
      setEnBusy(false)
    }
  }

  async function onPolish() {
    if (polishBusy) return
    const cfg = await loadLlmConfig()
    if (!cfg) {
      setToast('请先在下方「LLM API 设置」里填好 API 地址与 Key，再润色内容。')
      return
    }
    const items = buildPolishItems(active)
    if (items.length === 0) {
      setToast('当前档案没有可润色的内容（经历描述、自我评价等太短或为空）。')
      return
    }
    setPolishBusy(true)
    setPolishPlan(null)
    setToast(`正在润色 ${items.length} 处内容（${cfg.model}）…`)
    try {
      const results = await llmPolish(
        items.map(i => ({ path: i.path, label: i.label, text: i.before })),
        cfg,
        { targetPosition: active.intention.targetPosition, label: active.label }
      )
      const changed = items.filter(i => results[i.path] && results[i.path] !== i.before)
      if (changed.length === 0) {
        setToast('润色完成，但没有产生改动。')
        return
      }
      setPolishPlan({
        items: changed,
        results,
        checked: Object.fromEntries(changed.map(i => [i.path, true]))
      })
      const capped = items.length >= MAX_POLISH_ITEMS ? `（一次最多处理 ${MAX_POLISH_ITEMS} 处，可应用后再润色剩余部分）` : ''
      setToast(`润色完成：${changed.length} 处改动待确认${capped}`)
    } catch (e) {
      setToast(`润色失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setPolishBusy(false)
    }
  }

  function onApplyPolish() {
    if (!polishPlan) return
    const applied: Record<string, string> = {}
    for (const item of polishPlan.items) {
      if (polishPlan.checked[item.path]) applied[item.path] = polishPlan.results[item.path]
    }
    const count = Object.keys(applied).length
    if (count === 0) {
      setToast('没有勾选任何修改，已放弃本次润色。')
      setPolishPlan(null)
      return
    }
    const next = applyPolish(active, applied)
    setStore({ ...st, profiles: st.profiles.map(p => (p.id === next.id ? next : p)) })
    setPolishPlan(null)
    setToast(`已应用 ${count} 处润色，可继续编辑或导出。`)
  }

  async function onSaveLlm() {
    const origin = originPatternOf(llm.baseUrl)
    if (origin) {
      const has = await chrome.permissions.contains({ origins: [origin] })
      if (!has) {
        // 扩展页面绕开 CORS 的前提是域名在权限内；这里借点击手势按需申请。
        const granted = await chrome.permissions.request({ origins: [origin] })
        if (!granted) {
          await saveLlmConfig(llm)
          setToast('设置已保存，但未授权访问该 API 域名，请求会被浏览器拦截。可再次点「保存设置」重新授权。')
          return
        }
      }
      await saveLlmConfig(llm)
      setToast('LLM 设置已保存，并已授权访问该 API 域名。仅在点击相关按钮或开启填充兜底时联网。')
      return
    }
    await saveLlmConfig(llm)
    setToast('设置已保存，但 API 地址无法解析（需形如 https://api.deepseek.com/v1），调用会失败。')
  }

  if (!store) return <div class="page loading">加载中…</div>
  const st: Store = store
  const active = st.profiles.find(p => p.id === st.activeId) ?? st.profiles[0]

  function mutate(fn: (p: Profile) => void) {
    const clone = structuredClone(active)
    fn(clone)
    setStore({ ...st, profiles: st.profiles.map(p => (p.id === clone.id ? clone : p)) })
  }

  function setFlat(area: FlatArea, key: string, value: string) {
    mutate(p => {
      ;(p[area] as unknown as Record<string, string>)[key] = value
    })
  }

  function setListItem(sectionKey: ListSectionDef['key'], index: number, key: string, value: string) {
    mutate(p => {
      const list = p[sectionKey] as unknown as Record<string, string>[]
      list[index][key] = value
    })
  }

  function addListItem(sectionKey: ListSectionDef['key']) {
    mutate(p => {
      const def = LIST_SECTIONS.find(s => s.key === sectionKey)!
      ;(p[sectionKey] as unknown as Record<string, string>[]).push(def.empty())
    })
  }

  function removeListItem(sectionKey: ListSectionDef['key'], index: number) {
    mutate(p => {
      ;(p[sectionKey] as unknown as Record<string, string>[]).splice(index, 1)
    })
  }

  function addProfile() {
    const p = emptyProfile(`档案 ${st.profiles.length + 1}`)
    setStore({ profiles: [...st.profiles, p], activeId: p.id })
  }

  function duplicateProfile() {
    const copy = structuredClone(active)
    copy.id = crypto.randomUUID()
    copy.label = `${active.label} 副本`
    setStore({ profiles: [...st.profiles, copy], activeId: copy.id })
  }

  function deleteProfile(id: string) {
    if (st.profiles.length <= 1) return
    const profiles = st.profiles.filter(p => p.id !== id)
    const activeId = st.activeId === id ? profiles[0].id : st.activeId
    setStore({ profiles, activeId })
  }

  return (
    <div class="page">
      <aside>
        <div class="side-head">
          <h1>简历档案</h1>
          <button class="ghost" onClick={addProfile}>
            ＋ 新建
          </button>
        </div>
        <ul class="profile-list">
          {st.profiles.map(p => (
            <li key={p.id} class={p.id === st.activeId ? 'active' : ''}>
              <button class="profile-btn" onClick={() => setStore({ ...st, activeId: p.id })}>
                {p.label}
              </button>
              {st.profiles.length > 1 && (
                <button class="del" title="删除档案" onClick={() => deleteProfile(p.id)}>
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
        <div class="side-foot">
          <input ref={fileInput} type="file" accept=".pdf,application/pdf" style="display:none" onChange={onImportFile} />
          <button class="primary-btn import-btn" disabled={importing} onClick={() => fileInput.current?.click()}>
            {importing ? '解析中…' : '⬆ 导入 PDF 简历'}
          </button>
          <button class="ghost import-btn" disabled={enBusy} onClick={onGenerateEn} title="按英文简历惯例精选内容，生成一份简洁的英文档案">
            {enBusy ? '生成中…' : '🌐 生成英文简历'}
          </button>
          <button
            class="ghost import-btn"
            disabled={polishBusy}
            onClick={onPolish}
            title="用 LLM 润色经历描述、自我评价等自由文本，改前逐条预览确认"
          >
            {polishBusy ? '润色中…' : '✨ 润色简历内容'}
          </button>
          <button class="ghost" onClick={duplicateProfile}>
            复制当前档案
          </button>
          <span class="saved">{savedTick > 1 ? '✓ 已自动保存' : ''}</span>
        </div>
      </aside>

      <main>
        {toast && <div class="toast">{toast}</div>}

        {polishPlan && (
          <div class="card">
            <div class="card-title">润色预览（取消勾选不需要的修改，应用后仍可手动编辑）</div>
            {polishPlan.items.map(item => (
              <label class="polish-row" key={item.path}>
                <input
                  type="checkbox"
                  checked={polishPlan.checked[item.path] === true}
                  onChange={e =>
                    setPolishPlan({
                      ...polishPlan,
                      checked: { ...polishPlan.checked, [item.path]: (e.target as HTMLInputElement).checked }
                    })
                  }
                />
                <div class="polish-body">
                  <div class="polish-label">{item.label}</div>
                  <div class="polish-before">{item.before}</div>
                  <div class="polish-after">{polishPlan.results[item.path]}</div>
                </div>
              </label>
            ))}
            <div class="row-flex">
              <button class="primary-btn" onClick={onApplyPolish}>应用选中</button>
              <button class="ghost" onClick={() => setPolishPlan(null)}>放弃</button>
            </div>
          </div>
        )}

        <details class="card llm-settings">
          <summary>🤖 LLM API 设置（可选：英文翻译 / 填充兜底 / 内容润色）</summary>
          <div class="grid">
            <label class="field">
              <span>API 地址（OpenAI 兼容）</span>
              <input class="text" value={llm.baseUrl} onInput={e => setLlm({ ...llm, baseUrl: (e.target as HTMLInputElement).value })} />
            </label>
            <label class="field">
              <span>模型</span>
              <input class="text" value={llm.model} onInput={e => setLlm({ ...llm, model: (e.target as HTMLInputElement).value })} />
            </label>
            <label class="field full">
              <span>API Key</span>
              <input class="text" type="password" value={llm.apiKey} onInput={e => setLlm({ ...llm, apiKey: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
          <label class="checkbox-field">
            <input
              type="checkbox"
              checked={llm.fallbackFill === true}
              onChange={e => setLlm({ ...llm, fallbackFill: (e.target as HTMLInputElement).checked })}
            />
            <span>一键填充时，把规则引擎认不出的字段交给 LLM 识别（默认关闭）</span>
          </label>
          <p class="privacy">
            默认 DeepSeek，也可填智谱 / Moonshot / OpenAI 等兼容接口。Key 只存在本地，保存时会申请访问该 API 域名的权限。
            联网仅发生在：点「生成英文简历」/「润色简历内容」，或开启上面的填充兜底后点「一键填充」——填充兜底只上传表单字段描述（label、选项等），
            不上传简历内容，取值仍在本地完成。其余功能零网络。
          </p>
          <button class="ghost" onClick={onSaveLlm}>保存设置</button>
        </details>
        <div class="card">
          <div class="card-title">档案名</div>
          <div class="row-flex">
            <input
              class="text"
              value={active.label}
              onInput={e => mutate(p => (p.label = (e.target as HTMLInputElement).value))}
            />
            <button class="primary-btn" onClick={() => printProfile(active)} title="调起浏览器打印，选择「另存为 PDF」即可导出">
              导出 PDF
            </button>
          </div>
        </div>

        <section class="card">
          <h2>个人信息</h2>
          {PERSONAL_GROUPS.map(g => (
            <div class="group">
              <div class="group-title">{g.title}</div>
              <div class="grid">
                {g.fields.map(f => (
                  <FieldInput
                    key={f.key}
                    def={f}
                    value={(active.personal as unknown as Record<string, string>)[f.key] ?? ''}
                    onChange={v => setFlat('personal', f.key, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        <section class="card">
          <h2>求职意向</h2>
          <div class="grid">
            {INTENTION_FIELDS.map(f => (
              <FieldInput
                key={f.key}
                def={f}
                value={(active.intention as unknown as Record<string, string>)[f.key] ?? ''}
                onChange={v => setFlat('intention', f.key, v)}
              />
            ))}
          </div>
        </section>

        <section class="card">
          <h2>技能专长</h2>
          <div class="grid">
            {SKILLS_FIELDS.map(f => (
              <FieldInput
                key={f.key}
                def={f}
                value={(active.skills as unknown as Record<string, string>)[f.key] ?? ''}
                onChange={v => setFlat('skills', f.key, v)}
              />
            ))}
          </div>
        </section>

        {LIST_SECTIONS.map(sec => {
          const items = active[sec.key] as unknown as Record<string, string>[]
          return (
            <section class="card">
              <div class="sec-head">
                <h2>{sec.title}</h2>
                <button class="ghost" onClick={() => addListItem(sec.key)}>
                  ＋ 添加
                </button>
              </div>
              {items.length === 0 && <p class="empty">还没有{sec.title}，点「＋ 添加」新建一段。</p>}
              {items.map((item, i) => (
                <div class="item-row">
                  <div class="item-title">{sec.titleOf(item)}</div>
                  <div class="grid">
                    {sec.fields.map(f => (
                      <FieldInput
                        key={f.key}
                        def={f}
                        value={item[f.key] ?? ''}
                        onChange={v => setListItem(sec.key, i, f.key, v)}
                      />
                    ))}
                  </div>
                  <button class="del-row" onClick={() => removeListItem(sec.key, i)}>
                    删除这段
                  </button>
                </div>
              ))}
            </section>
          )
        })}

        <p class="privacy">🔒 简历数据只保存在这台电脑的浏览器里，插件不会发送任何网络请求。</p>
      </main>
    </div>
  )
}

// ---------- 通用字段控件 ----------

function FieldInput({ def, value, onChange }: { def: FieldDef; value: string; onChange: (v: string) => void }) {
  const cls = def.full ? 'field full' : 'field'
  if (def.type === 'select') {
    return (
      <label class={cls}>
        <span>{def.label}</span>
        <select value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)}>
          {def.options!.map(o => (
            <option key={o} value={o}>
              {o === '' ? '（未设置）' : o}
            </option>
          ))}
        </select>
      </label>
    )
  }
  if (def.type === 'textarea') {
    return (
      <label class={cls}>
        <span>{def.label}</span>
        <textarea rows={3} value={value} onInput={e => onChange((e.target as HTMLTextAreaElement).value)} />
      </label>
    )
  }
  return (
    <label class={cls}>
      <span>{def.label}</span>
      <input class="text" type="text" value={value} placeholder={def.ph} onInput={e => onChange((e.target as HTMLInputElement).value)} />
    </label>
  )
}
