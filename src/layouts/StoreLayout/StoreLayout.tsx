import { Clock, LayoutGrid, Mail, Phone, Search, ShoppingCart, User } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { classNames } from '../../utils/helpers';
import logoVelox from '../../assets/images/Icone.jpg';
import './StoreLayout.css';

interface NavigationLink {
  label: string;
  to: string;
  /** Faz a rota só ficar ativa em correspondência exata (usado no Home). */
  end?: boolean;
}

interface FooterLink {
  label: string;
  to: string;
}

const CATEGORY_LINKS: NavigationLink[] = [
  { label: 'Home', to: '/', end: true },
  { label: 'Mouses', to: '/busca?q=mouses' },
  { label: 'Teclados', to: '/busca?q=teclados' },
  { label: 'Monitores', to: '/busca?q=monitores' },
  { label: 'Headsets', to: '/busca?q=headsets' },
  { label: 'Cadeiras', to: '/busca?q=cadeiras' },
  { label: 'Microfones', to: '/busca?q=microfones' },
];

const INSTITUTIONAL_LINKS: FooterLink[] = [
  { label: 'Quem somos', to: '/quem-somos' },
  { label: 'Política de privacidade', to: '/politica-de-privacidade' },
  { label: 'Termos de uso', to: '/termos-de-uso' },
  { label: 'Fale conosco', to: '/fale-conosco' },
];

const ACCOUNT_LINKS: FooterLink[] = [
  { label: 'Minha conta', to: '/minha-conta' },
  { label: 'Meus pedidos', to: '/minha-conta/pedidos' },
  { label: 'Lista de desejos', to: '/favoritos' },
  { label: 'Carrinho', to: '/carrinho' },
];

const SOCIAL_LINKS: Array<{ label: string; href: string }> = [
  { label: 'Instagram', href: 'https://instagram.com' },
  { label: 'YouTube', href: 'https://youtube.com' },
  { label: 'Twitch', href: 'https://twitch.tv' },
  { label: 'Discord', href: 'https://discord.com' },
];

const SEARCH_ROUTE = '/busca';

interface StoreLayoutProps {
  children?: ReactNode;
}

export function StoreLayout({ children }: StoreLayoutProps) {
  const { user } = useAuth();
  const { totalItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Mantém o campo de busca sincronizado com o parâmetro `q` quando estamos na página de busca.
  useEffect(() => {
    if (location.pathname === SEARCH_ROUTE) {
      setSearchTerm(new URLSearchParams(location.search).get('q') ?? '');
    }
  }, [location.pathname, location.search]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const term = searchTerm.trim();

    if (!term) {
      return;
    }

    navigate(`${SEARCH_ROUTE}?q=${encodeURIComponent(term)}`);
  };

  const isCustomerLoggedIn = user !== null;
  const userFirstName = user ? user.name.trim().split(/\s+/)[0] : '';
  const userLink = isCustomerLoggedIn ? '/minha-conta' : '/login';
  const cartLabel =
    totalItems === 0
      ? 'Carrinho vazio'
      : `Carrinho com ${totalItems} ${totalItems === 1 ? 'item' : 'itens'}`;

  return (
    <div className="store-layout">
      {/* ------------------------------------------------------------------
          Header
          ------------------------------------------------------------------ */}
      <header className="store-header">
        <div className="container store-header__inner">
          <Link className="store-header__logo" to="/" aria-label="VELOX — página inicial">
            <img
              src={logoVelox}
              alt="Símbolo VELOX"
              className="store-header__logo-img"
            />
            <span>VELOX</span>
          </Link>

          <form className="store-header__search" role="search" onSubmit={handleSearchSubmit}>
            <input
              className="store-header__search-input"
              type="search"
              name="q"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Busque por mouses, teclados, headsets..."
              aria-label="Buscar produtos"
              autoComplete="off"
            />
            <button className="store-header__search-button" type="submit" aria-label="Buscar">
              <Search className="store-header__search-icon" />
            </button>
          </form>

          <div className="store-header__actions">
            <Link className="store-header__action" to={userLink}>
              <User className="store-header__action-icon" />
              <span className="store-header__action-text">
                <span className="store-header__action-caption">
                  {isCustomerLoggedIn ? `Olá, ${userFirstName}` : 'Bem-vindo'}
                </span>
                <span className="store-header__action-label">
                  {isCustomerLoggedIn ? 'Minha conta' : 'Entrar ou cadastrar'}
                </span>
              </span>
            </Link>

            <Link className="store-header__cart" to="/carrinho" aria-label={cartLabel}>
              <ShoppingCart className="store-header__cart-icon" />
              {totalItems > 0 ? (
                <span className="store-header__cart-badge">{totalItems > 99 ? '99+' : totalItems}</span>
              ) : null}
            </Link>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------
          Barra de categorias
          ------------------------------------------------------------------ */}
      <nav className="store-nav" aria-label="Categorias">
        <div className="container store-nav__inner">
          <Link className="store-nav__all" to="/produtos">
            <LayoutGrid className="store-nav__all-icon" />
            Todas as Categorias
          </Link>

          <ul className="store-nav__list">
            {CATEGORY_LINKS.map((link) => {
              const currentPath = `${location.pathname}${location.search}`;
              const isLinkActive = link.end
                ? location.pathname === link.to
                : currentPath === link.to;

              return (
                <li key={link.to} className="store-nav__item">
                  <Link
                    className={classNames(
                      'store-nav__link',
                      isLinkActive && 'store-nav__link--active',
                    )}
                    to={link.to}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ------------------------------------------------------------------
          Conteúdo da página
          ------------------------------------------------------------------ */}
      <main className="store-layout__main">
        <div className="container">
          {children ?? <Outlet />}
        </div>
      </main>

      {/* ------------------------------------------------------------------
          Footer
          ------------------------------------------------------------------ */}
      <footer className="store-footer">
        <div className="container">
          <div className="store-footer__grid">
            <section className="store-footer__column">
              <p className="store-footer__logo">VELOX</p>
              <p className="store-footer__text">
                Periféricos gamer de alta performance para quem leva cada partida a sério.
              </p>
              <h3 className="store-footer__title">Redes sociais</h3>
              <ul className="store-footer__social">
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.label}>
                    <a
                      className="store-footer__social-link"
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            <section className="store-footer__column">
              <h3 className="store-footer__title">Institucional</h3>
              <ul className="store-footer__list">
                {INSTITUTIONAL_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link className="store-footer__link" to={link.to}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="store-footer__column">
              <h3 className="store-footer__title">Minha conta</h3>
              <ul className="store-footer__list">
                {ACCOUNT_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link className="store-footer__link" to={link.to}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="store-footer__column">
              <h3 className="store-footer__title">Atendimento</h3>
              <ul className="store-footer__list">
                <li className="store-footer__contact">
                  <Phone className="store-footer__contact-icon" />
                  <span>(11) 4002-8922</span>
                </li>
                <li className="store-footer__contact">
                  <Mail className="store-footer__contact-icon" />
                  <span>atendimento@velox.com.br</span>
                </li>
                <li className="store-footer__contact">
                  <Clock className="store-footer__contact-icon" />
                  <span>Seg. a sex., das 9h às 18h</span>
                </li>
              </ul>
            </section>
          </div>

          <div className="store-footer__bottom">
            <p className="store-footer__copyright">
              © {new Date().getFullYear()} VELOX. Todos os direitos reservados. Projeto acadêmico.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
