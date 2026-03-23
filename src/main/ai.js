/**
 * AI features using OpenAI API (user provides their own API key).
 * All features are optional; the app works fully without them.
 */
const OpenAI = require('openai');
const Store = require('electron-store');

const store = new Store({ name: 'cp2077-mod-manager' });

const PREDEFINED_CATEGORIES = ['Character', 'Gameplay', 'Visual', 'Framework', 'Audio', 'UI', 'Uncategorized'];

function getApiKey() {
  return store.get('openaiApiKey') || '';
}

function setApiKey(key) {
  store.set('openaiApiKey', (key || '').trim());
}

function hasApiKey() {
  return !!getApiKey();
}

async function chat(messages, options = {}) {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: 'OpenAI API key not set.' };
  const onActivity = options.onActivity;

  try {
    if (onActivity) onActivity('Calling OpenAI API…');
    const openai = new OpenAI({ apiKey });
    const body = {
      model: options.model || 'gpt-4o-mini',
      messages,
      max_tokens: options.maxTokens || 1500,
      temperature: options.temperature ?? 0.5,
    };
    if (options.responseFormat === 'json_object') {
      body.response_format = { type: 'json_object' };
    }
    const resp = await openai.chat.completions.create(body);
    const content = resp.choices?.[0]?.message?.content;
    if (onActivity) onActivity('Received response', { rawLength: content?.length });
    return { ok: true, data: content?.trim() || '' };
  } catch (err) {
    const msg = err.message || String(err);
    return { ok: false, error: msg };
  }
}

function getTopLevelPaths(files) {
  const dirs = new Set();
  for (const f of files || []) {
    const parts = String(f).replace(/\\/g, '/').split('/');
    if (parts[0]) dirs.add(parts[0]);
  }
  return [...dirs];
}

function buildModContext(mod) {
  return {
    id: mod.id,
    name: mod.customName || mod.displayName || mod.id,
    type: mod.type,
    sourceArchive: mod.sourceArchiveName || '',
    category: mod.customCategory || '',
    tags: (mod.customTags || []).join(', '),
    description: mod.customDescription || '',
    topPaths: getTopLevelPaths(mod.files || []),
  };
}

/**
 * Extract and parse JSON from AI response. Handles markdown, extra text, trailing commas.
 * On failure, throws with a rawSnippet property for debugging.
 */
function parseJsonResponse(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty or invalid input');
  let cleaned = text.trim().replace(/^\uFEFF/, ''); // BOM

  // 1. Strip markdown code blocks first (most reliable)
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) cleaned = codeBlockMatch[1].trim();

  // 2. Find JSON structure: prefer array [...] then object {...}
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  let extracted = null;
  if (arrayMatch) {
    extracted = arrayMatch[0];
    // If both exist and object appears first/contains the array, prefer array for batch ops
    if (objectMatch && objectMatch.index < arrayMatch.index) {
      const inner = objectMatch[0].match(/\[[\s\S]*\]/);
      if (inner) extracted = inner[0];
    }
  }
  if (!extracted && objectMatch) extracted = objectMatch[0];
  if (extracted) cleaned = extracted;

  // 3. Fix common LLM JSON issues
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1'); // trailing commas

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    const rawSnippet =
      text.length > 800
        ? text.slice(0, 500) + '\n\n...[truncated]...\n\n' + text.slice(-200)
        : text;
    const err = new Error('Could not parse AI response.');
    err.rawSnippet = rawSnippet;
    throw err;
  }
}

/**
 * Generate description, category, and tags for a single mod.
 */
async function generateModDescription(modContext, categories) {
  const { predefined, user } = categories || { predefined: PREDEFINED_CATEGORIES, user: [] };
  const userCats = user || [];
  const userCategoriesStr = userCats.length ? userCats.join(', ') : '(none yet)';

  const systemPrompt = `You are helping a Cyberpunk 2077 mod manager user. Infer what a mod does from:
- mod name, archive filename, file paths (archive/, r6/scripts/, mods/, etc.), mod type

EXISTING CATEGORIES (prefer when they fit):
- Predefined: Character, Gameplay, Visual, Framework, Audio, UI
- User-created: ${userCategoriesStr}

If no existing category fits well, suggest a NEW category name (clear, singular noun or short phrase).
Use "Uncategorized" only when you cannot infer the mod's purpose.

Respond with valid JSON only: { "description": "...", "category": "...", "tags": ["tag1","tag2"] }
Keep description under 200 chars. 3-5 tags max.`;

  const userPrompt = `Mod: ${modContext.name}
Archive: ${modContext.sourceArchive}
Type: ${modContext.type}
Top paths: ${(modContext.topPaths || []).join(', ')}
Current: ${modContext.category || 'none'}, ${modContext.tags || 'none'}${modContext.description ? `\nExisting description: ${modContext.description}` : ''}`;

  const result = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 400 }
  );

  if (!result.ok) return result;
  try {
    const parsed = parseJsonResponse(result.data);
    return {
      ok: true,
      data: {
        description: parsed.description || '',
        category: parsed.category || 'Uncategorized',
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      },
    };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not parse AI response.', rawSnippet: e.rawSnippet };
  }
}

