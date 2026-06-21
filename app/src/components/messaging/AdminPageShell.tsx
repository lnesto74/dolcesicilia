import type { ReactNode } from 'react';
import { CustomerAdminNav } from '../CustomerAdminNav';

export function AdminPageShell({
  title,
  subtitle,
  headerExtra,
  maxWidth = 'max-w-6xl',
  children,
}: {
  title: string;
  subtitle: string;
  headerExtra?: ReactNode;
  maxWidth?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream-500">
      <header className="bg-mediterranean-800 text-white px-4 py-6 sm:px-8">
        <div className={`${maxWidth} mx-auto`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-mediterranean-200 text-sm uppercase tracking-widest mb-1">Admin</p>
              <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
              <p className="text-mediterranean-100 mt-2 text-sm sm:text-base">{subtitle}</p>
            </div>
            {headerExtra}
          </div>
          <CustomerAdminNav />
        </div>
      </header>
      <main className={`${maxWidth} mx-auto px-4 py-8 sm:px-8`}>{children}</main>
    </div>
  );
}
