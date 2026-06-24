import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Login from './pages/Login';
import POS from './pages/POS';
import Admin from './pages/Admin';

function App() {
  const { user, profile, loading, checkSession } = useAuthStore();

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-8 w-8 bg-gray-300 rounded-full mb-4"></div>
          <p className="text-gray-500 font-medium">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Si no hay usuario en sesión, forzar la vista de login */}
        {!user ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            {/* Rutas protegidas */}
            <Route path="/pos" element={<POS />} />
            
            {/* Ruta exclusiva para administradores */}
            {profile?.rol === 'admin' && (
              <Route path="/admin/*" element={<Admin />} />
            )}

            {/* Redirección por defecto según el nivel de acceso */}
            <Route 
              path="*" 
              element={<Navigate to={profile?.rol === 'admin' ? '/admin' : '/pos'} replace />} 
            />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}

export default App;