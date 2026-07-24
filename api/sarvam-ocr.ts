import JSZip from 'jszip';
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

export const config = {
  maxDuration: 120, // OCR job polling might take some time
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const { pdfBase64, fileName = 'document.pdf' } = req.body;
  const apiKey = process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Server-side SARVAM_API_KEY is not configured in .env." });
  }

  if (!pdfBase64) {
    return res.status(400).json({ error: "Missing required pdfBase64 body parameter." });
  }

  try {
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    
    // 1. Create Digitization Job
    console.log("[sarvam-ocr] Step 1: Creating job...");
    const createRes = await fetch("https://api.sarvam.ai/doc-digitization/job/v1", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey
      },
      body: JSON.stringify({
        job_parameters: {
          language: "en-IN",
          output_format: "md"
        }
      })
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return res.status(createRes.status).json({ error: `Create job failed: ${errText}` });
    }

    const createData = await createRes.json() as any;
    const jobId = createData.job_id;
    if (!jobId) {
      return res.status(500).json({ error: "Create job response did not return a job_id." });
    }
    console.log(`[sarvam-ocr] Job created: ${jobId}`);

    // 2. Get Upload URLs
    console.log("[sarvam-ocr] Step 2: Fetching upload URLs...");
    const uploadUrlRes = await fetch("https://api.sarvam.ai/doc-digitization/job/v1/upload-files", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey
      },
      body: JSON.stringify({
        job_id: jobId,
        files: [fileName]
      })
    });

    if (!uploadUrlRes.ok) {
      const errText = await uploadUrlRes.text();
      return res.status(uploadUrlRes.status).json({ error: `Retrieve upload URLs failed: ${errText}` });
    }

    const uploadUrlData = await uploadUrlRes.json() as any;
    const presignedUrlVal = uploadUrlData.upload_urls?.[fileName];
    const presignedUrl = typeof presignedUrlVal === 'string' ? presignedUrlVal : presignedUrlVal?.file_url;
    if (!presignedUrl) {
      return res.status(500).json({ error: `No upload URL returned for ${fileName}` });
    }

    // 3. Upload File Binary (PUT request)
    console.log("[sarvam-ocr] Step 3: Uploading binary contents...");
    const uploadBinRes = await fetch(presignedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "x-ms-blob-type": "BlockBlob"
      },
      body: pdfBuffer
    });

    if (!uploadBinRes.ok) {
      const errText = await uploadBinRes.text();
      return res.status(uploadBinRes.status).json({ error: `Binary file upload failed: ${errText}` });
    }

    // 4. Start Job
    console.log("[sarvam-ocr] Step 4: Starting job execution...");
    const startRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey
      },
      body: JSON.stringify({})
    });

    if (!startRes.ok) {
      const errText = await startRes.text();
      return res.status(startRes.status).json({ error: `Start job failed: ${errText}` });
    }

    // 5. Poll Job Status
    console.log("[sarvam-ocr] Step 5: Polling job status...");
    let jobState = "Running";
    let attempts = 0;
    const maxAttempts = 30; // Max 90 seconds polling
    
    while (attempts < maxAttempts) {
      attempts++;
      const statusRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/status`, {
        method: "GET",
        headers: {
          "api-subscription-key": apiKey
        }
      });

      if (statusRes.ok) {
        const statusData = await statusRes.json() as any;
        jobState = statusData.job_state;
        console.log(`[sarvam-ocr] Poll attempt ${attempts}: state is ${jobState}`);
        
        if (jobState === "Completed") {
          break;
        } else if (jobState === "Failed") {
          return res.status(500).json({ error: "Sarvam job execution failed on the server." });
        }
      } else {
        console.warn(`[sarvam-ocr] Failed status check (attempt ${attempts}): ${statusRes.status}`);
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    if (jobState !== "Completed") {
      return res.status(504).json({ error: "Polling Sarvam OCR job timed out." });
    }

    // 6. Download Results
    console.log("[sarvam-ocr] Step 6: Fetching download URLs...");
    const downloadRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/download-files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": apiKey
      },
      body: JSON.stringify({})
    });

    if (!downloadRes.ok) {
      const errText = await downloadRes.text();
      return res.status(downloadRes.status).json({ error: `Fetch download URLs failed: ${errText}` });
    }

    const downloadData = await downloadRes.json() as any;
    const downloadUrls = downloadData.download_urls || {};
    // Find zip file download URL
    const zipFileName = Object.keys(downloadUrls).find(k => k.endsWith('.zip'));
    const zipVal = zipFileName ? downloadUrls[zipFileName] : null;
    const zipUrl = typeof zipVal === 'string' ? zipVal : zipVal?.file_url;

    if (!zipUrl) {
      return res.status(500).json({ error: "No output ZIP file download link was returned." });
    }

    // 7. Fetch ZIP and Extract Text
    console.log("[sarvam-ocr] Step 7: Fetching ZIP and extracting content...");
    const zipFetchRes = await fetch(zipUrl);
    if (!zipFetchRes.ok) {
      return res.status(zipFetchRes.status).json({ error: "Failed to download job output ZIP file." });
    }

    const zipArrayBuffer = await zipFetchRes.arrayBuffer();
    const zip = await JSZip.loadAsync(zipArrayBuffer);
    
    let markdownText = '';
    const pageTexts: Record<number, string> = {};

    for (const [filename, fileObj] of Object.entries(zip.files)) {
      if (filename.endsWith('.md')) {
        markdownText = await fileObj.async('string');
      } else if (filename.endsWith('.json')) {
        try {
          const jsonContent = await fileObj.async('string');
          const data = JSON.parse(jsonContent);
          if (data) {
            const pageNum = data.page_num || data.page;
            if (pageNum !== undefined) {
              const blocks = data.blocks || [];
              const text = blocks.map((b: any) => b.text || '').join('\n');
              pageTexts[pageNum] = text.trim();
            } else if (Array.isArray(data.pages)) {
              data.pages.forEach((pageObj: any) => {
                const pNum = pageObj.page_number || pageObj.page;
                if (pNum) {
                  const blocks = pageObj.blocks || [];
                  const text = blocks.map((b: any) => b.text || '').join('\n');
                  pageTexts[pNum] = text.trim();
                }
              });
            }
          }
        } catch (err) {
          console.error("[sarvam-ocr] Error parsing JSON file inside ZIP:", err);
        }
      }
    }

    // Fallback: if pageTexts is empty, split markdownText by horizontal lines or form feeds
    if (Object.keys(pageTexts).length === 0 && markdownText) {
      console.log("[sarvam-ocr] Falling back to markdown splitting...");
      // Split by form feeds or horizontal rules
      const chunks = markdownText.split(/\f|\n\s*---\s*\n/);
      chunks.forEach((chunk, index) => {
        pageTexts[index + 1] = chunk.trim();
      });
    }

    return res.status(200).json({ pageTexts });

  } catch (error: any) {
    console.error("[sarvam-ocr] Exception in handler:", error);
    return res.status(500).json({ error: error.message || "Failed to execute Sarvam OCR proxy." });
  }
}
