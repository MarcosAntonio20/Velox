import {
  ClipboardList,
  Image as ImageIcon,
  LogOut,
  Package,
  ShieldCheck,
  Star,
  Tags,
  Ticket,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { classNames } from '../../utils/helpers';
import './AdminLayout.css';

interface AdminNavigationLink {
  label: string;
  to: string;
  icon: LucideIcon;
}

const ADMIN_LOGIN_ROUTE = '/admin/login';

const ADMIN_LINKS: AdminNavigationLink[] = [
  { label: 'Produtos', to: '/admin/produtos', icon: Package },
  { label: 'Categorias', to: '/admin/categorias', icon: Tags },
  { label: 'Pedidos', to: '/admin/pedidos', icon: ClipboardList },
  { label: 'Clientes', to: '/admin/clientes', icon: Users },
  { label: 'Estoque', to: '/admin/estoque', icon: Warehouse },
  { label: 'Cupons', to: '/admin/cupons', icon: Ticket },
  { label: 'Banners', to: '/admin/banners', icon: ImageIcon },
  { label: 'Avaliações', to: '/admin/avaliacoes', icon: Star },
];

const DEFAULT_SECTION_TITLE = 'Painel administrativo';

/** Título da topbar: o rótulo do link cuja rota corresponde ao caminho atual. */
function getSectionTitle(pathname: string): string {
  const match = ADMIN_LINKS.find(
    (link) => pathname === link.to || pathname.startsWith(`${link.to}/`),
  );

  return match ? match.label : DEFAULT_SECTION_TITLE;
}

export function AdminLayout() {
  const { user, isAdmin, isLoading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Aguarda a restauração da sessão antes de decidir se redireciona.
  if (isLoading) {
    return null;
  }

  // Protege todas as rotas do painel: apenas administradores autenticados.
  if (!isAdmin) {
    return <Navigate to={ADMIN_LOGIN_ROUTE} replace state={{ from: location.pathname }} />;
  }

  const handleLogout = async (): Promise<void> => {
    await logout();
    navigate(ADMIN_LOGIN_ROUTE, { replace: true });
  };

  return (
    <div className="admin-layout">
      {/* ------------------------------------------------------------------
          Sidebar fixa
          ------------------------------------------------------------------ */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo">VELOX</span>
          <span className="admin-sidebar__logo-caption">PAINEL ADMIN</span>
        </div>

        <nav className="admin-sidebar__nav" aria-label="Menu do painel administrativo">
          <ul className="admin-sidebar__list">
            {ADMIN_LINKS.map((link) => {
              const Icon = link.icon;

              return (
                <li key={link.to} className="admin-sidebar__item">
                  <NavLink
                    className={({ isActive }) =>
                      classNames('admin-sidebar__link', isActive && 'admin-sidebar__link--active')
                    }
                    to={link.to}
                  >
                    <Icon className="admin-sidebar__link-icon" />
                    {link.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="admin-sidebar__footer">
          <button className="admin-sidebar__logout" type="button" onClick={handleLogout}>
            <LogOut className="admin-sidebar__logout-icon" />
            Sair
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------------------
          Área principal
          ------------------------------------------------------------------ */}
      <div className="admin-layout__main">
        <header className="admin-topbar">
          <h1 className="admin-topbar__title">{getSectionTitle(location.pathname)}</h1>

          <div className="admin-topbar__profile">
            <span className="admin-topbar__avatar">
              <ShieldCheck className="admin-topbar__avatar-icon" />
            </span>
            <span className="admin-topbar__profile-text">
              <span className="admin-topbar__profile-name">Administrador</span>
              {user ? <span className="admin-topbar__profile-email">{user.email}</span> : null}
            </span>
          </div>
        </header>

        <main className="admin-layout__content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
