import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useSettingsStore } from '@/store/settings'
import { detectTarget } from './octokitClient'
import { usePat } from './usePat'

const TOKEN_CREATE_URL =
  'https://github.com/settings/tokens/new?scopes=repo&description=GPE-Practice%20PR%20Bot'
const TOKEN_FINE_GRAINED_URL = 'https://github.com/settings/personal-access-tokens/new'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (pat: string, target: { owner: string; repo: string }) => Promise<void>
  submitting?: boolean
}

export default function PatModal({ open, onOpenChange, onSubmit, submitting = false }: Props) {
  const { t } = useTranslation()
  const { pat, setPat, lastFour, hasRemembered } = usePat()
  const settingsTargetOwner = useSettingsStore((s) => s.targetOwner)
  const settingsTargetRepo = useSettingsStore((s) => s.targetRepo)
  const setSettingsOwner = useSettingsStore((s) => s.setTargetOwner)
  const setSettingsRepo = useSettingsStore((s) => s.setTargetRepo)
  const auto = detectTarget()
  const [owner, setOwner] = useState(settingsTargetOwner || auto.owner)
  const [repo, setRepo] = useState(settingsTargetRepo || auto.repo)
  const [remember, setRemember] = useState(hasRemembered)
  const [tokenLocal, setTokenLocal] = useState(pat)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!tokenLocal && !!owner && !!repo && !submitting

  async function handleSubmit() {
    setError(null)
    if (!tokenLocal) {
      setError(t('contrib.pat.errors.missingToken'))
      return
    }
    if (!owner || !repo) {
      setError(t('contrib.pat.errors.missingTarget'))
      return
    }
    setPat(tokenLocal, remember)
    if (owner !== auto.owner) setSettingsOwner(owner)
    if (repo !== auto.repo) setSettingsRepo(repo)
    try {
      await onSubmit(tokenLocal, { owner, repo })
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('contrib.pat.title')}</DialogTitle>
          <DialogDescription>{t('contrib.pat.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-2 block">{t('contrib.pat.targetRepo')}</Label>
            <div className="flex gap-2 items-center">
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder={t('contrib.pat.owner')} />
              <span className="text-muted-foreground">/</span>
              <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder={t('contrib.pat.repo')} />
            </div>
          </div>

          <div>
            <Label htmlFor="pat-input" className="mb-2 block">{t('contrib.pat.token')}</Label>
            <Input
              id="pat-input"
              type="password"
              value={tokenLocal}
              onChange={(e) => setTokenLocal(e.target.value)}
              placeholder={t('contrib.pat.tokenPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
            {hasRemembered && lastFour && (
              <p className="text-xs text-muted-foreground mt-1">
                {t('contrib.pat.showingLastFour', { lastFour })}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2 space-x-3">
              <a
                href={TOKEN_CREATE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {t('contrib.pat.createToken')}
              </a>
              <a
                href={TOKEN_FINE_GRAINED_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-[11px]"
              >
                {t('contrib.pat.createTokenAdvanced')}
              </a>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-pat"
              checked={remember}
              onCheckedChange={(c) => setRemember(c === true)}
            />
            <Label htmlFor="remember-pat" className="cursor-pointer text-sm">
              {t('contrib.pat.rememberInBrowser')}
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('contrib.pat.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? t('contrib.pat.submitting') : t('contrib.pat.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
