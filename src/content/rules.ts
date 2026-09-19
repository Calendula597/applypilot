/**
 * 识别引擎知识库：字段关键词词典 + 区块标题词典 + 同义词映射。
 * 词典按区块分组——同一个词（如「学历」「职位」「姓名」）在不同区块含义不同。
 * 字段 key 与 shared/types.ts 中 Profile 的属性名一一对应，
 * 这样 filler 可以直接用 key 从档案取值。
 */

/** 归一化：去空白、冒号、必填星号、常见括号后缀，转小写。 */
export function normalizeText(s: string): string {
  return s
    .replace(/[\s\u00a0*·:：、,，。?？!！()（）【】\[\]]/g, '')
    .replace(/（必填）|必填/g, '')
    .toLowerCase()
}

export interface KeywordEntry {
  cn: string[]
  en: string[]
}

const k = (cn: string[], en: string[] = []): KeywordEntry => ({ cn, en })

/** 基本区（无区块归属）字段：个人信息 + 求职意向 + 技能专长。key 与 Profile.personal/intention/skills 属性一致。 */
export const BASIC_KEYWORDS: Record<string, KeywordEntry> = {
  // 联系与身份
  fullName: k(['姓名', '名字', '您的姓名', '真实姓名', '称呼'], ['name', 'fullname', 'realname']),
  gender: k(['性别'], ['gender', 'sex']),
  email: k(['邮箱', '电子邮箱', '电子邮件', '邮件地址'], ['email', 'mail']),
  phone: k(['手机', '手机号', '手机号码', '电话', '联系电话', '联系方式', '电话号码'], ['phone', 'mobile', 'tel', 'telephone']),
  wechat: k(['微信号', '微信', '微信号码'], ['wechat', 'weixin']),
  qq: k(['QQ号', 'QQ号码', 'QQ'], ['qq']),
  birthDate: k(['出生日期', '出生年月', '生日', '出生'], ['birth', 'birthday', 'birthdate']),
  age: k(['年龄', '周岁'], ['age']),
  citizenship: k(['国籍'], ['nationality', 'citizenship']),
  ethnicity: k(['民族', '族别'], ['ethnicity', 'ethnic']),
  maritalStatus: k(['婚姻状况', '婚姻'], ['marital', 'marriage']),
  politicalStatus: k(['政治面貌', '党员面貌'], ['political']),
  partyJoinDate: k(['入党时间', '入党日期'], ['partyjoindate']),
  idType: k(['证件类型', '证件名称', '证件种类'], ['idtype', 'certificatetype']),
  idNumber: k(['身份证号', '身份证号码', '证件号码', '身份证件号码', '证件号'], ['idnumber', 'idcard', 'idno']),
  address: k(['地址', '居住所在地', '现居住地', '现居地址', '所在城市', '现居城市', '居住地', '现居', '通信地址'], ['address', 'city', 'location', 'residence']),
  nativePlace: k(['籍贯'], ['nativeplace', 'hometown']),
  originPlace: k(['生源地'], ['originplace']),
  hukouType: k(['户口性质'], ['hukoutype']),
  hukouLocation: k(['户口所在地', '户籍所在地', '户籍地址', '户口所在地'], ['hukou', 'hukoulocation']),
  archiveLocation: k(['档案所在地', '档案所在地'], ['archivelocation', 'dang an']),
  postalCode: k(['邮政编码', '邮编'], ['postal', 'zipcode', 'postcode']),
  // 学业概况
  degreeName: k(['学位'], ['degree']),
  highestEducation: k(['最高学历', '学历', '文化程度'], ['degree', 'education']),
  graduateSchool: k(['毕业院校', '毕业学校'], ['graduateschool']),
  studyMode: k(['学习形式', '就读方式'], ['studymode']),
  graduateDate: k(['毕业时间', '毕业日期'], ['graduatedate']),
  englishLevel: k(['英语等级', '英语水平', '英语级别', '外语水平'], ['englishlevel']),
  gaokaoDate: k(['高考时间', '高考日期', '高考参加时间']),
  gaokaoScore: k(['高考分数', '高考成绩', '高考得分']),
  gaokaoSubjects: k(['高考科目', '高考选科', '选科组合']),
  isFreshGraduate: k(['是否应届生', '是否应届毕业生', '应届生'], ['freshgraduate']),
  isRecommended: k(['是否保研', '保研'], ['recommended']),
  hasOverseasExperience: k(['是否有留学经历', '留学经历', '海外经历'], ['overseas']),
  // 工作概况
  yearsOfExp: k(['工作年限', '工作年限要求', '工作经验', '从业年限', '工作年数'], ['experience', 'workyear']),
  professionalTitle: k(['专业技术职级', '专业技术资格', '职称资格', '技术职级']),
  workStatus: k(['工作状态', '在职状态', '目前状态'], ['workstatus']),
  lastCompany: k(['上一家公司', '最近工作单位', '上一份工作', '上家公司']),
  emergencyName: k(['紧急联系人姓名', '紧急联系人', '紧急联系人之姓名'], ['emergencyname', 'emergencycontact']),
  emergencyRelation: k(['紧急联系人关系', '与紧急联系人关系', '紧急联系人称谓']),
  emergencyPhone: k(['紧急联系电话', '紧急联系人电话', '紧急联系人手机', '紧急联系方式']),
  // 健康与个人信息
  healthStatus: k(['健康状况', '健康情况', '健康'], ['health']),
  bloodType: k(['血型'], ['bloodtype', 'blood']),
  namePinyin: k(['姓名拼音', '拼音'], ['pinyin']),
  englishName: k(['英文姓名', '英文名', '英文称呼'], ['englishname']),
  height: k(['身高'], ['height']),
  weight: k(['体重'], ['weight']),
  selfIntro: k(['自我介绍', '自我评价', '个人简介', '个人评价', '自我描述', '简介'], ['selfintroduction', 'introduction', 'summary']),
  personalStrengths: k(['个人优势', '个人特长', '自身优势', '优势特长']),
  hobbies: k(['兴趣爱好', '爱好', '兴趣'], ['hobby', 'hobbies']),
  // 求职意向
  targetPosition: k(['目标岗位', '期望职位', '期望岗位', '意向岗位', '应聘职位', '应聘岗位', '求职意向', '意向职位', '期望工作', '应聘岗位名称'], ['expectposition', 'intendedposition', 'applyposition']),
  joinDate: k(['预计入职时间', '预计到岗时间', '到岗时间', '可入职时间', '最快到岗', '入职时间要求']),
  expectCity: k(['期望城市', '意向城市', '期望工作城市', '期望工作地点', '意向地点'], ['expectcity']),
  interviewCity: k(['面试城市', '可参与面试城市', '可面试城市']),
  expectSalary: k(['期望薪资', '期望月薪', '期望薪水', '薪资要求', '期望薪酬'], ['salary', 'expectsalary']),
  expectAnnualSalary: k(['期望年薪', '年薪期望'], ['annualsalary']),
  currentSalary: k(['当前薪资', '现薪资', '当前月薪', '目前月薪', '现月薪']),
  acceptRelocation: k(['是否接受调剂', '接受调剂', '是否服从调剂', '服从调剂']),
  jobNotes: k(['求职备注', '备注', '补充说明', '其他说明'], ['notes', 'remark']),
  // 技能专长
  technical: k(['技术技能', '专业技能', '技术特长', '专业技能特长'], ['technicalskills', 'skills']),
  languages: k(['语言能力', '语言技能'], ['languageskill', 'languageability']),
  software: k(['软件技能', '办公软件', '软件使用技能']),
  certificates: k(['证书认证', '资格证书情况', '持证情况']),
  soft: k(['软技能', '沟通能力', '综合素质'])
}

