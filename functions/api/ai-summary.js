// AI 摘要 API（Cloudflare Pages Functions）
// GET  /api/ai-summary?slug=xxx   查询已缓存的摘要，未生成返回 404
// POST /api/ai-summary            { slug, title, content } 生成摘要并写入 KV 缓存
//
// 依赖 Pages 项目配置：
//   - KV 命名空间绑定：AI_SUMMARIES（缓存键 sum:<slug>，值为 { h: 内容哈希, s: 摘要, t: 时间 }）
//   - Secret：DEEPSEEK_API_KEY
// 缓存策略：同一内容只生成一次；文章内容变化（哈希不同）时自动重新生成。

const json = (data, status = 200, headers = {}) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", ...headers },
	});

const SLUG_RE = /^[a-zA-Z0-9._/-]{1,150}$/;
const MAX_CONTENT = 12000;
const MIN_CONTENT = 80;

// 同一 isolate 内的简易限流：每 IP 每分钟最多 5 次生成，防止恶意刷 token
const hits = new Map();
function rateLimited(ip) {
	const now = Date.now();
	const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
	arr.push(now);
	hits.set(ip, arr);
	if (hits.size > 5000) hits.clear();
	return arr.length > 5;
}

async function sha256Hex(str) {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SYSTEM_PROMPT = `你是一位专业的博客文章摘要助手。请为用户提供的文章生成一段摘要，要求：
1. 使用与文章正文相同的语言；
2. 篇幅 100~200 字，突出核心观点与关键结论；
3. 语气自然流畅，像作者写给读者的导语；
4. 直接输出摘要正文，不要任何标题、前缀、列表、引号，也不要以"本文"或"这篇文章"开头。`;

export async function onRequestGet({ env, request }) {
	const { searchParams } = new URL(request.url);
	const slug = searchParams.get("slug") || "";
	if (!SLUG_RE.test(slug) || slug.includes("..")) return json({ error: "invalid slug" }, 400);
	if (!env.AI_SUMMARIES) return json({ error: "kv not configured" }, 503);
	const cached = await env.AI_SUMMARIES.get(`sum:${slug}`, "json");
	if (!cached || !cached.s) return json({ error: "not_generated" }, 404);
	// 浏览器缓存一天，减少重复请求；文章更新后由 POST 重新生成覆盖
	return json({ summary: cached.s, cached: true }, 200, { "cache-control": "public, max-age=86400" });
}

export async function onRequestPost({ env, request }) {
	if (!env.AI_SUMMARIES) return json({ error: "kv not configured" }, 503);
	if (!env.DEEPSEEK_API_KEY) return json({ error: "ai not configured" }, 503);

	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: "invalid json" }, 400);
	}
	const slug = String(body.slug || "");
	const title = String(body.title || "").slice(0, 300);
	const content = String(body.content || "").slice(0, MAX_CONTENT);
	if (!SLUG_RE.test(slug) || slug.includes("..")) return json({ error: "invalid slug" }, 400);
	if (content.length < MIN_CONTENT) return json({ error: "content too short" }, 400);

	const ip = request.headers.get("cf-connecting-ip") || "unknown";
	if (rateLimited(ip)) return json({ error: "too many requests" }, 429);

	const hash = (await sha256Hex(content)).slice(0, 16);
	const key = `sum:${slug}`;

	// 复用缓存：同一篇文章内容不变时绝不重复调用 AI
	const cached = await env.AI_SUMMARIES.get(key, "json");
	if (cached && cached.h === hash && cached.s) {
		return json({ summary: cached.s, cached: true }, 200, { "cache-control": "no-store" });
	}

	let summary = "";
	try {
		const resp = await fetch("https://api.deepseek.com/chat/completions", {
			method: "POST",
			headers: {
				authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({
				model: "deepseek-chat",
				messages: [
					{ role: "system", content: SYSTEM_PROMPT },
					{ role: "user", content: `标题：${title}\n\n正文：\n${content}` },
				],
				max_tokens: 600,
				temperature: 0.6,
				stream: false,
			}),
			signal: AbortSignal.timeout(45000),
		});
		if (!resp.ok) {
			const t = await resp.text().catch(() => "");
			return json({ error: `upstream ${resp.status}: ${t.slice(0, 200)}` }, 502);
		}
		const data = await resp.json();
		summary = String((data.choices || [])[0]?.message?.content || "").trim();
	} catch (e) {
		return json({ error: `ai request failed: ${String(e).slice(0, 200)}` }, 502);
	}
	if (!summary) return json({ error: "empty summary" }, 502);

	await env.AI_SUMMARIES.put(key, JSON.stringify({ h: hash, s: summary, t: Date.now() }));
	return json({ summary, cached: false }, 200, { "cache-control": "no-store" });
}
