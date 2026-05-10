const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export const api = {
  uploadImage: async (file: File, width: number, height: number, maxColors: number) => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('width', width.toString());
    formData.append('height', height.toString());
    formData.append('maxColors', maxColors.toString());

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

  getPattern: async (id: string) => {
    const res = await fetch(`${API_URL}/patterns/${id}`);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  getProgress: async (patternId: string) => {
    const res = await fetch(`${API_URL}/progress/${patternId}`);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  saveProgress: async (patternId: string, stitchedCoords: Array<{x: number, y: number}>) => {
    const res = await fetch(`${API_URL}/progress/${patternId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ stitchedCoords }),
    });
    return res.json();
  },
  
  getImageUrl: (path: string) => {
    return `${API_URL}/${path}`;
  }
};
