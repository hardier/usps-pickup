'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';
type Step = { text: string; done: boolean };

export default function HomePage() {
  const [packages, setPackages] = useState(1);
  const [weight, setWeight] = useState(0.2);
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);

  function addStep(text: string) {
    setSteps((prev) => {
      // Mark the previous step as done
      const updated = prev.map((s, i) =>
        i === prev.length - 1 ? { ...s, done: true } : s,
      );
      return [...updated, { text, done: false }];
    });
  }

  function finishSteps() {
    setSteps((prev) => prev.map((s) => ({ ...s, done: true })));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    setConfirmation('');
    setSteps([]);

    try {
      const res = await fetch('/api/schedule-pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages, weight }),
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE messages are separated by \n\n
        const messages = buffer.split('\n\n');
        buffer = messages.pop() ?? '';

        for (const msg of messages) {
          if (!msg.trim()) continue;

          let eventType = 'message';
          let dataStr = '';

          for (const line of msg.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
            if (line.startsWith('data: '))  dataStr   = line.slice(6).trim();
          }

          if (!dataStr) continue;

          try {
            const parsed = JSON.parse(dataStr);

            if (eventType === 'progress') {
              addStep(parsed.step);
            } else if (eventType === 'done') {
              finishSteps();
              setStatus(parsed.success ? 'success' : 'error');
              setMessage(parsed.message ?? '');
              setConfirmation(parsed.confirmationNumber ?? '');
            }
          } catch {
            // malformed SSE data — ignore
          }
        }
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <span className="bg-blue-900 text-white text-sm font-bold px-2 py-0.5 rounded">
            USPS
          </span>
          <h1 className="text-lg font-semibold text-gray-800">Schedule Pickup</h1>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-6 text-xs text-gray-500 space-y-0.5">
          <p className="font-medium text-gray-600">Erzhen Lin</p>
          <p>3931 Duncan Pl, Palo Alto CA 94306</p>
          <p className="text-gray-400">Front door · Regular delivery · Next business day</p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Packages (USPS Ground Advantage)
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={packages}
              onChange={(e) => setPackages(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Estimated Total Weight (lbs)
            </span>
            <input
              type="number"
              min={0}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-2.5 bg-blue-900 hover:bg-blue-800 disabled:bg-blue-300 text-white font-semibold rounded-lg text-sm transition-colors"
          >
            {status === 'loading' ? 'Scheduling…' : 'Schedule Pickup'}
          </button>
        </form>

        {/* Step progress */}
        {steps.length > 0 && (
          <ul className="mt-5 space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                {step.done ? (
                  <svg
                    className="w-4 h-4 flex-shrink-0 text-green-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 00-1.414 0L8 12.586 4.707 9.293a1 1 0 00-1.414 1.414l4 4a1 1 0 001.414 0l8-8a1 1 0 000-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-4 h-4 flex-shrink-0 text-blue-500 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                    />
                  </svg>
                )}
                <span className={step.done ? 'text-gray-400' : 'text-blue-700 font-medium'}>
                  {step.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Result */}
        {status === 'success' && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
            <p className="font-semibold text-green-700">Pickup Scheduled!</p>
            <p className="mt-1 text-green-600">{message}</p>
            {confirmation && (
              <p className="mt-1 font-medium text-green-700">
                Confirmation #: {confirmation}
              </p>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            <p className="font-semibold text-red-700">Error</p>
            <p className="mt-1 text-red-600">{message}</p>
          </div>
        )}
      </div>
    </main>
  );
}
