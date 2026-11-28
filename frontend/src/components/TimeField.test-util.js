// Picking a time in a TimeField the way a person does: tap the field, tap the hour, tap the minute.
// Tests mount sheets by hand, so the picker sheet is mounted here and torn down afterwards.
//
//   pickTime(host.querySelector('[data-timefield]'), '06:15') // true when that time could be picked
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useUI } from '../store/useUI.js'

export const timeFields = host => [...host.querySelectorAll('[data-timefield]')]

export function pickTime(field, hhmm) {
  if (!field) throw new Error('pickTime: no time field')
  act(() => { field.click() })
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const close = () => useUI.getState().closeSheet(sheet.id)
  act(() => root.render(sheet.render(close)))
  const h = +hhmm.slice(0, 2), m = +hhmm.slice(3, 5)
  let ok = false
  const hb = host.querySelector('[data-hour="' + h + '"]')
  if (hb) {
    act(() => { hb.click() })
    const mb = host.querySelector('[data-minute="' + m + '"]')
    if (mb) { act(() => { mb.click() }); ok = true }
  }
  if (useUI.getState().sheets.some(s => s.id === sheet.id)) act(() => { close() })
  act(() => root.unmount())
  host.remove()
  return ok
}
