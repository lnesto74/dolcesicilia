import { Link, useLocation } from 'react-router-dom';
import { Upload, MessageCircle, BarChart3, ShoppingBag, Target, Store, Smartphone } from 'lucide-react';

const links = [
  { to: '/customers', label: 'Import', icon: Upload },
  { to: '/customers/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/customers/whatsapp-orders', label: 'WA Orders', icon: Smartphone },
  { to: '/customers/segments', label: 'Segments', icon: Target },
  { to: '/customers/messages', label: 'Messages', icon: MessageCircle },
  { to: '/customers/wholesale', label: 'Wholesale', icon: Store },
  { to: '/customers/results', label: 'Results', icon: BarChart3 },
];

export function CustomerAdminNav() {
  const { pathname } = useLocation();

  return (
    <nav className="flex flex-wrap gap-2 mt-4">
      {links.map(({ to, label, icon: Icon }) => {
        const active = pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              active
                ? 'bg-white/20 text-white'
                : 'bg-white/10 text-mediterranean-100 hover:bg-white/15'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
