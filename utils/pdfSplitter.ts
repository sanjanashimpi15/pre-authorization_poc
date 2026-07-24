import { PDFDocument } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite resolves this to a hosted URL for the worker script at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface SplitPage {
    index: number;
    base64Data: string;
    fileName: string;
}

export async function splitPdfIntoPages(file: File, maxPages?: number): Promise<SplitPage[]> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        const totalPages = pdfDoc.getPageCount();
        const cappedPages = maxPages !== undefined ? Math.min(totalPages, maxPages) : totalPages;
        
        const pages: SplitPage[] = [];
        
        for (let i = 0; i < cappedPages; i++) {
            const subDoc = await PDFDocument.create();
            const [copiedPage] = await subDoc.copyPages(pdfDoc, [i]);
            subDoc.addPage(copiedPage);
            const subPdfBytes = await subDoc.save();
            
            // Convert Uint8Array to base64 string
            let binary = '';
            const bytes = new Uint8Array(subPdfBytes);
            const len = bytes.byteLength;
            for (let j = 0; j < len; j++) {
                binary += String.fromCharCode(bytes[j]);
            }
            const base64Data = btoa(binary);
            
            const dotIdx = file.name.lastIndexOf('.');
            const nameBase = dotIdx !== -1 ? file.name.substring(0, dotIdx) : file.name;
            
            pages.push({
                index: i + 1,
                base64Data,
                fileName: `${nameBase}_page_${i + 1}.pdf`
            });
        }
        
        return pages;
    } catch (err) {
        console.error("Error splitting PDF:", err);
        throw new Error("Failed to process and split PDF file. Ensure it is not corrupted.");
    }
}

/**
 * Cheap page-count lookup (no per-page copy/serialize work) — used to
 * detect the true page count of a PDF even when OCR-page splitting is
 * capped at maxPages for cost control.
 */
export async function getPdfPageCount(file: File): Promise<number> {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    return pdfDoc.getPageCount();
}

/**
 * Renders each PDF page to a JPEG data URL thumbnail using pdfjs-dist.
 * Purely a client-side visual preview — does not touch the OCR/extraction pipeline.
 */
export async function renderPdfPageThumbnails(
    file: File,
    maxPages = 100,
    targetWidth = 200,
    onPageStart?: (index: number) => void,
    onPageRendered?: (index: number, dataUrl: string) => void
): Promise<string[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCount = Math.min(pdf.numPages, maxPages);
    const thumbnails: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
        if (onPageStart) {
            onPageStart(i);
        }
        try {
            const page = await pdf.getPage(i);
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = targetWidth / unscaledViewport.width;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                thumbnails.push('');
                if (onPageRendered) onPageRendered(i, '');
                continue;
            }

            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
            thumbnails.push(dataUrl);
            if (onPageRendered) {
                onPageRendered(i, dataUrl);
            }
        } catch (err) {
            console.error(`Error rendering page thumbnail at index ${i}:`, err);
            thumbnails.push('');
            if (onPageRendered) {
                onPageRendered(i, '');
            }
        }
    }

    return thumbnails;
}