const BATCH_CATEGORIZE_SIZE = 25;

/**
 * Batch categorize mods. Returns suggestions only; new categories are NOT added until user accepts.
 * Processes in chunks to avoid output truncation.
 */
async function batchCategorize(mods, categories, opts = {}) {
  const { predefined, user } = categories || { predefined: PREDEFINED_CATEGORIES, user: [] };
  const userCats = user || [];
  const userCategoriesStr = userCats.length ? userCats.join(', ') : '(none yet)';

  const modContexts = mods.map((m) => buildModContext(m));
  if (modContexts.length === 0) return { ok: true, suggestions: [], newCategories: [] };

  const systemPrompt = `You are categorizing Cyberpunk 2077 mods.

EXISTING CATEGORIES (prefer when they fit): Character, Gameplay, Visual, Framework, Audio, UI
User-created: ${userCategoriesStr}

RULES:
- Use existing categories when they fit; otherwise suggest a NEW category (e.g. Vehicles, Cyberware, Quests).
- Use "Uncategorized" only when you cannot infer the mod's purpose.
- Keep id exactly as provided. category and tags required.

Return ONLY valid minified JSON. No markdown, no explanation, no extra keys.
Format: {"items":[{"id":"string","category":"string","tags":["string"]}]}
Tags: short array of lowercase strings, 0-5 items.`;

  const allSuggestions = [];
  const batches = [];
  for (let i = 0; i < modContexts.length; i += BATCH_CATEGORIZE_SIZE) {
    batches.push(modContexts.slice(i, i + BATCH_CATEGORIZE_SIZE));
  }

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    if (opts.onActivity) opts.onActivity(`Batch ${b + 1}/${batches.length}…`);
    const userPrompt = `Mods to categorize:\n${JSON.stringify(batch)}`;

    const result = await chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 4000, onActivity: opts.onActivity, responseFormat: 'json_object' }
    );

    if (!result.ok) return result;
    try {
      if (opts.onActivity) opts.onActivity('Parsing response…');
      const parsed = parseJsonResponse(result.data);
      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : null;
      if (!items) return { ok: false, error: 'Invalid AI response format.', rawSnippet: result.data?.slice(0, 500) };
      allSuggestions.push(...items);
    } catch (e) {
      return { ok: false, error: e.message || 'Could not parse AI response.', rawSnippet: e.rawSnippet };
    }
  }

  const allExisting = new Set([...PREDEFINED_CATEGORIES, ...userCats]);
  const newCategories = [...new Set(allSuggestions.map((s) => s.category).filter((c) => !allExisting.has(c)))];
  return { ok: true, suggestions: allSuggestions, newCategories };
}

/**
 * Classify freeform user message to route to the right task.
 * Returns { task: 'categorize'|'suggest-groups'|'suggest-load-order'|'troubleshoot', customInstructions?: string }
 */
async function classifyChatIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return { task: 'troubleshoot', customInstructions: null };
  }
  const result = await chat(
    [
      {
        role: 'system',
        content: `You classify user requests for a Cyberpunk 2077 mod manager AI assistant.
Tasks: categorize (organize mods by category), suggest-groups (group related mods), suggest-load-order (order archive mods), troubleshoot (game issues, crashes, bugs).
Return ONLY valid JSON: {"task":"categorize|suggest-groups|suggest-load-order|troubleshoot","customInstructions":null or "string"}
- Use suggest-groups when user wants to group mods by any criterion (file name, category, function, similar names, etc). Put their specific criteria in customInstructions.
- Use troubleshoot for crashes, bugs, problems, "not working", conflicts.
- Use categorize for organizing by category.
- Use suggest-load-order for load order.`,
      },
      { role: 'user', content: userMessage.trim() },
    ],
    { maxTokens: 150 }
  );
  if (!result.ok) return { task: 'troubleshoot', customInstructions: null };
  try {
    const parsed = parseJsonResponse(result.data);
    const task = ['categorize', 'suggest-groups', 'suggest-load-order', 'troubleshoot'].includes(parsed?.task)
      ? parsed.task
      : 'troubleshoot';
    const customInstructions =
      parsed?.customInstructions && typeof parsed.customInstructions === 'string' && parsed.customInstructions.trim()
        ? parsed.customInstructions.trim()
        : null;
    return { task, customInstructions };
  } catch {
    return { task: 'troubleshoot', customInstructions: null };
  }
}