export type SectionKind =
  | 'education'
  | 'work'
  | 'intern'
  | 'project'
  | 'cadre'
  | 'language'
  | 'certificate'
  | 'award'
  | 'patent'
  | 'paper'
  | 'family'

/** 区块标题词典（顺序即匹配优先级）。 */
export const SECTION_KEYWORDS: Record<SectionKind, string[]> = {
  education: ['教育经历', '教育背景', '教育信息', '教育情况', '学习经历', '教育'],
  work: ['工作经历', '工作经验', '职业经历', '工作历史', '工作'],
  intern: ['实习经历', '实习经验', '实习'],
  project: ['项目经历', '项目经验', '项目背景', '项目'],
  cadre: ['干部任职', '干部经历', '学生干部', '学生工作', '任职经历', '干部'],
  language: ['外语能力', '语言能力', '外语水平', '外语'],
  certificate: ['资质证书', '资格证书', '执业资格', '证书'],
  award: ['获奖经历', '所获荣誉', '荣誉奖项', '获奖', '奖项', '荣誉', '奖励'],
  patent: ['专利信息', '发明专利', '专利'],
  paper: ['论文发表', '发表论文', '学术论文', '学术成果', '发表文章', '论文'],
  family: ['家庭情况', '家庭成员', '家庭关系', '家庭信息', '家属', '家庭']
}

