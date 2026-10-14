import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the browser Web Speech API (not in the TS DOM lib). */
interface SpeechResult {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}
interface SpeechEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;

const isElectron = () => /Electron/i.test(navigator.userAgent);
function recognitionCtor(): RecognitionCtor | null {
  // Electron ships the API but has no speech service behind it, so it always fails.
  if (isElectron()) return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MESSAGES: Record<string, string> = {
  "not-allowed":
    "Microphone access is blocked. Allow it in your browser settings.",
  "service-not-allowed":
    "Microphone access is blocked. Allow it in your browser settings.",
  "audio-capture": "No microphone was found.",
  network: "Dictation needs an internet connection in this browser.",
};

/**
 * Browser dictation into the composer. Speech is transcribed by the browser's own
 * speech service (in Chrome, Google's); Socius never receives audio.
 * `base` is the text already typed, so dictation appends instead of replacing it.
 */
export function useDictation(onText: (text: string) => void) {
  const rec = useRef<Recognition | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const supported = !!recognitionCtor();

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(
    (base: string) => {
      const Ctor = recognitionCtor();
      if (!Ctor) {
        setError(
          isElectron()
            ? "Use macOS Dictation here: press Fn twice, then speak. On your phone, tap the mic."
            : "This browser doesn't support dictation. Try Chrome.",
        );
        return;
      }
      setError("");
      const r = new Ctor();
      r.lang = navigator.language || "en-IN";
      r.continuous = true;
      r.interimResults = true;
      const lead = base && !/\s$/.test(base) ? `${base} ` : base;
      let finals = "";
      r.onresult = (e) => {
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i]!;
          if (res.isFinal) finals += res[0].transcript;
          else interim += res[0].transcript;
        }
        onText(lead + finals + interim);
      };
      r.onerror = (e) => {
        if (e.error !== "no-speech" && e.error !== "aborted")
          setError(MESSAGES[e.error] ?? "Dictation stopped. Try again.");
      };
      r.onend = () => {
        setListening(false);
        rec.current = null;
      };
      rec.current = r;
      r.start();
      setListening(true);
    },
    [onText],
  );

  useEffect(() => () => rec.current?.stop(), []);
  return {
    supported,
    listening,
    error,
    start,
    stop,
    clearError: () => setError(""),
  };
}
