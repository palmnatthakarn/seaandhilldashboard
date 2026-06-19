import { GoogleGenerativeAI, Tool } from '@google/generative-ai';
import { getClickHouse } from '@/lib/clickhouse';
import { getSchemaForPrompt } from '@/lib/schemaCache';
import { buildSystemInstruction } from '@/lib/systemInstruction';
import { filterBranchesForCurrentUser, normalizeBranches } from '@/lib/auth-policy';
import { resolveBranchName } from '@/lib/branch-names';

export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

type ChatMessage = {
  role: string;
  content: string;
};

type BranchInfo = {
  key: string;
  name: string;
};

type BranchContextPayload = {
  selectedBranches?: unknown;
  availableBranches?: unknown;
};

type BranchScope = {
  mode: 'all' | 'filtered';
  branches: BranchInfo[];
};

function readBranchKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return ['ALL'];
  const keys = value.filter((branch): branch is string => typeof branch === 'string');
  return normalizeBranches(keys.length > 0 ? keys : ['ALL']);
}

function readAvailableBranches(value: unknown): BranchInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((branch): branch is BranchInfo => {
      if (!branch || typeof branch !== 'object') return false;
      const maybeBranch = branch as Record<string, unknown>;
      return typeof maybeBranch.key === 'string' && typeof maybeBranch.name === 'string';
    })
    .map((branch) => ({
      key: branch.key,
      name: branch.name,
    }));
}

async function buildBranchScope(payload?: BranchContextPayload): Promise<BranchScope> {
  const requestedBranches = readBranchKeys(payload?.selectedBranches);
  const availableBranches = readAvailableBranches(payload?.availableBranches);
  const authorizedBranches = await filterBranchesForCurrentUser(requestedBranches);
  const normalizedAuthorizedBranches = normalizeBranches(authorizedBranches);

  if (normalizedAuthorizedBranches.includes('ALL') || normalizedAuthorizedBranches.includes('*')) {
    return { mode: 'all', branches: [] };
  }

  return {
    mode: 'filtered',
    branches: normalizedAuthorizedBranches.map((key) => ({
      key,
      name: availableBranches.find((branch) => branch.key === key)?.name || resolveBranchName(key),
    })),
  };
}

function buildBranchInstruction(scope: BranchScope): string {
  if (scope.mode === 'all') {
    return `
=== CURRENT BRANCH SCOPE ===
ผู้ใช้เลือก: ทุกกิจการ
- ตอบจากข้อมูลรวมทุกกิจการได้
=== END BRANCH SCOPE ===`;
  }

  const branchList = scope.branches.map((branch) => `${branch.key} = ${branch.name}`).join('\n');
  const sqlList = scope.branches.map((branch) => `'${branch.key}'`).join(', ');

  return `
=== CURRENT BRANCH SCOPE ===
ผู้ใช้เลือกกิจการเฉพาะ:
${branchList}

กฎบังคับ:
- ทุก SELECT ที่อ่าน table ที่มี column branch_sync ต้องกรองด้วย branch_sync ตามรายการนี้เท่านั้น
- ใช้เงื่อนไข: branch_sync IN (${sqlList})
- ถ้า query มี alias ให้ใช้ alias.branch_sync IN (${sqlList})
- ห้ามตอบภาพรวมทุกกิจการ เว้นแต่ผู้ใช้ขอเปรียบเทียบ/รวมทุกกิจการอย่างชัดเจน
- ในคำตอบภาษาไทย ให้บอกว่าข้อมูลนี้อยู่ภายใต้กิจการที่เลือก
=== END BRANCH SCOPE ===`;
}

function sqlMentionsSelectedBranchScope(sql: string, scope: BranchScope): boolean {
  if (scope.mode === 'all') return true;
  const lowerSql = sql.toLowerCase();
  return scope.branches.every((branch) => lowerSql.includes(branch.key.toLowerCase()));
}

// Tool definitions for Gemini - Only executeQuery and webSearch (schema is cached in system prompt)
const tools = [
  {
    functionDeclarations: [
      {
        name: 'executeQuery',
        description: 'Execute a SELECT query on ClickHouse. The database schema is already provided in the system instructions, so you can write queries directly without needing to discover the schema.',
        parameters: {
          type: 'object' as const,
          properties: {
            sql: {
              type: 'string',
              description: 'The SELECT SQL query to execute',
            },
          },
          required: ['sql'],
        },
      },
      {
        name: 'webSearch',
        description: 'Search the web for external information to analyze causes, trends, or context. Use this when you need information outside the database such as economic news, market trends, holidays, or events that might explain data patterns.',
        parameters: {
          type: 'object' as const,
          properties: {
            query: {
              type: 'string',
              description: 'The search query in Thai or English',
            },
          },
          required: ['query'],
        },
      },
    ],
  },
] as Tool[];

