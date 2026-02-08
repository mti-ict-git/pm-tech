export type ScanQrResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export const scanQrCodeValue = async (): Promise<ScanQrResult> => {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) {
      return { ok: false, message: 'QR scan is only available on Android app' };
    }

    const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');

    const supportedRes = await BarcodeScanner.isSupported();
    if (!supportedRes.supported) {
      return { ok: false, message: 'QR scan is not supported on this device' };
    }

    const perms = await BarcodeScanner.requestPermissions();
    if (perms.camera !== 'granted' && perms.camera !== 'limited') {
      return { ok: false, message: 'Camera permission is required to scan QR' };
    }

    try {
      const res = await BarcodeScanner.scan();
      const value = res.barcodes[0]?.rawValue?.trim() ?? '';
      if (!value) return { ok: false, message: 'No code detected' };
      return { ok: true, value };
    } catch {
      try {
        const module = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (!module.available) {
          await BarcodeScanner.installGoogleBarcodeScannerModule();
          return { ok: false, message: 'Installing scanner module. Try again in a moment.' };
        }
      } catch {}
      return { ok: false, message: 'Failed to scan code' };
    }
  } catch {
    return { ok: false, message: 'Failed to scan code' };
  }
};
