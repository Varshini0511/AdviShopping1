// src/components/ChatWidget.tsx
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };

const STARTER =
  "Hi! I can search products and add things to your cart or wishlist. Try typing — or tap the mic and say \"add a wireless headphone to my cart\".";

// The Web Speech API isn't in the standard TS DOM lib, so we describe the tiny
// slice we use. It's browser-native (Chrome/Edge/Safari) — no dependency, no key.
type SpeechRecognitionResultLike = { transcript: string };
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>;
};
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: STARTER }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);

  const [voiceError, setVoiceError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // The transcript lives in a ref, not state: `onend` fires outside React's
  // render cycle, so reading it from state there is unreliable (and calling
  // send() inside a setState updater is impure — StrictMode double-invokes it).
  const transcriptRef = useRef('');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  // Detect voice support once on the client.
  useEffect(() => {
    setVoiceSupported(!!getSpeechRecognition() && 'speechSynthesis' in window);
  }, []);

  // Read an assistant reply aloud (if voice output is on).
  const speak = useCallback(
    (text: string) => {
      if (!speakReplies || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel(); // interrupt any in-progress speech
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1;
      window.speechSynthesis.speak(utter);
    },
    [speakReplies]
  );

  // Accepts optional text so a voice transcript can be sent directly, without
  // waiting on the async setState of `input`.
  const send = useCallback(
    async (override?: string) => {
      const text = (override ?? input).trim();
      if (!text || loading) return;
      const next: Message[] = [...messages, { role: 'user', content: text }];
      setMessages(next);
      setInput('');
      setLoading(true);
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next }),
        });
        const data = await res.json();
        const reply = data.reply || data.error || 'Something went wrong.';
        setMessages([...next, { role: 'assistant', content: reply }]);
        speak(reply);
      } catch {
        const reply = 'Sorry, I had trouble reaching the assistant.';
        setMessages([...next, { role: 'assistant', content: reply }]);
        speak(reply);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, speak]
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || loading) return;

    // Stop any spoken reply so the mic doesn't hear the assistant.
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const recognition = new Ctor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      const transcript = Array.from(
        { length: e.results.length },
        (_, i) => e.results[i][0].transcript
      ).join('');
      transcriptRef.current = transcript;
      setInput(transcript); // live feedback in the box while speaking
    };

    // Surface failures instead of swallowing them — otherwise a denied mic
    // permission or a dropped connection looks exactly like "nothing happened".
    recognition.onerror = (e) => {
      const messages: Record<string, string> = {
        'not-allowed': 'Microphone blocked. Allow mic access in your browser (padlock icon in the address bar), then try again.',
        'service-not-allowed': 'Microphone blocked by browser policy. Allow mic access and retry.',
        'audio-capture': 'No microphone found. Check that one is connected and enabled.',
        'no-speech': "I didn't hear anything — tap the mic and speak a little louder.",
        network: 'Speech recognition needs an internet connection and it failed to reach the service.',
        aborted: '',
      };
      const msg = messages[e.error] ?? `Speech recognition failed (${e.error}).`;
      if (msg) setVoiceError(msg);
      setListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const text = transcriptRef.current.trim();
      if (text) {
        void send(text);
      } else {
        setVoiceError((prev) => prev ?? "I didn't catch that — tap the mic and try again.");
      }
    };

    transcriptRef.current = '';
    recognitionRef.current = recognition;
    setVoiceError(null);
    setInput('');
    setListening(true);

    try {
      recognition.start();
    } catch {
      // start() throws if called while an earlier session is still active.
      setListening(false);
      recognitionRef.current = null;
      setVoiceError('Could not start listening. Try again in a moment.');
    }
  }, [loading, send]);

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open && (
        <div className="mb-3 flex h-[28rem] w-80 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800/60 px-4 py-3">
            <span className="text-sm font-semibold text-slate-100">🛍️ Shopping Assistant</span>
            <div className="flex items-center gap-2">
              {voiceSupported && (
                <button
                  onClick={() => {
                    setSpeakReplies((v) => {
                      if (v && 'speechSynthesis' in window) window.speechSynthesis.cancel();
                      return !v;
                    });
                  }}
                  className="text-slate-400 hover:text-white"
                  title={speakReplies ? 'Mute spoken replies' : 'Unmute spoken replies'}
                  aria-label={speakReplies ? 'Mute spoken replies' : 'Unmute spoken replies'}
                >
                  {speakReplies ? '🔊' : '🔇'}
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white" aria-label="Close">
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-100'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl bg-slate-800 px-3 py-2 text-sm text-slate-400">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {voiceError && (
            <div className="border-t border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              🎤 {voiceError}
            </div>
          )}

          <div className="flex gap-2 border-t border-slate-800 p-3">
            {voiceSupported && (
              <button
                onClick={listening ? stopListening : startListening}
                disabled={loading}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold transition disabled:opacity-50 ${
                  listening
                    ? 'animate-pulse bg-red-600 text-white hover:bg-red-500'
                    : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                }`}
                title={listening ? 'Stop listening' : 'Speak'}
                aria-label={listening ? 'Stop listening' : 'Speak'}
              >
                🎤
              </button>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder={listening ? 'Listening…' : 'Add headphones to my cart…'}
              className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              onClick={() => send()}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-2xl text-white shadow-lg shadow-indigo-900/40 transition hover:bg-indigo-500"
        aria-label="Open shopping assistant"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  );
}
