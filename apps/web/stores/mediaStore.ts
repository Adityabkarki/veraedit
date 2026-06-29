'use client'

import { create } from 'zustand'

export type MediaType = 'video' | 'audio' | 'image'

export interface MediaItem {
  id: string
  name: string
  type: MediaType
  url: string
  thumbnailUrl?: string
  fileSize?: number
}

export interface MediaState {
  items: MediaItem[]
  setItems: (items: MediaItem[]) => void
  addItem: (item: MediaItem) => void
  removeItem: (id: string) => void
  clearItems: () => void
}

export const useMediaStore = create<MediaState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  clearItems: () => set({ items: [] }),
}))