/** 各区块内字段词典。key 与 Profile 中对应 item 的属性名一致。 */
export const SECTION_FIELD_KEYWORDS: Record<SectionKind, Record<string, KeywordEntry>> = {
  education: {
    school: k(['学校', '学校名称', '院校', '毕业院校'], ['school', 'university', 'college']),
    studentId: k(['学号', '在校学号'], ['studentid', 'studentno']),
    department: k(['院系', '学院', '院系名称'], ['department', 'college']),
    major: k(['专业', '专业名称', '所学专业'], ['major', 'field']),
    schoolCity: k(['学校城市', '学校所在城市', '学校所在地'], ['schoolcity']),
    education: k(['学历', '学历级别'], ['degree', 'education']),
    eduStatus: k(['学历状态', '就读状态'], ['edustatus']),
    durationYears: k(['学制', '在校年数', '学制年', '学制']),
    startDate: k(['入学时间', '入学年份', '入学日期', '开始时间', '起始时间', '开始日期', '就读时间'], ['startdate']),
    endDate: k(['毕业时间', '毕业年份', '毕业日期', '结束时间', '结束日期', '离校时间'], ['enddate', 'graduation']),
    degreeName: k(['学位', '学位类型'], ['degree']),
    gpa: k(['成绩绩点', '绩点', 'GPA', '平均绩点'], ['gpa']),
    schoolType: k(['学校类型', '院校类型', '院校性质'], ['schooltype']),
    eduMode: k(['教育方式', '教育形式', '学习形式', '就读方式'], ['edumode', 'studymode']),
    enrollmentType: k(['招生类别', '招生方式', '录取类别', '录取方式'], ['enrollmenttype']),
    failedCourses: k(['挂科数', '挂科数量', '挂科科目数']),
    classRank: k(['班级排名', '班级名次'], ['classrank']),
    majorRank: k(['专业排名', '专业名次'], ['majorrank']),
    eduCertNo: k(['学历证书编号', '学历证书号', '学历证号']),
    degreeCertNo: k(['学位证书编号', '学位证书号', '学位证号']),
    counselorName: k(['辅导员姓名', '辅导员', '导员姓名']),
    counselorContact: k(['辅导员联系方式', '辅导员电话', '辅导员联系电话', '导员联系方式']),
    isOverseas: k(['是否海外学校', '海外学校', '是否境外院校']),
    eduDescription: k(['教育描述', '教育经历描述', '在校描述']),
    majorDescription: k(['专业描述', '专业方向描述', '主修方向描述']),
    courses: k(['专业课程', '主修课程', '核心课程', '所学课程'], ['courses']),
    researchDirection: k(['研究方向', '研究内容'], ['researchdirection']),
    thesis: k(['毕业论文', '论文题目', '学位论文'], ['thesis'])
  },
  work: {
    company: k(['公司', '公司名称', '单位', '工作单位', '企业名称', '任职公司', '任职单位'], ['company', 'employer', 'organization']),
    department: k(['部门', '所属部门', '部门名称'], ['department']),
    title: k(['职位', '职务', '岗位', '职称', '任职岗位'], ['title', 'position', 'role']),
    startDate: k(['入职时间', '入职日期', '开始时间', '起始时间', '开始日期'], ['startdate']),
    endDate: k(['离职时间', '离职日期', '结束时间', '结束日期', '离任时间'], ['enddate']),
    city: k(['工作城市', '工作地点', '工作所在地'], ['workcity']),
    industry: k(['工作行业', '所属行业', '行业', '所在行业'], ['industry']),
    employmentType: k(['用工性质', '用工形式', '雇佣类型'], ['employmenttype']),
    monthlySalary: k(['月薪', '月薪资', '月薪收入', '月收入'], ['monthlysalary']),
    annualSalary: k(['年薪', '年薪薪资', '年收入', '年薪资'], ['annualsalary']),
    refereeName: k(['证明人姓名', '证明人', '推荐人姓名', '推荐人'], ['refereename', 'referee']),
    refereeContact: k(['证明人联系方式', '证明人电话', '推荐人联系方式', '推荐人电话'], ['refereecontact']),
    refereeTitle: k(['证明人职位', '推荐人职位', '证明人职务'], ['refereetitle']),
    description: k(['工作描述', '工作内容', '工作职责', '职责描述', '主要工作', '工作说明'], ['description', 'responsibility']),
    leaveReason: k(['离职原因', '离职理由', '离任原因'], ['leavereason'])
  },
  intern: {
    company: k(['实习公司', '实习单位', '公司名称', '公司', '单位'], ['company']),
    department: k(['部门', '所属部门'], ['department']),
    title: k(['实习职位', '实习岗位', '实习职务', '职位', '岗位', '职务'], ['title', 'position']),
    startDate: k(['实习开始时间', '开始时间', '入职时间', '实习入职时间'], ['startdate']),
    endDate: k(['实习结束时间', '结束时间', '离职时间', '实习离职时间'], ['enddate']),
    city: k(['实习地址', '实习城市', '实习地点', '实习所在地区'], ['interncity']),
    industry: k(['所属行业', '实习行业', '行业'], ['industry']),
    employmentType: k(['用工性质', '用工形式'], ['employmenttype']),
    refereeName: k(['证明人姓名', '证明人', '实习证明人'], ['refereename']),
    refereeContact: k(['证明人联系方式', '证明人电话'], ['refereecontact']),
    refereeTitle: k(['证明人职位', '证明人职务'], ['refereetitle']),
    description: k(['实习描述', '实习工作内容', '实习内容', '工作描述', '实习职责'], ['description'])
  },
  project: {
    name: k(['项目名称', '项目名', '项目标题'], ['projectname', 'name']),
    role: k(['项目职务', '项目角色', '担任角色', '项目中职务'], ['role']),
    practiceType: k(['实践方式', '项目类型', '项目性质'], ['practicetype']),
    startDate: k(['项目开始时间', '开始时间', '起始时间', '开始日期'], ['startdate']),
    endDate: k(['项目结束时间', '结束时间', '结束日期'], ['enddate']),
    city: k(['项目地址', '项目所在地区', '项目地点', '项目所在城市'], ['projectcity']),
    link: k(['项目链接', '项目网址', '项目地址链接', '开源地址', 'GitHub'], ['link', 'url']),
    refereeName: k(['证明人姓名', '证明人', '项目证明人'], ['refereename']),
    refereeContact: k(['证明人联系方式', '证明人电话'], ['refereecontact']),
    refereeTitle: k(['证明人职位', '证明人职务'], ['refereetitle']),
    description: k(['项目描述', '项目简介', '项目详细介绍'], ['description']),
    duty: k(['项目职责', '个人职责', '担任职责', '本人职责'], ['duty', 'responsibility']),
    achievement: k(['项目成果', '项目业绩', '取得成果', '项目成绩'], ['achievement'])
  },
  cadre: {
    organization: k(['组织名称', '任职组织', '组织机构', '所在组织', '任职单位'], ['organization']),
    title: k(['职位', '担任职务', '职务', '干部职务', '任职职务'], ['title', 'position']),
    startDate: k(['任职开始时间', '开始时间', '起始时间', '任职时间'], ['startdate']),
    endDate: k(['任职结束时间', '结束时间', '结束日期', '离任时间'], ['enddate']),
    description: k(['工作内容', '主要工作内容', '工作描述'], ['description']),
    duty: k(['本人职责', '个人职责', '职责', '个人职责与成果'], ['duty'])
  },
  language: {
    language: k(['语言种类', '语言', '语种', '外语语种'], ['language']),
    obtainedDate: k(['获得时间', '考试时间', '考试日期', '获得日期', '取证时间'], ['obtaineddate']),
    certName: k(['证书名称', '外语证书', '语言证书'], ['certname']),
    score: k(['成绩', '考试成绩', '分数', '级别分数'], ['score']),
    proficiency: k(['掌握程度', '熟练程度', '总体掌握程度'], ['proficiency']),
    listeningSpeaking: k(['听说能力', '口语能力', '听说水平'], ['listeningspeaking']),
    readingWriting: k(['读写能力', '书面能力', '读写水平'], ['readingwriting'])
  },
  certificate: {
    name: k(['资质证书名称', '证书名称', '证书名', '资格证书名称'], ['certname', 'certificatename']),
    type: k(['资质证书类型', '证书类型', '资格类型'], ['certtype', 'certificatetype']),
    obtainedDate: k(['证书获取时间', '获取时间', '获得时间', '发证时间', '取证时间'], ['obtaineddate'])
  },
  award: {
    name: k(['奖项名称', '获奖名称', '奖励名称', '奖项', '荣誉名称'], ['awardname']),
    issuer: k(['颁发机构', '颁发单位', '发证机构', '授予单位'], ['issuer']),
    date: k(['获奖时间', '获奖日期', '得奖时间'], ['awarddate']),
    endDate: k(['获奖结束时间', '结束时间', '结束日期'], ['enddate']),
    level: k(['奖项级别', '级别'], ['level']),
    awardType: k(['奖励类型', '奖项类型'], ['awardtype']),
    grade: k(['奖励等级', '等级', '获奖等级'], ['grade']),
    description: k(['获奖描述', '获奖说明', '奖项描述'], ['description'])
  },
  patent: {
    name: k(['专利名称', '专利标题'], ['patentname']),
    patentNo: k(['专利号', '专利申请号', '申请号', '授权号', '专利编号'], ['patentno']),
    applyDate: k(['申请日期', '申请时间', '专利申请日', '专利申请日期'], ['applydate']),
    status: k(['专利状态', '法律状态', '专利当前状态'], ['status']),
    inventor: k(['发明人', '专利发明人'], ['inventor']),
    description: k(['专利描述', '专利说明', '专利详细描述'], ['description'])
  },
  paper: {
    title: k(['论文标题', '论文题目', '文章标题', '论文'], ['papertitle', 'title']),
    journal: k(['发表期刊', '期刊', '发表会议', '杂志', '发表刊物'], ['journal']),
    authors: k(['作者', '论文作者', '作者排序'], ['authors']),
    publishDate: k(['发表时间', '发表日期', '刊出时间', '刊登日期'], ['publishdate']),
    doi: k(['DOI号', 'DOI', 'doi号', '数字对象识别码'], ['doi']),
    abstract: k(['论文摘要', '摘要', '论文简介'], ['abstract'])
  },
  family: {
    name: k(['姓名', '家庭成员姓名', '成员姓名', '家属姓名'], ['name']),
    relation: k(['关系', '与本人关系', '称谓', '与申请人关系'], ['relation']),
    gender: k(['性别'], ['gender']),
    education: k(['教育程度', '学历', '文化程度'], ['education']),
    birthDate: k(['出生日期', '生日'], ['birth', 'birthday']),
    phone: k(['联系电话', '联系方式', '电话', '手机', '手机号码'], ['phone', 'tel']),
    company: k(['工作单位', '单位', '工作单位名称', '所在单位'], ['company']),
    title: k(['职位', '职务', '职业', '岗位'], ['title', 'position']),
    politicalStatus: k(['政治面貌'], ['political']),
    address: k(['联系地址', '居住地址', '家庭地址', '住址'], ['address'])
  }
}

