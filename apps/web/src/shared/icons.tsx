import type { ReactNode } from 'react'

function Icon({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const PlusIcon = (p: P) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const CloseIcon = (p: P) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const ChevronLeftIcon = (p: P) => <Icon {...p}><path d="M15 6l-6 6 6 6" /></Icon>
export const ChevronRightIcon = (p: P) => <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>
export const PencilIcon = (p: P) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></Icon>
export const TrashIcon = (p: P) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>

export const JournalIcon = (p: P) => <Icon {...p}><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M10 8h5M10 12h5" /></Icon>
export const FoodsIcon = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.5-4.5" /></Icon>
export const ProfileIcon = (p: P) => <Icon {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></Icon>

export const SunriseIcon = (p: P) => <Icon {...p}><path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 4v4M5.6 9.6l1.4 1.4M18.4 9.6L17 11M2 14h2M20 14h2" /></Icon>
export const SunIcon = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
export const MoonIcon = (p: P) => <Icon {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></Icon>
export const LeafIcon = (p: P) => <Icon {...p}><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7" /></Icon>
export const PulseIcon = (p: P) => <Icon {...p}><path d="M3 12h4l2-5 4 10 2-5h6" /></Icon>

/** A glass whose fill level shows whether it has been drunk. */
export function GlassIcon({ full, size = 36 }: { full: boolean; size?: number }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 30 36" aria-hidden="true" focusable="false">
      <path className={full ? 'glass__fill' : undefined} d="M4 3h22l-3 30H7z" fill={full ? 'var(--water)' : 'none'} stroke="var(--water)" strokeWidth="2" strokeLinejoin="round" opacity={full ? 1 : 0.55} />
      {full && <path d="M6.2 10h17.6" stroke="var(--surface)" strokeWidth="1.5" opacity="0.5" />}
    </svg>
  )
}
