import s from './wenshu.module.css'
import { getConfig, getWsTiers } from '@/lib/config'
import { IcChat, IcBox, IcFile, IcContract, IcMemory, IcLock } from '../icons'

export const metadata = {
  title: '墨童 · 对话式文书文员',
  description: '把需求或文件发给墨童，AI 自动做单据、套模板、转格式、审合同，直接给你成品文件。承孔子文脉。'
}
export const dynamic = 'force-dynamic'

const FEATURES = [
  { icon: <IcChat />, t: '一句话出文件', d: '发段需求或聊天记录，自动判断该建表、抽表、套模板还是转格式，直接给成品。' },
  { icon: <IcBox />, t: '送货单/对账单/装箱单', d: '专为制造业发货场景：从你的总表一键抽取、套大厂模板，格式分毫不差。' },
  { icon: <IcFile />, t: '格式随心转', d: 'Word / Excel / PDF / 图片互转，PDF 合并拆分，模板批量填充，全在对话里完成。' },
  { icon: <IcContract />, t: '外贸合同审查', d: '上传合同，自动标出付款、交期、索赔、仲裁等风险条款与修改建议。' },
  { icon: <IcMemory />, t: '记得住你的事', d: '公司信息、客户偏好、常用模板存进记忆，越用越懂你，不必重复交代。' },
  { icon: <IcLock />, t: '本地处理更放心', d: '文件在你电脑本地处理，只把必要内容交给 AI，安全省心。' }
]

const GALLERY = [
  { img: '/motong/bamboo.jpg', t: '《论语》', d: '文脉所承' },
  { img: '/motong/hall.jpg', t: '先贤殿堂', d: '斯文在兹' },
  { img: '/motong/library.jpg', t: '典籍传习', d: '学以致道' }
]

const TIER_HINT: Record<string, boolean> = { plus: true }