/**
 * Suggest mod groups (related mods, addons, expansions).
 */
async function suggestGroups(mods, opts = {}) {
  if (opts.onActivity) opts.onActivity('Building request…');
  const modContexts = mods.map((m) => buildModContext(m));
  if (modContexts.length < 2) return { ok: true, data: [] };

  let systemPrompt = `You are helping group related Cyberpunk 2077 mods. Suggest groups of mods that belong together
(add-ons, expansions, related features).

Return ONLY valid minified JSON. No markdown, no explanation. Format:
{"items":[{"modIds":["id1","id2"],"reason":"brief reason","suggestedName":"Group Name","confidence":"high|medium|low"}]}
Only suggest groups of 2+ mods. Prefer high confidence.`;

  if (opts.customInstructions && opts.customInstructions.trim()) {
    systemPrompt += `\n\nIMPORTANT - User's specific criteria: ${opts.customInstructions.trim()}`;
  }

  const userPrompt = `Mods:\n${JSON.stringify(modContexts)}`;

  const result = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 4000, onActivity: opts.onActivity, responseFormat: 'json_object' }
  );

  if (!result.ok) return result;
  try {
    if (opts.onActivity) opts.onActivity('Parsing response…');
    const parsed = parseJsonResponse(result.data);
    const data = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not parse AI response.', rawSnippet: e.rawSnippet };
  }
}

/**
 * Suggest load order for archive mods. Input/output use .archive filenames.
 */
async function suggestLoadOrder(mods, currentOrder, opts = {}) {
  const archiveMods = mods.filter((m) => {
    const files = m.files || [];
    return files.some((f) => f.toLowerCase().endsWith('.archive'));
  });
  if (archiveMods.length === 0) return { ok: true, data: currentOrder || [] };
  if (opts.onActivity) opts.onActivity('Building request…');

  const archiveToMod = new Map();
  for (const m of archiveMods) {
    for (const f of m.files || []) {
      if (f.toLowerCase().endsWith('.archive')) {
        const base = f.replace(/\\/g, '/').split('/').pop();
        if (base) archiveToMod.set(base.toLowerCase(), { name: m.displayName || m.customName || m.id, file: base });
      }
    }
  }

  const context = archiveMods.map((m) => {
    const arch = (m.files || []).find((f) => f.toLowerCase().endsWith('.archive'));
    const file = arch ? arch.replace(/\\/g, '/').split('/').pop() : null;
    return { id: m.id, name: m.displayName || m.customName || m.id, archiveFile: file, type: m.type };
  });

  const systemPrompt = `You suggest load order for Cyberpunk 2077 archive mods. Framework mods (CET, RED4ext, ArchiveXL, TweakXL, etc.) should load early.
Overrides and visual mods typically load later.

Return ONLY valid minified JSON. No markdown, no explanation. Format:
{"items":["mod1.archive","mod2.archive"]}`;

  const userPrompt = `Current order: ${JSON.stringify(currentOrder || [])}\nMods:\n${JSON.stringify(context)}`;

  const result = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 4000, onActivity: opts.onActivity, responseFormat: 'json_object' }
  );

  if (!result.ok) return result;
  try {
    if (opts.onActivity) opts.onActivity('Parsing response…');
    const parsed = parseJsonResponse(result.data);
    const data = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    const suggested = data;
    const valid = suggested.filter((n) => typeof n === 'string' && n.toLowerCase().endsWith('.archive'));
    const existingSet = new Set((currentOrder || []).map((n) => n.toLowerCase()));
    for (const n of currentOrder || []) {
      if (!valid.some((v) => v.toLowerCase() === n.toLowerCase())) valid.push(n);
    }
    return { ok: true, data: valid };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not parse AI response.', rawSnippet: e.rawSnippet };
  }
}

/**
 * Troubleshooting assistant: suggest mods that might cause the user's issue.
 */
async function troubleshoot(mods, userMessage, opts = {}) {
  if (opts.onActivity) opts.onActivity('Building request…');
  const modContexts = mods.map((m) => buildModContext(m));

  const systemPrompt = `You are a troubleshooting assistant for Cyberpunk 2077 modding. The user describes a game issue.
Suggest which mods might cause it, in what order to try disabling them, and any load order or compatibility tips.
Be concise. Format as plain text, use bullet points.`;

  const userPrompt = `User says: "${userMessage}"\n\nInstalled mods:\n${JSON.stringify(modContexts)}`;

  const result = await chat(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 800, onActivity: opts.onActivity }
  );

  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

module.exports = {
  getApiKey,
  setApiKey,
  hasApiKey,
  buildModContext,
  generateModDescription,
  batchCategorize,
  suggestGroups,
  suggestLoadOrder,
  troubleshoot,
  classifyChatIntent,
};
