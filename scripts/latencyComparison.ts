import http from 'http';
import { testCases, makePreAuthRecord } from './testBattery';
import { reviewEvidence } from '../engine/evidenceReview';
import { lookupICD, assignICDViaModel } from '../services/icdService';
import { runBillingCodingWorkflow } from '../engine/billingCoder';
import { getGoogleGenAIClient } from '../services/apiKeys';
import { MODEL_TEXT } from '../config/modelConfig';

// A local proxy server that implements the OpenAI /chat/completions endpoint
// and routes requests to Gemini API, simulating the MedGemma endpoint path.
function startMockMedGemmaServer(): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body);
            const messages = payload.messages || [];
            
            let systemInstruction = '';
            let userPrompt = '';
            
            for (const msg of messages) {
              if (msg.role === 'system') {
                systemInstruction = msg.content;
              } else if (msg.role === 'user') {
                userPrompt = msg.content;
              }
            }

            // Call Gemini via Google Gen AI SDK
            const ai = getGoogleGenAIClient();
            const isJson = (systemInstruction?.toLowerCase().includes('json') || userPrompt.toLowerCase().includes('json'));
            
            const response = await ai.models.generateContent({
              model: MODEL_TEXT,
              contents: userPrompt,
              config: {
                systemInstruction,
                ...(isJson && { responseMimeType: 'application/json' })
              }
            });

            const replyText = response.text || '';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              choices: [
                {
                  message: {
                    content: replyText
                  }
                }
              ]
            }));
          } catch (err: any) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(9099, '127.0.0.1', () => {
      console.log('📡 Local MedGemma Proxy Server running on http://127.0.0.1:9099');
      resolve(server);
    });
  });
}

async function runBenchmark() {
  console.log('⚡ Initializing Latency and Path Comparison Benchmark (N=20)...');
  
  // Start the proxy server
  const server = await startMockMedGemmaServer();
  
  const casesToTest = testCases.slice(0, 20);
  const geminiLatencies: number[] = [];
  const medgemmaLatencies: number[] = [];

  const batchSize = 5;

  // --- Run 1: Gemini Fallback Path (Default config, no URL set) ---
  console.log('\n--- Running Gemini Fallback Path (No URL set) ---');
  delete process.env.VITE_MEDGEMMA_ENDPOINT_URL;

  for (let b = 0; b < casesToTest.length; b += batchSize) {
    const chunk = casesToTest.slice(b, b + batchSize);
    await Promise.all(chunk.map(async (tc, index) => {
      const idx = b + index;
      const record = makePreAuthRecord(tc);
      const start = Date.now();
      try {
        await reviewEvidence(record);
        const elapsed = Date.now() - start;
        geminiLatencies.push(elapsed);
        console.log(`  Case ${idx + 1}/20: Gemini Fallback Latency = ${elapsed}ms`);
      } catch (err: any) {
        console.error(`  Case ${idx + 1}/20 Failed: ${err.message}`);
      }
    }));
  }

  // --- Run 2: MedGemma Endpoint Path (URL pointed to our proxy) ---
  console.log('\n--- Running MedGemma Endpoint Path (URL pointed to localhost:9099) ---');
  process.env.VITE_MEDGEMMA_ENDPOINT_URL = 'http://127.0.0.1:9099';

  for (let b = 0; b < casesToTest.length; b += batchSize) {
    const chunk = casesToTest.slice(b, b + batchSize);
    await Promise.all(chunk.map(async (tc, index) => {
      const idx = b + index;
      const record = makePreAuthRecord(tc);
      const start = Date.now();
      try {
        await reviewEvidence(record);
        const elapsed = Date.now() - start;
        medgemmaLatencies.push(elapsed);
        console.log(`  Case ${idx + 1}/20: MedGemma Endpoint Latency = ${elapsed}ms`);
      } catch (err: any) {
        console.error(`  Case ${idx + 1}/20 Failed: ${err.message}`);
      }
    }));
  }

  // Shut down the server
  server.close();

  // Helper to calculate statistics
  const getStats = (latencies: number[]) => {
    if (latencies.length === 0) return { mean: 0, median: 0, min: 0, max: 0, p95: 0, p99: 0 };
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = Math.round(sum / sorted.length);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const median = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    return { mean, median, min, max, p95, p99 };
  };

  const geminiStats = getStats(geminiLatencies);
  const medgemmaStats = getStats(medgemmaLatencies);

  console.log('\n========================================================================');
  console.log('                         LATENCY PERFORMANCE PROFILE                    ');
  console.log('========================================================================');
  console.log('| Metric           | Gemini Fallback Path  | MedGemma Endpoint Path (Proxy) |');
  console.log('|------------------|-----------------------|--------------------------------|');
  console.log(`| Mean Latency     | ${geminiStats.mean.toString().padEnd(21)} | ${medgemmaStats.mean.toString().padEnd(30)} |`);
  console.log(`| Median Latency   | ${geminiStats.median.toString().padEnd(21)} | ${medgemmaStats.median.toString().padEnd(30)} |`);
  console.log(`| Min Latency      | ${geminiStats.min.toString().padEnd(21)} | ${medgemmaStats.min.toString().padEnd(30)} |`);
  console.log(`| Max Latency      | ${geminiStats.max.toString().padEnd(21)} | ${medgemmaStats.max.toString().padEnd(30)} |`);
  console.log(`| P95 Latency      | ${geminiStats.p95.toString().padEnd(21)} | ${medgemmaStats.p95.toString().padEnd(30)} |`);
  console.log(`| P99 Latency      | ${geminiStats.p99.toString().padEnd(21)} | ${medgemmaStats.p99.toString().padEnd(30)} |`);
  console.log('========================================================================');
}

runBenchmark().catch(console.error);
