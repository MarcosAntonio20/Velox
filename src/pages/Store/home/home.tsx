/**
 * VELOX — Tela Home (rota "/").
 *
 * Seções: banner hero (carrossel), categorias em destaque, ofertas do dia
 * (carrossel de produtos com preço antigo) e faixa de benefícios.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Flame,
  Headset,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { StoreLayout } from '../../layouts/StoreLayout/StoreLayout';
import { Button } from '../../components/Ui/Button/Button';
import { ProductCard } from '../../components/Ui/ProductCard/ProductCard';
import { getBanners, getCategories, getProducts } from '../../services/productService';
import type { Banner, Category, Product } from '../../types';
import { formatCurrency } from '../../utils/pricing';
import './Home.css';

/** Intervalo de troca automática do banner (ms). */
const HERO_INTERVAL_MS = 5000;

/** Máximo de categorias exibidas em "Categorias em Destaque". */
const MAX_FEATURED_CATEGORIES = 6;

/** Máximo de produtos exibidos em "Ofertas do Dia". */
const MAX_DAILY_OFFERS = 10;

/** Valor mínimo (em reais) para frete grátis, exibido na faixa de benefícios. */
const FREE_SHIPPING_MIN_VALUE = 299;

const HERO_BENEFITS = [
  { id: 'shipping', icon: Truck, label: 'Envio rápido para todo o Brasil' },
  { id: 'security', icon: ShieldCheck, label: 'Compra segura e confiável' },
  { id: 'payment', icon: CreditCard, label: 'Diversas formas de pagamento' },
] as const;

const STORE_BENEFITS = [
  {
    id: 'shipping',
    icon: Truck,
    title: 'Frete grátis',
    description: `em compras acima de ${formatCurrency(FREE_SHIPPING_MIN_VALUE)}`,
  },
  {
    id: 'original',
    icon: ShieldCheck,
    title: 'Produtos originais',
    description: 'com garantia do fabricante',
  },
  {
    id: 'support',
    icon: Headset,
    title: 'Suporte especializado',
    description: 'te ajudamos em todas as etapas',
  },
] as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/** Tempo restante até a meia-noite, no formato "12h 34m 56s". */
function getTimeLeftToday(): string {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(24, 0, 0, 0);

  const diff = Math.max(0, endOfDay.getTime() - now.getTime());
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
}

