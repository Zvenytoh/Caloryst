import { Suspense, lazy, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { DiaryPage } from '../features/diary/DiaryPage'
import { ChartIcon, FoodsIcon, JournalIcon, ProfileIcon } from '../shared/icons'
import { Logo } from '../shared/Logo'
import { Toaster } from '../shared/Toaster'
import { PageBoundary } from './PageBoundary'

// Secondary tabs load on demand; hovering or focusing a tab starts the download early.
const loadFoods = () => import('../features/foods/FoodsPage')
const loadAnalysis = () => import('../features/analysis/AnalysisPage')
const loadProfile = () => import('../features/goals/ProfilePage')
const FoodsPage = lazy(() => loadFoods().then((m) => ({ default: m.FoodsPage })))
const AnalysisPage = lazy(() => loadAnalysis().then((m) => ({ default: m.AnalysisPage })))
const ProfilePage = lazy(() => loadProfile().then((m) => ({ default: m.ProfilePage })))

type Tab = 'journal' | 'foods' | 'analysis' | 'profile'

const TABS: { id: Tab; label: string; icon: ReactNode; preload?: () => Promise<unknown> }[] = [
  { id: 'journal', label: 'Journal', icon: <JournalIcon /> },
  { id: 'foods', label: 'Aliments', icon: <FoodsIcon />, preload: loadFoods },
  { id: 'analysis', label: 'Analyse', icon: <ChartIcon />, preload: loadAnalysis },
  { id: 'profile', label: 'Profil', icon: <ProfileIcon />, preload: loadProfile },
]

type Props = { displayName: string; onSignOut: () => void; onUnauthenticated: () => void }

export function Shell({ displayName, onSignOut, onUnauthenticated }: Props) {
  const [tab, setTab] = useState<Tab>('journal')
  const nav = useRef<HTMLElement>(null)

  // Slides the highlight under the current tab; CSS variables avoid a re-render per resize.
  useLayoutEffect(() => {
    const el = nav.current
    if (!el) return
    const place = () => {
      const current = el.querySelector<HTMLElement>('[aria-current="page"]')
      if (!current) return
      el.style.setProperty('--tab-x', `${current.offsetLeft}px`)
      el.style.setProperty('--tab-w', `${current.offsetWidth}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tab])

  const open = (id: Tab) => {
    if (id === tab) return
    setTab(id)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Logo size={30} />
          <span>Kalo</span>
        </div>
        <nav className="tabs" aria-label="Navigation principale" ref={nav}>
          <span className="tabs__indicator" aria-hidden="true" />
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="tab"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => open(t.id)}
              onPointerEnter={() => void t.preload?.()}
              onFocus={() => void t.preload?.()}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="shell__main">
        {/* key: a failed page must not keep the other tabs on the error screen. */}
        <PageBoundary key={tab}>
          <Suspense fallback={<div className="skeleton skeleton--summary" aria-busy="true" aria-label="Chargement" />}>
            {tab === 'journal' && <DiaryPage onUnauthenticated={onUnauthenticated} />}
            {tab === 'foods' && <FoodsPage />}
            {tab === 'analysis' && <AnalysisPage onEditProfile={() => open('profile')} />}
            {tab === 'profile' && <ProfilePage displayName={displayName} onSignOut={onSignOut} />}
          </Suspense>
        </PageBoundary>
      </main>
      <Toaster />
    </div>
  )
}