/** 学历同义词：用户值 → 可能的选项文本。 */
export const DEGREE_SYNONYMS: Record<string, string[]> = {
  博士: ['博士', '博士研究生', 'doctor', 'ph.d', 'phd'],
  硕士: ['硕士', '研究生', '硕士研究生', 'master'],
  本科: ['本科', '大学本科', '学士', '学士学位', '统招本科', '全日制本科', 'bachelor'],
  大专: ['大专', '专科', '大学专科', '高职', 'associate'],
  高中: ['高中', '中专', '职高', '中技', '高中及以下', 'highschool'],
  初中: ['初中', '初中及以下', '无学历']
}

/** 性别同义词。 */
export const GENDER_SYNONYMS: Record<string, string[]> = {
  男: ['男', 'male', 'm', '先生'],
  女: ['女', 'female', 'f', '女士']
}

/** 是/否 类字段的选项匹配（「是否应届生」等）。 */
export const YES_NO_SYNONYMS: Record<string, string[]> = {
  是: ['是', 'yes', 'y', '有'],
  否: ['否', 'no', 'n', '无']
}

/**
 * 下拉/单选匹配：normalize 后精确相等 > 用户词与选项词互相包含。
 * 返回最匹配的选项文本；无匹配返回 null。
 */
export function matchOption(userValue: string, optionTexts: string[]): string | null {
  const uv = normalizeText(userValue)
  if (!uv) return null
  let best: string | null = null
  let bestScore = 0
  for (const raw of optionTexts) {
    const ov = normalizeText(raw)
    if (!ov) continue
    if (ov === uv) return raw
    if (ov.includes(uv) || uv.includes(ov)) {
      const score = Math.min(ov.length, uv.length)
      if (score > bestScore) {
        bestScore = score
        best = raw
      }
    }
  }
  return best
}

