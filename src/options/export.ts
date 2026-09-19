/**
 * 简历导出：把档案排成 A4 版式的独立 HTML，放进隐藏 iframe 调起
 * 浏览器打印（用户选「另存为 PDF」即可得到 PDF 文件）。
 * lang === 'en' 的档案（英文简历）使用英文标题、英文月份与 Summary 置顶的英文版式。
 */
import type { Profile } from '../shared/types'

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}

function fmtEnPeriod(start: string, end: string): string {
  const f = (ym: string): string => {
    const m = ym.match(/^(\d{4})(?:-(\d{2}))?$/)
    if (!m) return ym
    return m[2] ? `${MONTHS_EN[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim() : m[1]
  }
  if (!start && !end) return ''
  return `${f(start) || ''} - ${end ? f(end) : 'Present'}`
}

function fmtZhRange(start: string, end: string): string {
  if (!start && !end) return ''
  return `${start || '—'} ~ ${end || '至今'}`
}

function joinDot(parts: (string | false | undefined | null)[], sep = ' · '): string {
  return parts.filter(Boolean).join(sep)
}

function itemHtml(title: string, time: string, desc?: string): string {
  return `
    <div class="item">
      <div class="item-head"><span>${esc(title)}</span>${time ? `<span>${esc(time)}</span>` : ''}</div>
      ${desc ? `<p class="desc">${esc(desc)}</p>` : ''}
    </div>`
}

interface SectionHtml {
  title: string
  body: string
}

function buildSections(profile: Profile): SectionHtml[] {
  const EN = profile.lang === 'en'
  const p = profile.personal
  const it = profile.intention
  const sk = profile.skills
  const period = EN ? fmtEnPeriod : fmtZhRange
  const sections: SectionHtml[] = []

  if (EN) {
    // 英文版式：Summary 置顶，只保留能力相关区块
    if (p.selfIntro) sections.push({ title: 'Summary', body: `<p class="expect">${esc(p.selfIntro)}</p>` })
    if (profile.education.length) {
      sections.push({
        title: 'Education',
        body: profile.education
          .map(e =>
            itemHtml(
              joinDot([e.school, joinDot([e.education, e.major], ' in '), e.degreeName]),
              period(e.startDate, e.endDate),
              joinDot([e.gpa && `GPA ${e.gpa}`])
            )
          )
          .join('')
      })
    }
    const exp = [
      ...profile.work.map(w => itemHtml(joinDot([w.company, w.title]), period(w.startDate, w.endDate), w.description)),
      ...profile.intern.map(w => itemHtml(joinDot([w.company, w.title]), period(w.startDate, w.endDate), w.description))
    ]
    if (exp.length) sections.push({ title: 'Experience', body: exp.join('') })
    if (profile.project.length) {
      sections.push({
        title: 'Projects',
        body: profile.project
          .map(x => itemHtml(joinDot([x.name, x.role]), period(x.startDate, x.endDate), x.description))
          .join('')
      })
    }
    const skillLine = joinDot([sk.technical, sk.software && `Software: ${sk.software}`])
    if (skillLine) sections.push({ title: 'Skills', body: `<p class="expect">${esc(skillLine)}</p>` })
    if (sk.languages) sections.push({ title: 'Languages', body: `<p class="expect">${esc(sk.languages)}</p>` })
    if (profile.award.length) {
      sections.push({
        title: 'Awards',
        body: profile.award.map(a => itemHtml(a.name, a.date)).join('')
      })
    }
    if (profile.paper.length) {
      sections.push({
        title: 'Publications',
        body: profile.paper.map(x => itemHtml(joinDot([x.title, x.journal]), x.publishDate, joinDot([x.authors, x.doi]))).join('')
      })
    }
    if (profile.patent.length) {
      sections.push({
        title: 'Patents',
        body: profile.patent.map(x => itemHtml(x.name, x.applyDate, x.patentNo)).join('')
      })
    }
    return sections
  }

  // ---- 中文版式 ----
  const expectLine = joinDot([
    it.targetPosition && `期望职位：${it.targetPosition}`,
    it.expectCity && `期望城市：${it.expectCity}`,
    (it.expectSalary || it.expectAnnualSalary) && `期望薪资：${joinDot([it.expectSalary, it.expectAnnualSalary && `${it.expectAnnualSalary}元/年`])}`,
    p.yearsOfExp && `工作年限：${p.yearsOfExp}`,
    it.joinDate && `到岗时间：${it.joinDate}`
  ])
  if (expectLine) sections.push({ title: '求职意向', body: `<p class="expect">${esc(expectLine)}</p>` })

  if (profile.education.length) {
    sections.push({
      title: '教育经历',
      body: profile.education
        .map(e =>
          itemHtml(
            joinDot([e.school, e.major, e.education !== '本科' && e.education, e.degreeName]) || '教育经历',
            period(e.startDate, e.endDate),
            joinDot([e.gpa && `GPA ${e.gpa}`, e.researchDirection && `研究方向：${e.researchDirection}`])
          )
        )
        .join('')
    })
  }

  if (profile.work.length) {
    sections.push({
      title: '工作经历',
      body: profile.work.map(w => itemHtml(joinDot([w.company, w.title]), period(w.startDate, w.endDate), w.description)).join('')
    })
  }

  if (profile.intern.length) {
    sections.push({
      title: '实习经历',
      body: profile.intern.map(w => itemHtml(joinDot([w.company, w.title]), period(w.startDate, w.endDate), w.description)).join('')
    })
  }

  if (profile.project.length) {
    sections.push({
      title: '项目经历',
      body: profile.project
        .map(x => itemHtml(joinDot([x.name, x.role]), period(x.startDate, x.endDate), joinDot([x.description, x.duty, x.achievement], '\n')))
        .join('')
    })
  }

  const skillsLine = joinDot([
    sk.technical && `技术技能：${sk.technical}`,
    sk.software && `软件技能：${sk.software}`,
    sk.languages && `语言能力：${sk.languages}`,
    sk.certificates && `证书：${sk.certificates}`,
    sk.soft && `软技能：${sk.soft}`
  ])
  if (skillsLine) sections.push({ title: '技能专长', body: `<p class="expect">${esc(skillsLine)}</p>` })

  if (profile.language.length) {
    sections.push({
      title: '外语能力',
      body: profile.language
        .map(l => itemHtml(joinDot([l.language, l.certName, l.score]), l.obtainedDate, joinDot([l.proficiency, l.listeningSpeaking && `听说：${l.listeningSpeaking}`, l.readingWriting && `读写：${l.readingWriting}`])))
        .join('')
    })
  }

  if (profile.certificate.length) {
    sections.push({
      title: '证书',
      body: profile.certificate.map(c => itemHtml(joinDot([c.name, c.type]), c.obtainedDate)).join('')
    })
  }

  if (profile.award.length) {
    sections.push({
      title: '获奖经历',
      body: profile.award.map(a => itemHtml(joinDot([a.name, a.level, a.grade]), a.date, joinDot([a.issuer]))).join('')
    })
  }

  if (profile.patent.length) {
    sections.push({
      title: '专利信息',
      body: profile.patent.map(x => itemHtml(joinDot([x.name, x.status]), x.applyDate, joinDot([x.patentNo, x.inventor && `发明人：${x.inventor}`]))).join('')
    })
  }

  if (profile.paper.length) {
    sections.push({
      title: '论文发表',
      body: profile.paper.map(x => itemHtml(joinDot([x.title, x.journal]), x.publishDate, joinDot([x.authors, x.doi]))).join('')
    })
  }

  if (profile.cadre.length) {
    sections.push({
      title: '干部任职经历',
      body: profile.cadre.map(c => itemHtml(joinDot([c.organization, c.title]), period(c.startDate, c.endDate), c.description)).join('')
    })
  }

  if (profile.family.length) {
    sections.push({
      title: '家庭情况',
      body: profile.family.map(f => itemHtml(joinDot([f.name, f.relation, f.company, f.title]), '')).join('')
    })
  }

  if (p.selfIntro || p.personalStrengths || p.hobbies) {
    sections.push({
      title: '自我评价',
      body: [p.selfIntro, p.personalStrengths, p.hobbies].filter(Boolean).map(t => `<p class="desc">${esc(t)}</p>`).join('')
    })
  }

  return sections
}

function buildResumeHtml(profile: Profile): string {
  const b = profile.personal
  const EN = profile.lang === 'en'
  const name = b.fullName || profile.label || '简历'
  const contactLine1 = joinDot([b.phone, b.email, b.wechat && `WeChat: ${b.wechat}`])
  const contactLine2 = EN
    ? joinDot([b.address, b.yearsOfExp].filter(Boolean))
    : joinDot([b.gender, b.birthDate, b.address, b.politicalStatus])

  const sectionsHtml = buildSections(profile)
    .map(s => `<section><h2>${esc(s.title)}</h2>${s.body}</section>`)
    .join('')

  return `<!doctype html>
<html lang="${EN ? 'en' : 'zh-CN'}">
<head>
<meta charset="UTF-8" />
<title>${esc(profile.label || name)} - ${EN ? 'Resume' : '简历'}</title>
<style>
  @page { size: A4; margin: ${EN ? '12mm 15mm' : '14mm 16mm'}; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ${EN ? 'Georgia, "Times New Roman", serif' : '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif'}; color: #222; font-size: ${EN ? '11.5px' : '12px'}; line-height: 1.6; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2b2b2b; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: ${EN ? '22px' : '24px'}; letter-spacing: 2px; }
  .contact { color: #555; font-size: 11.5px; text-align: right; line-height: 1.7; }
  section { margin-bottom: 16px; }
  h2 { font-size: 14px; border-left: 4px solid #2b5cd9; padding-left: 8px; margin-bottom: 10px; ${EN ? 'text-transform: uppercase; letter-spacing: 1px;' : ''} }
  .item { margin-bottom: 9px; }
  .item-head { display: flex; justify-content: space-between; font-weight: 600; }
  .desc, .expect { white-space: pre-wrap; color: #333; margin-top: 2px; }
</style>
</head>
<body>
  <header>
    <h1>${esc(name)}</h1>
    <div class="contact">${contactLine1 ? `${esc(contactLine1)}<br/>` : ''}${contactLine2 ? esc(contactLine2) : ''}</div>
  </header>
  ${sectionsHtml}
</body>
</html>`
}

/** 调起当前档案的「另存为 PDF」。 */
export function printProfile(profile: Profile): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  iframe.srcdoc = buildResumeHtml(profile)

  const cleanup = () => iframe.remove()
  iframe.onload = () => {
    const win = iframe.contentWindow
    if (!win) return cleanup()
    win.addEventListener('afterprint', cleanup)
    // 留一拍让版式稳定后再调打印
    setTimeout(() => win.print(), 60)
    // afterprint 在个别场景不触发，兜底清理
    setTimeout(cleanup, 120000)
  }
  document.body.appendChild(iframe)
}