export function Home() {
  const navigate = useNavigate();

  const [banners, setBanners] = useState<Banner[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [offers, setOffers] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<string>(getTimeLeftToday);

  const offersTrackRef = useRef<HTMLDivElement>(null);

  /* ------------------------------------------------------------------------
     Carga de dados
     ------------------------------------------------------------------------ */
  useEffect(() => {
    let isCancelled = false;

    async function loadHomeData(): Promise<void> {
      try {
        const [heroBanners, allCategories, allProducts] = await Promise.all([
          getBanners({ position: 'hero' }),
          getCategories(),
          getProducts({ sortBy: 'featured' }),
        ]);

        if (isCancelled) {
          return;
        }

        setBanners(heroBanners);
        setCategories(allCategories.slice(0, MAX_FEATURED_CATEGORIES));
        // oldPrice é `number | null`: só entram produtos realmente em oferta.
        setOffers(
          allProducts.filter((product) => product.oldPrice !== null).slice(0, MAX_DAILY_OFFERS),
        );
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Não foi possível carregar a página.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHomeData();

    return () => {
      isCancelled = true;
    };
  }, []);

  /* ------------------------------------------------------------------------
     Carrossel do banner (troca automática)
     ------------------------------------------------------------------------ */
  useEffect(() => {
    if (banners.length < 2) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveBannerIndex((current) => (current + 1) % banners.length);
    }, HERO_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [banners.length]);

  /* ------------------------------------------------------------------------
     Contador "Termina em"
     ------------------------------------------------------------------------ */
  useEffect(() => {
    const intervalId = window.setInterval(() => setTimeLeft(getTimeLeftToday()), 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const handleScrollOffers = (direction: 'prev' | 'next'): void => {
    const track = offersTrackRef.current;

    if (!track) {
      return;
    }

    const step = track.clientWidth * 0.8;
    track.scrollBy({ left: direction === 'next' ? step : -step, behavior: 'smooth' });
  };

  const activeBanner: Banner | undefined = banners[activeBannerIndex];

  /* ------------------------------------------------------------------------
     Render
     ------------------------------------------------------------------------ */
  return (
    <StoreLayout>
      <div className="home">
        {errorMessage && (
          <p className="home__feedback home__feedback--error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading && <p className="home__feedback">Carregando...</p>}

        {/* Banner hero */}
        {activeBanner && (
          <section className="home-hero" aria-label="Destaques">
            <img
              key={activeBanner.id}
              className="home-hero__image"
              src={activeBanner.imageUrl}
              alt={activeBanner.title}
            />

            <div className="home-hero__content">
              <p className="home-hero__subtitle">{activeBanner.subtitle}</p>
              <h1 className="home-hero__title">{activeBanner.title}</h1>
              <Button onClick={() => navigate(activeBanner.linkUrl)}>
                {activeBanner.buttonLabel}
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            </div>

            <ul className="home-hero__benefits">
              {HERO_BENEFITS.map(({ id, icon: Icon, label }) => (
                <li key={id} className="home-hero__benefit">
                  <Icon className="home-hero__benefit-icon" size={36} aria-hidden="true" />
                  <span className="home-hero__benefit-label">{label}</span>
                </li>
              ))}
            </ul>

            {banners.length > 1 && (
              <div className="home-hero__dots">
                {banners.map((banner, index) => (
                  <button
                    key={banner.id}
                    type="button"
                    className={
                      index === activeBannerIndex
                        ? 'home-hero__dot home-hero__dot--active'
                        : 'home-hero__dot'
                    }
                    aria-label={`Ir para o banner ${index + 1}`}
                    aria-current={index === activeBannerIndex}
                    onClick={() => setActiveBannerIndex(index)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Categorias em destaque */}
        {categories.length > 0 && (
          <section className="home-section" aria-labelledby="home-categories-title">
            <header className="home-section__header">
              <h2
                id="home-categories-title"
                className="home-section__title home-section__title--bar"
              >
                Categorias em Destaque
              </h2>
              <Link to="/catalogo" className="home-section__link">
                Ver todas as categorias
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </header>

            <ul className="home-categories">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/catalogo?categoria=${category.slug}`}
                    className="home-categories__card"
                  >
                    <img
                      className="home-categories__image"
                      src={category.imageUrl}
                      alt={category.name}
                    />
                    <span className="home-categories__footer">
                      <span className="home-categories__name">{category.name}</span>
                      <ArrowRight
                        className="home-categories__arrow"
                        size={16}
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Ofertas do dia */}
        {offers.length > 0 && (
          <section className="home-section" aria-labelledby="home-offers-title">
            <header className="home-section__header">
              <div className="home-section__heading">
                <Flame className="home-section__icon" size={28} aria-hidden="true" />
                <h2 id="home-offers-title" className="home-section__title">
                  Ofertas do Dia
                </h2>
                <span className="home-section__line" aria-hidden="true" />
              </div>

              <p className="home-offers__timer">
                <Clock size={16} aria-hidden="true" />
                <span>Termina em:</span>
                <strong className="home-offers__time">{timeLeft}</strong>
              </p>
            </header>

            <div className="home-offers">
              <button
                type="button"
                className="home-offers__arrow home-offers__arrow--prev"
                aria-label="Ofertas anteriores"
                onClick={() => handleScrollOffers('prev')}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>

              <div ref={offersTrackRef} className="home-offers__track">
                {offers.map((product) => (
                  <div key={product.id} className="home-offers__item">
                    <ProductCard product={product}/>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="home-offers__arrow home-offers__arrow--next"
                aria-label="Próximas ofertas"
                onClick={() => handleScrollOffers('next')}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {/* Faixa de benefícios */}
        <section className="home-benefits" aria-label="Vantagens da VELOX">
          {STORE_BENEFITS.map(({ id, icon: Icon, title, description }) => (
            <div key={id} className="home-benefits__item">
              <Icon className="home-benefits__icon" size={40} aria-hidden="true" />
              <div className="home-benefits__text">
                <strong className="home-benefits__title">{title}</strong>
                <span className="home-benefits__description">{description}</span>
              </div>
            </div>
          ))}
        </section>
      </div>
    </StoreLayout>
  );
}

export default Home;