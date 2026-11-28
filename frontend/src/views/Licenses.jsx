// Habcore Gym (local patch 0010): Settings -> About -> Licences, the ONE place in the app that names
// the software Habcore Gym is built on. The AGPL-3.0 asks for the copyright and licence notices to
// stay, and (section 13) for the complete source of the version users reach over the network to be
// offered to them: SOURCE_URL is this fork's public repository (every build is its commit there).
// The exercise-media attribution is reproduced word for word, as its licence asks (not translated),
// and the full third-party notices (MuscleMap MIT, Geist OFL, QR libraries, ...) are NOTICE.md itself,
// bundled as text, so the page can never drift from the file.
import { getLang } from '../lib/i18n-core.js'
import { Section, Row } from '../components/ui.jsx'
import NOTICE from '../../../NOTICE.md?raw'

export const SOURCE_URL = 'https://github.com/zaxerrrr-dot/GYMFORHABORE'
export const LICENSE_URL = SOURCE_URL + '/blob/main/LICENSE'
export const NOTICE_URL = SOURCE_URL + '/blob/main/NOTICE.md'
export const UPSTREAM_URL = 'https://github.com/DuarteSantos8/openGym'

// Polish for the gym, English for everyone else (the gym patches' pattern, components/InstallHint.jsx).
const T = {
  row: ['Licencje', 'Licences'],
  rowSub: ['Open source (AGPL-3.0), kod źródłowy, prawa autorskie', 'Open source (AGPL-3.0), source code, notices'],
  based: ['Habcore Gym jest oparty na oprogramowaniu open source na licencji AGPL-3.0.', 'Habcore Gym is based on open-source software licensed under the AGPL-3.0.'],
  source: ['Kod źródłowy tej wersji', 'Source code of this version'],
  license: ['Tekst licencji (GNU AGPL-3.0)', 'Licence text (GNU AGPL-3.0)'],
  foot: ['Pełny kod źródłowy wersji, której używasz, ze wszystkimi zmianami, jest publicznie dostępny na tej samej licencji.', 'The complete source code of the version you are using, with every change, is public under the same licence.'],
  notices: ['Informacje o prawach autorskich', 'Notices'],
}
export const licT = k => (String(getLang() || '').toLowerCase().startsWith('pl') ? T[k][0] : T[k][1])

const ext = url => () => window.open(url, '_blank', 'noopener')

export default function LicensesPage() {
  return <>
    <Section footer={licT('foot')}>
      <Row icon="info" iconTint="var(--grey)" title={licT('based')} />
      <Row icon="download" iconTint="var(--green)" title={licT('source')} subtitle={SOURCE_URL.replace(/^https:\/\//, '')} accessory="chevron" onClick={ext(SOURCE_URL)} />
      <Row icon="info" iconTint="var(--grey)" title={licT('license')} accessory="chevron" onClick={ext(LICENSE_URL)} />
    </Section>
    {/* Legal notices: kept in English, as the copyright holders wrote them. */}
    <Section title={licT('notices')}>
      <div className="lic-notes" lang="en" dir="ltr" style={{ padding: '12px 14px', fontSize: 'var(--fs-footnote)', lineHeight: 1.45, color: 'var(--label-2)' }}>
        <p style={{ margin: '0 0 8px' }}>
          Habcore Gym is a modified version of <a href={UPSTREAM_URL} target="_blank" rel="noopener"><span>openGym</span></a>,
          Copyright (C) 2026 Duarte Santos, licensed under the GNU AGPL v3.0 with the additional permission
          described in <a href={NOTICE_URL} target="_blank" rel="noopener"><span>NOTICE.md</span></a>.
          Modifications Copyright (C) 2026 Habcore Gym, under the same licence.
        </p>
        {/* Attribution the media licence asks for word for word (agreement §8c). */}
        <p style={{ margin: '0 0 8px' }}>
          Exercise media © Aliaksandr Makatserchyk, <a href="https://gymvisual.com/" target="_blank" rel="noopener"><span>Gym visual</span></a>, gymvisual.com.
          Media licensed for use in openGym only; see <a href={NOTICE_URL} target="_blank" rel="noopener"><span>NOTICE.md</span></a>
        </p>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, font: 'inherit' }}>{NOTICE}</pre>
      </div>
    </Section>
  </>
}
