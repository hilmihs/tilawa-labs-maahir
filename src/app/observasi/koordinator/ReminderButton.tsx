'use client';

import { useState, useTransition } from 'react';
import { reminderKetuaKelas } from './actions';

interface Props {
  targetId: string;
  kelasName: string;
  label?: string;
}

export function ReminderButton({ targetId, kelasName, label }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await reminderKetuaKelas(targetId, kelasName);

      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.waUrl) {
        window.open(result.waUrl, '_blank');
      }
    });
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className="act-btn wa"
        style={{ fontSize: 11 }}
      >
        {pending ? '...' : label ?? 'Reminder'}
      </button>
      {error && <span className="t-small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </>
  );
}
