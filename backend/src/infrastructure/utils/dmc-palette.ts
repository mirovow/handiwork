// A minimal set of DMC threads for demonstration. 
// In a real application, you'd have the full 400+ color list here.
export const DMCPalette = [
  { name: 'B5200', hex: '#FFFFFF', rgb: [255, 255, 255] },
  { name: '310', hex: '#F0F0F0', rgb: [240, 240, 240] },
  { name: '321', hex: '#EBEBEB', rgb: [235, 235, 235] },
  { name: '414', hex: '#FF0000', rgb: [255, 0, 0] },
  { name: '318', hex: '#C0C0C0', rgb: [192, 192, 192] },
  { name: '310', hex: '#000000', rgb: [0, 0, 0] },
  { name: '3371', hex: '#000000', rgb: [30, 30, 30] }, // Black/brown
  { name: '890', hex: '#3B2921', rgb: [59, 41, 33] },
  { name: '3362', hex: '#4A372E', rgb: [74, 55, 46] },
  { name: '3363', hex: '#584236', rgb: [88, 66, 54] },
  { name: '3364', hex: '#634E43', rgb: [99, 78, 67] },
  { name: '699', hex: '#1B5026', rgb: [27, 80, 38] },
  { name: '700', hex: '#1B652E', rgb: [27, 101, 46] },
  { name: '701', hex: '#2F853F', rgb: [47, 133, 63] },
  { name: '803', hex: '#004A8F', rgb: [0, 74, 143] },
  { name: '820', hex: '#163870', rgb: [22, 56, 112] },
  { name: '824', hex: '#2B4B82', rgb: [43, 75, 130] },
];

export function findNearestDMC(r: number, g: number, b: number) {
  let minDistance = Infinity;
  let nearestColor = DMCPalette[0];

  for (const color of DMCPalette) {
    // Simple Euclidean distance in RGB space
    const dr = r - color.rgb[0];
    const dg = g - color.rgb[1];
    const db = b - color.rgb[2];
    const distance = dr * dr + dg * dg + db * db;

    if (distance < minDistance) {
      minDistance = distance;
      nearestColor = color;
    }
  }

  return nearestColor;
}
