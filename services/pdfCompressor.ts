/**
 * PDF compression helper using client-side pdf.js and pdf-lib
 */
export async function compressPdf(
    file: File,
    onProgress?: (msg: string) => void
): Promise<File> {
    const pdfjs = (window as any).pdfjsLib;
    const PDFLib = (window as any).PDFLib;

    if (!pdfjs || !PDFLib) {
        console.warn("[pdfCompressor] pdf.js or pdf-lib not loaded. Skipping compression.");
        return file;
    }

    if (file.type !== 'application/pdf') {
        return file;
    }

    // Only apply if file size > 8MB
    const limit = 8 * 1024 * 1024;
    if (file.size <= limit) {
        console.log(`[pdfCompressor] File size is ${file.size} bytes (<= 8MB). Skipping compression.`);
        return file;
    }

    console.log(`[pdfCompressor] Starting compression for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)...`);
    onProgress?.("Loading document pages...");

    try {
        const fileData = await file.arrayBuffer();
        const loadingTask = pdfjs.getDocument({ data: fileData });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;

        console.log(`[pdfCompressor] PDF loaded with ${numPages} pages.`);
        const newPdfDoc = await PDFLib.PDFDocument.create();

        for (let i = 0; i < numPages; i++) {
            onProgress?.(`Processing page ${i + 1} of ${numPages}...`);
            const page = await pdfDoc.getPage(i + 1);

            // Native Scale is 72 DPI, render at 200 DPI (approx 2.78x scale)
            const nativeViewport = page.getViewport({ scale: 1.0 });
            const renderViewport = page.getViewport({ scale: 200 / 72 });

            // Render to canvas
            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(renderViewport.width);
            canvas.height = Math.floor(renderViewport.height);
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error("Failed to get 2D context from canvas");
            }

            await page.render({
                canvasContext: ctx,
                viewport: renderViewport
            }).promise;

            // Downsample canvas to JPEG Blob at 80% quality
            const pageJpgBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error("Failed to convert canvas to blob"));
                        return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        if (reader.result instanceof ArrayBuffer) {
                            resolve(reader.result);
                        } else {
                            reject(new Error("Failed to read blob as ArrayBuffer"));
                        }
                    };
                    reader.onerror = () => reject(reader.error);
                    reader.readAsArrayBuffer(blob);
                }, 'image/jpeg', 0.80);
            });

            // Embed JPG image into the new PDF document
            const embeddedImage = await newPdfDoc.embedJpg(pageJpgBuffer);

            // Add new page to PDF with original native dimensions
            const newPage = newPdfDoc.addPage([nativeViewport.width, nativeViewport.height]);
            newPage.drawImage(embeddedImage, {
                x: 0,
                y: 0,
                width: nativeViewport.width,
                height: nativeViewport.height
            });
        }

        onProgress?.("Finalizing compressed document...");
        const compressedPdfBytes = await newPdfDoc.save();

        const compressedFile = new File([compressedPdfBytes], file.name, {
            type: 'application/pdf'
        });

        console.log(`[pdfCompressor] Compressed size: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
        return compressedFile;
    } catch (e) {
        console.error("[pdfCompressor] Compression failed:", e);
        // Fallback to original file if compression fails
        return file;
    }
}
