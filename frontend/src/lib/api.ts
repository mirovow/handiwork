const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export type CompletedStitch = {
  stitchId: string;
  completedAt?: string;
};

export type StitchKind = 'full_cross' | 'half_cross' | 'quarter_cross' | 'three_quarter_cross';

export const api = {
  uploadImage: async (
    file: File,
    width: number,
    height: number,
    maxColors: number,
    threadPalette: string,
    selectedStitchKinds: StitchKind[],
    stitchBackground: boolean,
  ) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('width', width.toString());
    formData.append('height', height.toString());
    formData.append('maxColors', maxColors.toString());
    formData.append('threadPalette', threadPalette);
    formData.append('selectedStitchKinds', selectedStitchKinds.join(','));
    formData.append('stitchBackground', stitchBackground.toString());

    const res = await fetch(`${API_URL}/patterns`, {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },

  getPatterns: async () => {
    const res = await fetch(`${API_URL}/patterns`);
    return res.json();
  },

  getThreadPalettes: async () => {
    const res = await fetch(`${API_URL}/patterns/thread-palettes`);
    return res.json();
  },

  getPattern: async (id: string) => {
    const res = await fetch(`${API_URL}/patterns/${id}`);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  deletePattern: async (id: string) => {
    const res = await fetch(`${API_URL}/patterns/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error('Failed to delete pattern');
    }
  },

  getProgress: async (patternId: string) => {
    const res = await fetch(`${API_URL}/progress/${patternId}`);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  saveProgress: async (patternId: string, completedStitches: CompletedStitch[]) => {
    const res = await fetch(`${API_URL}/progress/${patternId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ completedStitches }),
    });
    return res.json();
  },

  addProgressTime: async (patternId: string, elapsedSeconds: number, keepalive = false) => {
    const res = await fetch(`${API_URL}/progress/${patternId}/time`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ elapsedSeconds }),
      keepalive,
    });
    return res.json();
  },

  sendProgressTime: (patternId: string, elapsedSeconds: number) => {
    if (!navigator.sendBeacon) return false;

    const payload = new Blob([JSON.stringify({ elapsedSeconds })], {
      type: 'application/json',
    });
    return navigator.sendBeacon(`${API_URL}/progress/${patternId}/time`, payload);
  },
  
  getImageUrl: (path: string) => {
    return `${API_URL}/${path}`;
  }
};
