import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';

dotenv.config();

const apiKey = process.env.SARVAM_API_KEY || process.env.VITE_SARVAM_API_KEY;

async function testZip() {
  console.log("=== Inspecting Sarvam ZIP Output ===");
  if (!apiKey) {
    console.error("No API key");
    process.exit(1);
  }

  const pdfPath = path.resolve(process.cwd(), './sample_claim2.pdf');
  const originalPdfBytes = fs.readFileSync(pdfPath);
  
  // Create a 2-page PDF chunk to make it quick
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const subDoc = await PDFDocument.create();
  const [p1, p2] = await subDoc.copyPages(pdfDoc, [0, 1]);
  subDoc.addPage(p1);
  subDoc.addPage(p2);
  
  const subPdfBytes = await subDoc.save();
  
  // Create Job
  console.log("Creating job...");
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
  const { job_id: jobId } = await createRes.json() as any;
  console.log("Job ID:", jobId);

  // Upload URLs
  const uploadUrlRes = await fetch("https://api.sarvam.ai/doc-digitization/job/v1/upload-files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey
    },
    body: JSON.stringify({ job_id: jobId, files: ["chunk.pdf"] })
  });
  const uploadUrlData = await uploadUrlRes.json() as any;
  const presignedUrlVal = uploadUrlData.upload_urls?.["chunk.pdf"];
  const presignedUrl = typeof presignedUrlVal === 'string' ? presignedUrlVal : presignedUrlVal?.file_url;

  // Upload
  await fetch(presignedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/pdf",
      "x-ms-blob-type": "BlockBlob"
    },
    body: subPdfBytes
  });
  console.log("Uploaded chunk.");

  // Start
  await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey
    },
    body: JSON.stringify({})
  });
  console.log("Started job.");

  // Poll
  let completed = false;
  while (!completed) {
    const statusRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/status`, {
      headers: { "api-subscription-key": apiKey }
    });
    const statusData = await statusRes.json() as any;
    console.log("State:", statusData.job_state);
    if (statusData.job_state === "Completed") {
      completed = true;
    } else if (statusData.job_state === "Failed") {
      throw new Error("Job failed");
    }
    if (!completed) await new Promise(r => setTimeout(r, 2000));
  }

  // Download
  const downloadRes = await fetch(`https://api.sarvam.ai/doc-digitization/job/v1/${jobId}/download-files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": apiKey
    },
    body: JSON.stringify({})
  });
  const downloadData = await downloadRes.json() as any;
  const zipVal = downloadData.download_urls?.["document.zip"] || downloadData.download_urls?.["chunk.zip"];
  const zipUrl = typeof zipVal === 'string' ? zipVal : zipVal?.file_url;
  
  if (!zipUrl) {
    // try finding any zip
    const key = Object.keys(downloadData.download_urls || {}).find(k => k.endsWith('.zip'));
    if (key) {
      const v = downloadData.download_urls[key];
      const url = typeof v === 'string' ? v : v?.file_url;
      console.log("Found zip URL under key:", key);
      return runWithZipUrl(url);
    }
    throw new Error("No zip URL");
  }
  
  await runWithZipUrl(zipUrl);
}

async function runWithZipUrl(zipUrl: string) {
  console.log("Downloading ZIP from:", zipUrl.substring(0, 100) + "...");
  const res = await fetch(zipUrl);
  const arrayBuffer = await res.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  console.log("\nFiles in ZIP:");
  for (const filename of Object.keys(zip.files)) {
    console.log(`- ${filename} (${zip.files[filename].dir ? "directory" : "file"})`);
  }
  
  for (const filename of Object.keys(zip.files)) {
    if (filename.endsWith('.json')) {
      console.log(`\n=== JSON Content Preview (${filename}) ===`);
      const content = await zip.files[filename].async('string');
      console.log(content.substring(0, 1000));
      
      const parsed = JSON.parse(content);
      console.log("Parsed JSON structure keys:", Object.keys(parsed));
      if (Array.isArray(parsed.pages)) {
        console.log("Pages count in JSON:", parsed.pages.length);
        if (parsed.pages.length > 0) {
          console.log("First page object keys:", Object.keys(parsed.pages[0]));
        }
      }
    } else if (filename.endsWith('.md')) {
      console.log(`\n=== Markdown Content Preview (${filename}) ===`);
      const content = await zip.files[filename].async('string');
      console.log("Markdown total length:", content.length);
      console.log(content.substring(0, 500));
    }
  }
}

testZip().catch(console.error);
