import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, SwitchCamera, AlertCircle, Upload } from 'lucide-react';
import { Button } from '../common/Button.js';

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (result: string) => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanResult,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    hasScannedRef.current = false;
    setError(null);

    const initScanner = async () => {
      try {
        // Start with OS-preferred primary rear camera (continuous autofocus) first,
        // and also enumerate cameras so user can switch if desired.
        void startScanning({ facingMode: 'environment' });

        const devices = await Html5Qrcode.getCameras().catch(() => []);
        if (!mounted) return;
        if (devices && devices.length > 0) {
          setCameras(devices);
          const backCam = devices.find((d) => /back|rear|environment/i.test(d.label));
          setSelectedCameraId(backCam ? backCam.id : devices[0]!.id);
        }
      } catch {
        if (!mounted) return;
        setError('Camera permission denied or camera unavailable. You can upload a QR image.');
      }
    };

    void initScanner();

    return () => {
      mounted = false;
      void stopScanning();
    };
  }, [isOpen]);

  const startScanning = async (cameraIdOrConfig: string | { facingMode: string }) => {
    try {
      await stopScanning();

      const scanner = new Html5Qrcode('qr-scanner-view', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
        verbose: false,
      });
      scannerRef.current = scanner;

      await scanner.start(
        cameraIdOrConfig,
        {
          fps: 20,
          aspectRatio: 1,
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(180, Math.floor(minEdge * 0.8));
            return { width: size, height: size };
          },
          videoConstraints: {
            ...(typeof cameraIdOrConfig === 'string'
              ? { deviceId: { exact: cameraIdOrConfig } }
              : { facingMode: cameraIdOrConfig.facingMode }),
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        (decodedText) => {
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          void stopScanning().finally(() => {
            onScanResult(decodedText);
            onClose();
          });
        },
        () => {},
      );
    } catch (err) {
      // Fallback: if facingMode constraint failed on desktop without rear cam, try default camera
      if (typeof cameraIdOrConfig !== 'string') {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
            setSelectedCameraId(devices[0]!.id);
            await startScanning(devices[0]!.id);
            return;
          }
        } catch {
          // Fall through to error display
        }
      }
      setError((err as Error).message || 'Failed to start camera.');
    }
  };

  const stopScanning = async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch {
        // Ignore stop error
      }
      scannerRef.current = null;
    }
  };

  const handleCameraSwitch = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamId = cameras[nextIndex]!.id;
    setSelectedCameraId(nextCamId);
    void startScanning(nextCamId);
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0]!;
    e.target.value = '';
    try {
      await stopScanning();
      const scanner = new Html5Qrcode('qr-scanner-view', {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false,
      });
      const result = await scanner.scanFile(file, false);
      scanner.clear();
      if (!hasScannedRef.current) {
        hasScannedRef.current = true;
        onScanResult(result);
        onClose();
      }
    } catch {
      setError('Could not detect a QR code in the uploaded image.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-sm rounded-xl bg-card border border-border shadow-2xl p-5 flex flex-col drooit-card">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-foreground">
              <Camera className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground font-display">Optical Scanner</h3>
              <p className="text-[11px] text-muted-foreground">Align pairing code in viewfinder</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-yellow-500 dark:text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
              LIVE
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewport with Optical HUD Reticle */}
        <div className="relative my-3.5 aspect-square w-full rounded-lg overflow-hidden bg-black flex items-center justify-center border border-border">
          <div id="qr-scanner-view" className="w-full h-full [&_video]:object-cover [&_video]:w-full [&_video]:h-full" />

          {/* Optical Viewfinder Overlay (HUD) */}
          {!error && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6">
              {/* Corner Reticles in Signal Yellow */}
              <div className="absolute top-5 left-5 w-7 h-7 border-t-2 border-l-2 border-yellow-400 rounded-tl-sm shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
              <div className="absolute top-5 right-5 w-7 h-7 border-t-2 border-r-2 border-yellow-400 rounded-tr-sm shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
              <div className="absolute bottom-5 left-5 w-7 h-7 border-b-2 border-l-2 border-yellow-400 rounded-bl-sm shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
              <div className="absolute bottom-5 right-5 w-7 h-7 border-b-2 border-r-2 border-yellow-400 rounded-br-sm shadow-[0_0_8px_rgba(250,204,21,0.5)]" />

              {/* Sweeping Laser Line */}
              <div className="absolute left-6 right-6 h-[2px] bg-yellow-400 animate-laser shadow-[0_0_12px_#facc15]" />

              {/* Subtle Center Target Reticle */}
              <div className="my-auto relative flex items-center justify-center w-12 h-12 opacity-30">
                <div className="w-full h-[1px] bg-yellow-400" />
                <div className="absolute h-full w-[1px] bg-yellow-400" />
              </div>

              {/* Status HUD Pill */}
              <div className="z-10 px-2.5 py-1 rounded bg-black/80 border border-yellow-400/40 text-[10px] font-mono tracking-wider text-yellow-400 font-bold uppercase flex items-center gap-1.5 backdrop-blur-md shadow-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                ALIGN QR WITHIN RETICLE
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-5 text-center bg-card/95 text-muted-foreground z-20">
              <AlertCircle className="w-7 h-7 text-destructive mb-2" />
              <p className="text-xs mb-3 font-medium leading-relaxed">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs h-8 rounded-md"
              >
                <Upload className="w-3.5 h-3.5 mr-1" />
                Upload Image
              </Button>
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileScan}
        />

        {/* Footer controls */}
        <div className="flex items-center justify-between pt-1">
          {cameras.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCameraSwitch}
              className="text-xs h-8 px-3 rounded-md font-medium"
            >
              <SwitchCamera className="w-3.5 h-3.5 mr-1.5" />
              Switch Camera
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs h-8 px-3 rounded-md ml-auto font-medium text-muted-foreground"
          >
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload QR Image
          </Button>
        </div>
      </div>
    </div>
  );
};