// Web search function using Serper API (primary) or SerpApi (fallback)
async function performWebSearch(query: string): Promise<{
  results: Array<{ title: string; url: string; snippet: string }>;
  message: string;
}> {
  // Primary: Use Serper API if configured (faster, more free quota)
  const serperApiKey = process.env.SERPER_API_KEY;
  if (serperApiKey) {
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': serperApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          gl: 'th',
          hl: 'th',
          num: 5,
        }),
      });
      const data = await response.json();

      if (data.organic && data.organic.length > 0) {
        const results = data.organic.map((item: { title: string; link: string; snippet?: string }) => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet || '',
        }));

        return {
          results,
          message: `Found ${results.length} search results for "${query}"`,
        };
      }
    } catch (error) {
      console.error('[webSearch] Serper API error:', error);
    }
  }

  // Fallback: Use SerpApi if configured
  const serpApiKey = process.env.SERPAPI_API_KEY;
  if (serpApiKey) {
    try {
      const params = new URLSearchParams({
        api_key: serpApiKey,
        engine: 'google',
        q: query,
        gl: 'th',
        hl: 'th',
        num: '5',
      });
      const response = await fetch(`https://serpapi.com/search?${params}`);
      const data = await response.json();

      if (data.organic_results && data.organic_results.length > 0) {
        const results = data.organic_results.map((item: { title: string; link: string; snippet?: string }) => ({
          title: item.title,
          url: item.link,
          snippet: item.snippet || '',
        }));

        return {
          results,
          message: `Found ${results.length} search results for "${query}"`,
        };
      }
    } catch (error) {
      console.error('[webSearch] SerpApi error:', error);
    }
  }

  // Final fallback: Return a message that search is not configured
  return {
    results: [],
    message: `Web search is not configured. Please set SERPER_API_KEY or SERPAPI_API_KEY in environment variables. Query was: "${query}"`,
  };
}

// Tool execution functions
async function executeTool(name: string, args: Record<string, unknown>, branchScope: BranchScope) {
  switch (name) {
    case 'executeQuery': {
      const rawSql = (args.sql as string).trim();
      const normalizedSql = rawSql.toUpperCase();
      if (!normalizedSql.startsWith('SELECT')) {
        return { error: 'Only SELECT queries allowed' };
      }

      if (!sqlMentionsSelectedBranchScope(rawSql, branchScope)) {
        const selectedBranchList = branchScope.branches.map((branch) => branch.key).join(', ');
        return {
          error: `The current dashboard branch scope is ${selectedBranchList}. Rewrite the SELECT query so every table that has branch_sync is filtered by the selected branch scope.`,
          selectedBranches: branchScope.branches,
          suggestion: 'Add WHERE branch_sync IN (...) or alias.branch_sync IN (...) using only the selected branch_sync values, then try again.',
        };
      }

      try {
        const clickhouse = await getClickHouse();
        const result = await clickhouse.query({
          query: rawSql,
          format: 'JSONEachRow',
        });
        const data = await result.json();
        return {
          query: rawSql,
          rowCount: (data as unknown[]).length,
          data: (data as unknown[]).slice(0, 100),
          message: `Query returned ${(data as unknown[]).length} rows`,
        };
      } catch (queryError: unknown) {
        const errorMsg =
          queryError instanceof Error ? queryError.message : 'Unknown query error';
        console.error('[Tool] executeQuery error:', errorMsg);
        return {
          error: `SQL Error: ${errorMsg}`,
          failedQuery: rawSql,
          suggestion:
            'Please check table/column names from the schema provided in system instructions, then try again with correct names.',
        };
      }
    }

    case 'webSearch': {
      const query = args.query as string;
      return await performWebSearch(query);
    }

    default:
      return { error: 'Unknown tool' };
  }
}

export async function POST(req: Request) {
  try {
    const { messages, branchContext } = await req.json();
    const branchScope = await buildBranchScope(branchContext);

    // Get cached schema for system prompt
    const schemaText = await getSchemaForPrompt();

    // Build system instruction from template
    const systemInstruction = buildSystemInstruction(schemaText, buildBranchInstruction(branchScope));

    // Convert messages to Gemini format
    const geminiMessages = (messages as ChatMessage[]).map((msg) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction,
      tools,
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const MAX_ITERATIONS = 20;
        let iterations = 0;

        // Token usage tracking
        let totalPromptTokens = 0;
        let totalCandidatesTokens = 0;
        let totalTokens = 0;

        const chat = model.startChat({
          history: geminiMessages.slice(0, -1),
        });

        const lastMessage = geminiMessages[geminiMessages.length - 1];
        let result = await chat.sendMessage(lastMessage.parts[0].text);

        while (iterations < MAX_ITERATIONS) {
          iterations++;

          const response = result.response;
          const functionCalls = response.functionCalls();

          const usageMetadata = response.usageMetadata;
          if (usageMetadata) {
            totalPromptTokens += usageMetadata.promptTokenCount || 0;
            totalCandidatesTokens += usageMetadata.candidatesTokenCount || 0;
            totalTokens += usageMetadata.totalTokenCount || 0;
          }

          if (!functionCalls || functionCalls.length === 0) {
            const text = response.text();
            if (text) {
              controller.enqueue(encoder.encode(text));
            } else {
              console.warn('[chat-direct] Empty response from model');
            }
            break;
          }

          const functionResponses = [];
          for (const call of functionCalls) {
            const toolResult = await executeTool(call.name, call.args as Record<string, unknown>, branchScope);
            functionResponses.push({
              functionResponse: {
                name: call.name,
                response: toolResult,
              },
            });
          }

          result = await chat.sendMessage(functionResponses);
        }

        if (iterations >= MAX_ITERATIONS) {
          console.warn('[chat-direct] Max iterations reached');
          const text = result.response.text();
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error: unknown) {
    console.error('[Chat Direct API Error]:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
