import { useNavigate, useLocation } from 'react-router-dom';

export default function SidebarMenu({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: 'Terminal de Ventas (POS)', path: '/pos', icon: '🛒' },
    { name: 'Panel Administrativo', path: '/admin', icon: '⚙️' }
  ];

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose}></div>
      )}

      <div className={`fixed top-0 left-0 h-full w-72 bg-white shadow-2xl z-50 transform transition-transform duration-300 ${isOpen ? 'translate-x-0' : '-translate-x-full'} flex flex-col`}>
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-900 text-white">
          <h2 className="font-black text-xl tracking-widest uppercase">Santa Paletta</h2>
          <button onClick={onClose} className="text-2xl font-bold hover:text-gray-300 transition-colors">✕</button>
        </div>
        
        <nav className="p-4 space-y-2 flex-1 overflow-y-auto bg-gray-50">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => { navigate(item.path); onClose(); }}
                className={`w-full flex items-center gap-3 px-4 py-4 rounded-xl font-bold transition-all ${isActive ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'}`}
              >
                <span className="text-xl">{item.icon}</span>
                {item.name}
              </button>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-200 bg-white">
          <p className="text-xs text-center text-gray-400 font-bold">Versión 1.0.0</p>
        </div>
      </div>
    </>
  );
}