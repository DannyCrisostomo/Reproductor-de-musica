// library-store.js
// Estado de "My library": favoritos, playlists y recientes.
// Sin dependencias. En React se conecta con useSyncExternalStore.

const KEY = 'playlist-app:library:v1';
const MAX_RECENTS = 30;

// Formato único de ítem (canciones y emisoras):
// { id, type: 'song' | 'radio', title, subtitle, cover, url }

const empty = () => ({ favorites: [], playlists: [], recents: [] });

function load() {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return empty();
  }
}

let state = load();
const listeners = new Set();

function commit(next) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar la biblioteca', e);
  }
  listeners.forEach((fn) => fn(state));
}

export const library = {
  // --- lectura / suscripción (compatible con useSyncExternalStore) ---
  getState: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // --- favoritos ---
  isFavorite: (id) => state.favorites.some((i) => i.id === id),
  toggleFavorite(item) {
    const favorites = this.isFavorite(item.id)
      ? state.favorites.filter((i) => i.id !== item.id)
      : [item, ...state.favorites];
    commit({ ...state, favorites });
  },

  // --- recientes ---
  addRecent(item) {
    const recents = [item, ...state.recents.filter((i) => i.id !== item.id)].slice(0, MAX_RECENTS);
    commit({ ...state, recents });
  },
  clearRecents: () => commit({ ...state, recents: [] }),

  // --- playlists ---
  createPlaylist(name) {
    const pl = { id: crypto.randomUUID(), name: name.trim() || 'Nueva playlist', items: [] };
    commit({ ...state, playlists: [...state.playlists, pl] });
    return pl.id;
  },
  renamePlaylist(id, name) {
    commit({
      ...state,
      playlists: state.playlists.map((p) => (p.id === id ? { ...p, name } : p)),
    });
  },
  deletePlaylist(id) {
    commit({ ...state, playlists: state.playlists.filter((p) => p.id !== id) });
  },
  addToPlaylist(id, item) {
    commit({
      ...state,
      playlists: state.playlists.map((p) =>
        p.id === id && !p.items.some((i) => i.id === item.id)
          ? { ...p, items: [...p.items, item] }
          : p
      ),
    });
  },
  removeFromPlaylist(id, itemId) {
    commit({
      ...state,
      playlists: state.playlists.map((p) =>
        p.id === id ? { ...p, items: p.items.filter((i) => i.id !== itemId) } : p
      ),
    });
  },
};

/* ------------------------------------------------------------------
   USO EN JS PURO
   ------------------------------------------------------------------
   import { library } from './library-store.js';

   // Estrella de una tarjeta
   starBtn.addEventListener('click', () => library.toggleFavorite(item));

   // Al reproducir algo
   library.addRecent(item);

   // Re-renderizar My library cuando algo cambie
   library.subscribe((s) => renderLibrary(s));

   ------------------------------------------------------------------
   USO EN REACT (más adelante)
   ------------------------------------------------------------------
   import { useSyncExternalStore } from 'react';

   export const useLibrary = () =>
     useSyncExternalStore(library.subscribe, library.getState);

   // const { favorites, playlists, recents } = useLibrary();
------------------------------------------------------------------ */