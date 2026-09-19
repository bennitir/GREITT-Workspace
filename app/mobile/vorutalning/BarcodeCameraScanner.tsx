"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Labels = {
  openCamera: string;
  closeCamera: string;
  cameraHelp: string;
  cameraSearching: string;
  cameraUnsupported: string;
  cameraPermissionDenied: string;
  cameraUnavailable: string;
};

type BarcodeResult = {
  rawValue?: string;
};

type BarcodeDetectorLike = {
  detect(source: HTMLCanvasElement): Promise<BarcodeResult[]>;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

type WindowWithBarcodeDetector = Window & {
  BarcodeDetector?: BarcodeDetectorConstructor;
};

const SCAN_INTERVAL_MS = 400;
const TARGET_WIDTH = 960;

export default function BarcodeCameraScanner({
  sessionId,
  labels,
}: {
  sessionId: number;
  labels: Labels;
}) {
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

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
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
    const onVisibilityChange = () => {
      if (document.hidden && streamRef.current) stopCamera();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopCamera();
    };
  }, []);

  function scheduleNextScan() {
    clearTimer();
    if (foundRef.current || !streamRef.current) return;

    timerRef.current = window.setTimeout(() => {
      void scanFrame();
    }, SCAN_INTERVAL_MS);
  }

  async function scanFrame() {
    if (scanningRef.current || foundRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;

    if (!video || !canvas || !detector || !streamRef.current) return;

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      scheduleNextScan();
      return;
    }

    scanningRef.current = true;

    try {
      const scale = Math.min(1, TARGET_WIDTH / video.videoWidth);
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));

      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const context = canvas.getContext("2d", {
        alpha: false,
        willReadFrequently: false,
      });

      if (!context) {
        stopCamera();
        setError(labels.cameraUnavailable);
        return;
      }

      context.drawImage(video, 0, 0, width, height);
      const results = await detector.detect(canvas);
      const rawValue = results.find((result) => result.rawValue?.trim())?.rawValue?.trim();

      if (rawValue) {
        foundRef.current = true;
        clearTimer();
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setIsSearching(false);
        router.push(`/mobile/vorutalning?session=${sessionId}&k=${encodeURIComponent(rawValue)}`);
        return;
      }
    } catch {
      // A frame can fail to decode without meaning that the camera session has failed.
    } finally {
      scanningRef.current = false;
    }

    scheduleNextScan();
  }

  async function startCamera() {
    setError(null);
    foundRef.current = false;
    scanningRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(labels.cameraUnavailable);
      return;
    }

    const Detector = (window as WindowWithBarcodeDetector).BarcodeDetector;
    if (!Detector) {
      setError(labels.cameraUnsupported);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      detectorRef.current = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"],
      });
      setIsOpen(true);
      setIsSearching(true);

      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

      const video = videoRef.current;
      if (!video) {
        stopCamera();
        setError(labels.cameraUnavailable);
        return;
      }

      video.srcObject = stream;
      await video.play();
      scheduleNextScan();
    } catch (cameraError) {
      stopCamera();
      const name = cameraError instanceof DOMException ? cameraError.name : "";
      setError(
        name === "NotAllowedError" || name === "PermissionDeniedError"
          ? labels.cameraPermissionDenied
          : labels.cameraUnavailable,
      );
    }
  }

  return (
    <div className="mt-3">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => void startCamera()}
          className="min-h-12 w-full rounded-xl border border-blue-300 bg-white px-4 font-bold text-blue-700"
        >
          📷 {labels.openCamera}
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-300 bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-xl bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="aspect-[4/3] w-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-24 -translate-y-1/2 rounded-xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          </div>
          <p className="mt-3 text-center text-sm font-semibold text-white">
            {isSearching ? labels.cameraSearching : labels.cameraHelp}
          </p>
          <button
            type="button"
            onClick={stopCamera}
            className="mt-3 min-h-11 w-full rounded-xl bg-white px-4 font-bold text-slate-900"
          >
            {labels.closeCamera}
          </button>
        </div>
      )}

      {error ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {error}
        </p>
      ) : null}

      {!isOpen && !error ? (
        <p className="mt-2 text-xs leading-5 text-slate-600">{labels.cameraHelp}</p>
      ) : null}
    </div>
  );
}
