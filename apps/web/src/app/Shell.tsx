import { useState, type ReactNode } from 'react'
import { DiaryPage } from '../features/diary/DiaryPage'
import { FoodsPage } from '../features/foods/FoodsPage'
import { ProfilePage } from '../features/goals/ProfilePage'
import { FoodsIcon, JournalIcon, ProfileIcon } from '../shared/icons'
import { Logo } from '../shared/Logo'

type Tab = 'journal' | 'foods' | 'profile'

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'journal', label: 'Journal', icon: <JournalIcon /> },
  { id: 'foods', label: 'Aliments', icon: <FoodsIcon /> },
  { id: 'profile', label: 'Profil', icon: <ProfileIcon /> },
]

type Props = { displayName: string; onSignOut: () => void; onUnauthenticated: () => void }

export function Shell({ displayName, onSignOut, onUnauthenticated }: Props) {
  const [tab, setTab] = useState<Tab>('journal')
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <Logo size={30} />
          <span>Kalo</span>
        </div>
        <nav className="tabs" aria-label="Navigation principale">
          {TABS.map((t) => (
            <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main className="shell__main">
        {tab === 'journal' && <DiaryPage onUnauthenticated={onUnauthenticated} />}
        {tab === 'foods' && <FoodsPage />}
        {tab === 'profile' && <ProfilePage displayName={displayName} onSignOut={onSignOut} />}
      </main>
    </div>
  )
}