/** 带同义词表的选项匹配（学历/性别/是否类）。 */
export function matchOptionWithSynonyms(userValue: string, optionTexts: string[], synonyms: Record<string, string[]>): string | null {
  const direct = matchOption(userValue, optionTexts)
  if (direct) return direct
  const uv = normalizeText(userValue)
  for (const [canonical, words] of Object.entries(synonyms)) {
    const hit = [canonical, ...words].some(w => normalizeText(w) === uv)
    if (hit) {
      for (const w of [canonical, ...words]) {
        const m = matchOption(w, optionTexts)
        if (m) return m
      }
    }
  }
  return null
}

/** 工作年限匹配：'4年' 可以匹配选项 '3-5年'、'10年以上'。 */
export function matchYearsOption(userValue: string, optionTexts: string[]): string | null {
  const direct = matchOption(userValue, optionTexts)
  if (direct) return direct
  const years = parseLeadingNumber(userValue)
  if (years === null) return null
  for (const raw of optionTexts) {
    const s = normalizeText(raw)
    const range = s.match(/(\d+)-(\d+)/)
    if (range) {
      if (years >= Number(range[1]) && years <= Number(range[2])) return raw
      continue
    }
    const plus = s.match(/(\d+)年以上/)
    if (plus) {
      if (years >= Number(plus[1])) return raw
      continue
    }
    const below = s.match(/(\d+)年以下/)
    if (below) {
      if (years <= Number(below[1])) return raw
      continue
    }
    if (s === `${years}年` || s === String(years)) return raw
  }
  return null
}

function parseLeadingNumber(s: string): number | null {
  const m = normalizeText(s).match(/(\d+)/)
  return m ? Number(m[1]) : null
}
