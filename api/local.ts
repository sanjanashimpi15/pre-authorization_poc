import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const config = {
  maxDuration: 300, // PaddleOCR cold-load (fresh model init per subprocess) can be slow
};

const PIPELINE_ROOT = process.env.LOCAL_PIPELINE_ROOT
  || 'C:\\Users\\sanja\\.gemini\\antigravity\\scratch\\claims-ocr-pipeline';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { pdfBase64, docId } = req.body;
  if (!pdfBase64 || !docId) {
    return res.status(400).json({ error: 'pdfBase64 and docId are required.' });
  }

  const tempPdfPath = path.join(os.tmpdir(), `${docId}.pdf`);

  try {
    fs.writeFileSync(tempPdfPath, Buffer.from(pdfBase64, 'base64'));

    await new Promise<void>((resolve, reject) => {
      execFile(
        'python',
        ['run.py', '--input', tempPdfPath, '--doc-id', docId],
        { cwd: PIPELINE_ROOT, timeout: 280000, maxBuffer: 1024 * 1024 * 20 },
        (error, _stdout, stderr) => {
          if (error) {
            reject(new Error(`Local pipeline failed: ${error.message}\n${stderr}`));
          } else {
            resolve();
          }
        }
      );
    });

    const outputPath = path.join(PIPELINE_ROOT, 'output', `${docId}.json`);
    const markdownPath = path.join(PIPELINE_ROOT, 'intermediate', 'markdown', `${docId}.md`);

    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ error: `Pipeline completed but output file not found: ${outputPath}` });
    }

    const pythonOutput = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const markdownText = fs.existsSync(markdownPath) ? fs.readFileSync(markdownPath, 'utf-8') : '';

    return res.status(200).json({ pythonOutput, markdownText });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Local pipeline execution failed.' });
  } finally {
    try { fs.unlinkSync(tempPdfPath); } catch { /* best-effort cleanup */ }
  }
}
