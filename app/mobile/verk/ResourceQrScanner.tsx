"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { workResourceOperationsText } from "@/lib/i18n/work-resource-operations";

type OpsText = ReturnType<typeof workResourceOperationsText>;

type BarcodeResult = { rawValue?: string };
type BarcodeDetectorLike = { detect(source: HTMLCanvasElement): Promise<BarcodeResult[]> };
type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
type WindowWithBarcodeDetector = Window & { BarcodeDetector?: BarcodeDetectorConstructor };

const SCAN_INTERVAL_MS = 400;
const TARGET_WIDTH = 960;

function normalizeToken(raw: string) {
  const value = raw.trim();
  const direct = /^[0-9a-f]{16}$/i.exec(value)?.[0];
  if (direct) return direct.toLowerCase();
  const prefixed = /(?:GLOGGT:WORK_RESOURCE:|gloggt:\/\/resource\/)([0-9a-f]{16})/i.exec(value)?.[1];
  return prefixed?.toLowerCase() ?? null;
}

export default function ResourceQrScanner({ labels }: { labels: OpsText }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const foundRef = useRef(false);
  const scanningRef = useRef(false);

  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  function clearTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function stopCamera() {
    clearTimer();
    scanningRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    detectorRef.current = null;
    foundRef.current = false;
    setIsSearching(false);
    setIsOpen(false);
  }

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && streamRef.current) stopCamera();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stopCamera();
    };
  }, []);

  function goToRaw(raw: string) {
    const token = normalizeToken(raw);
    if (!token) {
      setError(labels.errors.invalidQr);
      return false;
    }
    stopCamera();
    router.push(`/mobile/verk/tilfong/${token}`);
    return true;
  }

  function schedule() {
    clearTimer();
    if (foundRef.current || !streamRef.current) return;
    timerRef.current = window.setTimeout(() => void scanFrame(), SCAN_INTERVAL_MS);
  }

  async function scanFrame() {
    if (scanningRef.current || foundRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector || !streamRef.current) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      schedule();
      return;
    }

    scanningRef.current = true;
    try {
      const scale = Math.min(1, TARGET_WIDTH / video.videoWidth);
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d", { alpha: false, willReadFrequently: false });
      if (!context) {
        setError(labels.cameraUnavailable);
        stopCamera();
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const results = await detector.detect(canvas);
      const raw = results.find((result) => result.rawValue?.trim())?.rawValue;
      if (raw && normalizeToken(raw)) {
        foundRef.current = true;
        goToRaw(raw);
        return;
      }
    } catch {
      // A failed frame is not a failed camera session.
    } finally {
      scanningRef.current = false;
    }
    schedule();
  }

  async function startCamera() {
    setError(null);
    const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(labels.cameraUnavailable);
      return;
    }
    if (!Detector) {
      setError(labels.cameraUnsupported);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      setIsOpen(true);
      setIsSearching(true);
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (!videoRef.current) throw new Error("video missing");
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      schedule();
    } catch (cameraError) {
      stopCamera();
      const name = cameraError instanceof DOMException ? cameraError.name : "";
      setError(name === "NotAllowedError" || name === "PermissionDeniedError" ? labels.cameraPermissionDenied : labels.cameraUnavailable);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <h2 className="font-bold text-blue-950">{labels.scanResource}</h2>
      {!isOpen ? (
        <button type="button" onClick={() => void startCamera()} className="mt-3 min-h-12 w-full rounded-xl bg-blue-600 px-4 font-bold text-white">
          📷 {labels.openCamera}
        </button>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-[14%] rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.24)]" />
          </div>
          <p className="mt-3 text-center text-sm font-semibold text-white">{isSearching ? labels.scanSearching : labels.scanHelp}</p>
          <button type="button" onClick={stopCamera} className="mt-3 min-h-11 w-full rounded-xl bg-white px-4 font-bold text-slate-900">{labels.closeCamera}</button>
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-blue-900">{labels.scanHelp}</p>
      <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); goToRaw(manual); }}>
        <input value={manual} onChange={(event) => setManual(event.target.value)} placeholder={labels.manualQr} className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-3 text-sm" />
        <button type="submit" className="rounded-xl border border-blue-300 bg-white px-3 py-2 text-sm font-bold text-blue-800">{labels.openResource}</button>
      </form>
      {error ? <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{error}</p> : null}
    </section>
  );
}
