// src/app/icon.tsx — the browser-tab favicon (matches the navbar wordmark).

import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          fontSize: 22,
          fontWeight: 800,
        }}
      >
        A
      </div>
    ),
    size
  );
}
