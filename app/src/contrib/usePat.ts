import { useEffect, useState } from 'react'
import { useSettingsStore } from '@/store/settings'

export function usePat() {
  const remembered = useSettingsStore((s) => s.rememberedPat)
  const setRemembered = useSettingsStore((s) => s.setRememberedPat)
  const clearRemembered = useSettingsStore((s) => s.clearRememberedPat)

  const [pat, setPatState] = useState(remembered)
  useEffect(() => {
    if (pat === '' && remembered !== '') setPatState(remembered)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remembered])

  const setPat = (next: string, persist: boolean) => {
    setPatState(next)
    if (persist) setRemembered(next)
    else if (remembered !== '') clearRemembered()
  }

  const clearPat = () => {
    setPatState('')
    clearRemembered()
  }

  return {
    pat,
    setPat,
    clearPat,
    hasRemembered: remembered !== '',
    lastFour: pat ? pat.slice(-4) : '',
  }
}
