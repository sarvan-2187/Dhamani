// PRD 10.2: read the slip on the phone with Tesseract.js (no paid OCR, the image is not sent anywhere for OCR).
// English plus the reader's script only, to keep the download small on mobile data.
export async function readSlip(file: File, uiLang: string): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const langs = ["eng", ...(uiLang === "ta" ? ["tam"] : uiLang === "te" ? ["tel"] : [])];
  const worker = await createWorker(langs);
  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