export default async function WenshuHome() {
  const tiers = await getWsTiers()
  const version = await getConfig('ws_app_version')
  const wan = (n: number): string => (n >= 10000 ? `${Math.round(n / 10000)}万` : String(n))

  return (
    <div className={s.page}>
      {/* eslint-disable @next/next/no-img-element */}
      <nav className={s.nav}>
        <div className={s.navInner}>
          <a className={s.brand} href="/wenshu">
            <span className={s.logo}>墨</span> 墨童
          </a>
          <div className={s.navSpacer} />
          <a className={s.navLink} href="#culture">孔子文脉</a>
          <a className={s.navLink} href="#pricing">套餐</a>
          <a className={`${s.btn} ${s.btnPrimary}`} href="/wenshu/download" style={{ padding: '8px 18px' }}>
            下载
          </a>
        </div>
      </nav>

      {/* 大图 Hero */}
      <header className={s.heroImg}>
        <img className={s.heroBg} src="/motong/bamboo.jpg" alt="《论语》" />
        <div className={s.heroScrim} />
        <div className={`${s.wrap} ${s.heroWrap}`}>
          <div className={s.heroText}>
            <span className={s.heroK}>承孔门「文学」之传 · 子夏文脉</span>
            <h1 className={s.heroT}>
              你的 AI 文员
              <br />
              一句话，就出文件
            </h1>
            <p className={s.heroSub}>
              发个需求、甩张表、贴段聊天记录——墨童自动做单据、套大厂模板、转格式、审合同，做好的文件直接发回给你。
            </p>
            <div className={s.ctaRow}>
              <a className={`${s.btn} ${s.btnPrimary}`} href="/wenshu/download">免费下载试用</a>
              <a className={`${s.btn} ${s.btnLight}`} href="#pricing">查看套餐</a>
            </div>
          </div>
          <div className={s.heroCard}>
            <div className={s.shotBar}>
              <span className={s.dot} />
              <span className={s.dot} />
              <span className={s.dot} />
            </div>
            <div className={s.shotBody}>
              <div className={s.bubbleU}>客户要这批货的送货单，Excel 版，按总表里的箱件汇总做</div>
              <div className={s.bubbleA}>好的，已从总表抽取「箱件汇总」并保留原格式，合同号 XMXS-20260319 的 3 箱都在。</div>
              <div className={s.fileChip}><IcFile size={14} /> 送货单-箱件汇总.xlsx · 点击保存</div>
            </div>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className={`${s.wrap} ${s.section}`}>
        <h2 className={s.h2}>会的活，比文员还全</h2>
        <p className={s.h2sub}>常见的文书、单据、合同、格式转换，开口就办。</p>
        <div className={s.grid}>
          {FEATURES.map((f) => (
            <div className={s.card} key={f.t}>
              <div className={s.cardIcon}>{f.icon}</div>
              <h3 className={s.cardT}>{f.t}</h3>
              <p className={s.cardD}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 孔子博物馆 · 文脉 跨栏 */}
      <section className={s.sectionAlt} id="culture">
        <div className={`${s.wrap} ${s.split}`}>
          <div className={s.splitText}>
            <span className={s.kk}>师承 · 山东孔子博物馆文脉</span>
            <h2 className={s.splitH}>两千年的文书之道<br />做成今天的 AI</h2>
            <p className={s.splitP}>
              墨童，承孔门「文学」科先贤<b>子夏（卜商）</b>之学——以仁待人、以礼成文、以义立信。
            </p>
            <p className={s.splitQuote}>「百工居肆以成其事，君子学以致其道。」<span>——《论语 · 子张》</span></p>
            <a className={s.splitLink} href="/wenshu/download">下载墨童 v{version} →</a>
          </div>
          <img className={s.splitImg} src="/motong/statue.jpg" alt="山东孔子博物馆 · 孔子像" />
        </div>
      </section>

      {/* 文脉图廊 */}
      <section className={`${s.wrap} ${s.section}`}>
        <h2 className={s.h2}>斯文在兹</h2>
        <p className={s.h2sub}>典籍 · 殿堂 · 先贤——墨童的根，在孔子文化里。</p>
        <div className={s.gallery3}>
          {GALLERY.map((g) => (
            <figure className={s.gcard} key={g.t}>
              <img src={g.img} alt={g.t} />
              <figcaption>
                <b>{g.t}</b>
                <span>{g.d}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className={s.sectionAlt} id="pricing">
        <div className={`${s.wrap} ${s.section}`} style={{ padding: '72px 24px' }}>
          <h2 className={s.h2}>比请一个文员，划算太多</h2>
          <p className={s.h2sub}>按月订阅，额度每周自动刷新。后台可随时调整。</p>
          <div className={s.tiers}>
            {tiers.map((t) => (
              <div className={`${s.tier} ${TIER_HINT[t.id] ? s.tierHot : ''}`} key={t.id}>
                <div className={s.tierName}>{t.name}</div>
                <div className={s.tierPrice}>
                  ¥{Math.round(t.priceCents / 100)}
                  <span className={s.tierUnit}> /月</span>
                </div>
                <div className={s.tierQuota}>每周 {wan(t.weekTokens)} token</div>
                <a className={`${s.btn} ${TIER_HINT[t.id] ? s.btnPrimary : s.btnGhost}`} href="/wenshu/download">
                  下载并开通
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className={`${s.wrap} ${s.section}`} style={{ textAlign: 'center' }}>
        <h2 className={s.h2}>今天就让墨童上工</h2>
        <p className={s.h2sub}>Windows / Mac / 手机均可，安装后手机号登录即用。</p>
        <div className={s.ctaRow} style={{ justifyContent: 'center' }}>
          <a className={`${s.btn} ${s.btnPrimary}`} href="/wenshu/download">下载墨童 v{version}</a>
        </div>
      </section>

      <footer className={s.footer}>
        © 2026 墨童 · 承孔子文脉 · <a href="/terms">用户协议</a> · <a href="/privacy">隐私政策</a> · <a href="/">Co-GPT 生图</a>
      </footer>
      {/* eslint-enable @next/next/no-img-element */}
    </div>
  )
}
