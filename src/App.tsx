import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';

// Ajuste o caminho/nome caso o Claude tenha salvado a Home em outra pasta
import { Home } from './pages/home/home';
import {Catalogo} from './pages/catalogo/catalogo';
import { Busca } from './pages/busca/busca';
import { Produto } from './pages/produto/produto';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/catalogo" element={<Catalogo />} />
              <Route path="/busca" element={<Busca />} />
              <Route path="/produto/:slug" element={<Produto />} />

              {/* Adicione aqui as próximas telas conforme forem ficando prontas */}

              {/* Evita tela branca se você clicar em um link ainda não criado */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;