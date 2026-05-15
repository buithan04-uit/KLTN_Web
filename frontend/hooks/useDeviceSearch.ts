import { useState } from 'react';

/**
 * Manages device ID search state: a "committed" deviceId and a draft inputDeviceId.
 * The committed value changes only on form submit.
 */
export function useDeviceSearch(initial = 'DEV_01') {
  const [deviceId, setDeviceId] = useState(initial);
  const [inputDeviceId, setInputDeviceId] = useState(initial);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setDeviceId(inputDeviceId.trim());
  };

  return { deviceId, inputDeviceId, setInputDeviceId, handleSearch };
}
