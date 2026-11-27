// Local patch (Habcore Gym): the app shows the Habcore Gym logo where upstream drew the Habcore Gym
// mark and lockup. Pictures, not drawn shapes: src/brand/habcore-{logo,mark}-{light,dark}.png,
// "light" being the white artwork (for dark backgrounds) and "dark" the dark one (for light ones).
// The mark is the logo without its "powered by" line, for the small places. With variant 'auto'
// both pictures are in the page and the theme shows one (index.css .hc-brand). Never mirrored in RTL.
import LOGO_LIGHT from '../brand/habcore-logo-light.png'
import LOGO_DARK from '../brand/habcore-logo-dark.png'
import MARK_LIGHT from '../brand/habcore-mark-light.png'
import MARK_DARK from '../brand/habcore-mark-dark.png'

const LOGO_ASPECT = 841 / 470
const MARK_ASPECT = 841 / 470

function Pictures({ light, dark, width, height, variant, alt }) {
  const img = (src, cls) => <img className={cls} src={src} width={width} height={height} alt={alt} draggable="false" decoding="async" />
  if (variant === 'light') return img(light, 'hc-brand-img')
  if (variant === 'dark') return img(dark, 'hc-brand-img')
  return <>{img(light, 'hc-brand-img hc-on-dark')}{img(dark, 'hc-brand-img hc-on-light')}</>
}

/** The mark alone, `height` px high. `variant`: 'auto' (follows the theme), 'light' (white) or 'dark'. */
export function BrandMark({ height = 24, variant = 'auto', className, style }) {
  const width = Math.round(height * MARK_ASPECT)
  return (
    <span className={('hc-brand ' + (className || '')).trim()} dir="ltr" aria-hidden="true" style={{ flex: 'none', height, ...style }}>
      <Pictures light={MARK_LIGHT} dark={MARK_DARK} width={width} height={height} variant={variant} alt="" />
    </span>
  )
}

/** The whole logo (the Habcore Gym barbell), sized from `size` as the Habcore Gym lockup's type was. */
export default function BrandLogo({ size = 34, as: Tag = 'span', className = '', style, variant = 'auto' }) {
  const height = Math.round(size * 2.6)
  const width = Math.round(height * LOGO_ASPECT)
  return (
    <Tag className={('hc-brand hc-brand-logo ' + className).trim()} dir="ltr" style={{ height, ...style }}>
      <Pictures light={LOGO_LIGHT} dark={LOGO_DARK} width={width} height={height} variant={variant} alt="Habcore Gym" />
    </Tag>
  )
}
