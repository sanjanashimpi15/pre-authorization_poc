import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { statusForGeminiError } from './utils/geminiErrorClassifier';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const apiKey = env.VITE_GEMINI_API_KEY || '';
  Object.assign(process.env, env);

  const localApiPlugin = () => ({
    name: 'local-api-proxy',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const pathname = req.url.split('?')[0];

        if (pathname === '/api/gemini' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const { sdkType, args } = JSON.parse(body);
              if (!apiKey) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: "Local VITE_GEMINI_API_KEY is not configured in your .env.local file." }));
                return;
              }

              if (sdkType === 'genai') {
                const ai = new GoogleGenAI({ apiKey });
                const response = await ai.models.generateContent(args);
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  text: response.text,
                  candidates: response.candidates
                }));
              } else if (sdkType === 'generative-ai') {
                const client = new GoogleGenerativeAI(apiKey);
                const { model, contents } = args;
                const modelObj = client.getGenerativeModel({ model });
                const result = await modelObj.generateContent(contents);
                const text = result.response.text();
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ text }));
              } else {
                res.statusCode = 400;
                res.end(`Unsupported SDK type: ${sdkType}`);
              }
            } catch (err: any) {
              // Preserve the real Gemini status (429/503) instead of collapsing to 500,
              // so the browser client can tell "quota exceeded" apart from "temporarily unavailable".
              res.statusCode = statusForGeminiError(err);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Failed to call Gemini API locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/ollama-vision' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/ollama-vision.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Ollama vision proxy failed locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/local' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/local.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Local pipeline proxy failed locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/openrouter' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/openrouter.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "OpenRouter proxy failed locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/sarvam-ocr' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/sarvam-ocr.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Sarvam OCR proxy failed locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/sarvam-text' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/sarvam-text.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "Sarvam Text proxy failed locally" }));
            }
          });
          return;
        }

        if (pathname === '/api/db' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const modulePath = path.resolve(process.cwd(), './api/db.ts');
              const { default: handler } = await server.ssrLoadModule(modulePath);

              const mockRes = {
                statusCode: 200,
                headers: {} as any,
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                setHeader(name: string, value: string) {
                  this.headers[name] = value;
                  res.setHeader(name, value);
                  return this;
                },
                json(data: any) {
                  res.statusCode = this.statusCode;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
                send(data: any) {
                  res.statusCode = this.statusCode;
                  res.end(data);
                }
              };

              const mockReq = {
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: body ? JSON.parse(body) : {}
              };

              await handler(mockReq, mockRes);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || "SQLite serverless execution failed" }));
            }
          });
          return;
        }

        if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/users/')) {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            const hasDatabase = !!process.env.DATABASE_URL;
            if (hasDatabase) {
              try {
                const modulePath = path.resolve(process.cwd(), `.${pathname}.ts`);
                const { default: handler } = await server.ssrLoadModule(modulePath);

                const mockRes = {
                  statusCode: 200,
                  headers: {} as any,
                  status(code: number) {
                    this.statusCode = code;
                    res.statusCode = code;
                    return this;
                  },
                  setHeader(name: string, value: string) {
                    this.headers[name] = value;
                    res.setHeader(name, value);
                    return this;
                  },
                  json(data: any) {
                    res.statusCode = this.statusCode;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                  },
                  send(data: any) {
                    res.statusCode = this.statusCode;
                    res.end(data);
                  }
                };

                const mockReq = {
                  method: req.method,
                  url: req.url,
                  headers: req.headers,
                  body: body ? JSON.parse(body) : {}
                };

                await handler(mockReq, mockRes);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message || "Serverless execution failed" }));
              }
            } else {
              res.setHeader('Content-Type', 'application/json');
              const bodyData = body ? JSON.parse(body) : {};

              if (pathname === '/api/auth/signup') {
                const { email, password, firstName, lastName } = bodyData;
                if (!email || !password || !firstName || !lastName) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Missing required fields" }));
                  return;
                }
                const token = `mock_token_${Date.now()}`;
                res.statusCode = 201;
                res.end(JSON.stringify({
                  token,
                  user: { id: 'mock_user_id', email: email.toLowerCase(), firstName, lastName }
                }));
              } else if (pathname === '/api/auth/login') {
                const { email, password } = bodyData;
                if (!email || !password) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Missing email or password" }));
                  return;
                }
                const token = `mock_token_${Date.now()}`;
                res.statusCode = 200;
                res.end(JSON.stringify({
                  token,
                  user: { id: 'mock_user_id', email: email.toLowerCase(), firstName: 'Dr.', lastName: 'Sharma' }
                }));
              } else if (pathname === '/api/users/me') {
                res.statusCode = 200;
                res.end(JSON.stringify({
                  user: { id: 'mock_user_id', email: 'doctor@aivana.com', firstName: 'Dr.', lastName: 'Sharma' }
                }));
              } else {
                res.statusCode = 404;
                res.end(JSON.stringify({ error: "Endpoint not matched in mock auth" }));
              }
            }
          });
          return;
        }
        next();
      });
    }
  });

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true,
    },
    plugins: [react(), localApiPlugin()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
