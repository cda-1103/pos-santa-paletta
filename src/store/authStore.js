import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export const useAuthStore = create((set) => ({
  user: null,
  profile: null,
  loading: true,
  
  checkSession: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      // Buscar el perfil y rol del usuario
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      set({ user: session.user, profile: profile, loading: false });
    } else {
      set({ user: null, profile: null, loading: false });
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // La sesión se actualizará automáticamente con checkSession
    await useAuthStore.getState().checkSession();
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  }
}));