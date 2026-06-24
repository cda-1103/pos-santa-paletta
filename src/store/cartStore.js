import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useCartStore = create((set, get) => ({
  items: [],
  tasaCambio: 473.87, // Valor por defecto, se actualizará desde la base de datos
  
  // Acciones del carrito
  addItem: (product) => {
    const currentItems = get().items;
    const existingItem = currentItems.find(item => item.id === product.id);
    
    if (existingItem) {
      set({
        items: currentItems.map(item => 
          item.id === product.id 
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        )
      });
    } else {
      set({ items: [...currentItems, { ...product, cantidad: 1 }] });
    }
  },

  removeItem: (productId) => {
    set({ items: get().items.filter(item => item.id !== productId) });
  },

  updateQuantity: (productId, amount) => {
    set({
      items: get().items.map(item => {
        if (item.id === productId) {
          const newQuantity = item.cantidad + amount;
          return newQuantity > 0 ? { ...item, cantidad: newQuantity } : item;
        }
        return item;
      })
    });
  },

  clearCart: () => set({ items: [] }),

  // Cargar la tasa desde Supabase
  fetchSettings: async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('tasa_bcv, tasa_personalizada, usar_tasa_personalizada')
      .single();
      
    if (!error && data) {
      const activeRate = data.usar_tasa_personalizada ? data.tasa_personalizada : data.tasa_bcv;
      set({ tasaCambio: activeRate });
    }
  },

  // Cálculos totales
  getTotalUsd: () => {
    return get().items.reduce((total, item) => total + (item.precio_usd * item.cantidad), 0);
  },
  
  getTotalBs: () => {
    const totalUsd = get().getTotalUsd();
    return totalUsd * get().tasaCambio;
  }
}));