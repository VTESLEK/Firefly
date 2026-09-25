/**
 * Telegram → 说说 机器人
 *
 * 在 GitHub Actions 中定时轮询 Telegram Bot API，把指定聊天发来的消息
 * 转成 src/content/shuoshuo/ 下的 Markdown 文件并提交，触发站点自动部署。
 *
 * 所需环境变量：
 *  - TELEGRAM_BOT_TOKEN  Bot Token（来自 @BotFather），必填
 *  - TELEGRAM_CHAT_ID    授权的聊天 ID；为空时仅打印发现的 chat id（引导配置）
 *  - TARGET_BRANCH       提交目标分支，默认 master
 *
 * 消息规则：
 *  - 文字消息 → 说说正文；#标签 会提取到 frontmatter 的 tags 中并从正文移除
 *  - 图片消息 → 图片保存到 public/shuoshuo/images/，图片说明文字作为正文
 *  - 相册中的多张图会拆成多条独立说说
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const OFFSET_FILE = ".telegram-offset";
// 与 src/config/siteConfig.ts 的 timezone 保持一致
const TIMEZONE = "Asia/Shanghai";
const CONTENT_DIR = "src/content/shuoshuo";
const IMAGE_DIR = "public/shuoshuo/images";
const BRANCH = process.env.TARGET_BRANCH || "master";

// ---------------------------------------------------------------------------
// 纯函数（导出便于测试）
// ---------------------------------------------------------------------------

/** 按站点时区格式化为 YYYY-MM-DD HH:mm:ss */
export function formatDateTime(date) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: TIMEZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).formatToParts(date);
	const get = (t) => parts.find((p) => p.type === t)?.value ?? "";
	// 部分运行时 hour12:false 会输出 24，归一化为 00
	const hour = get("hour") === "24" ? "00" : get("hour");
	return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get("minute")}:${get("second")}`;
}

/** frontmatter 用：ISO 格式并带 +08:00 时区偏移，避免被解析为 UTC */
export function toIsoWithOffset(date) {
	return `${formatDateTime(date).replace(" ", "T")}+08:00`;
}

/** 文件名时间戳：YYYYMMDDHHmmss */
export function stampForFile(date) {
	return formatDateTime(date).replace(/[-: ]/g, "");
}

/** 提取正文中的 #标签（支持中文），去重保序 */
export function extractTags(text) {
	const tags = [];
	for (const m of text.matchAll(/#([\p{L}\p{N}_]{1,32})/gu)) {
		tags.push(m[1]);
	}
	return [...new Set(tags)];
}

/** 移除正文中的 #标签 并整理多余空白 */
export function stripTags(text) {
	return text
		.replace(/[ \t]*#[\p{L}\p{N}_]{1,32}/gu, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** 生成一条说说的 Markdown 文件内容 */
export function buildPost({ date, text, tags, imagePath }) {
	const lines = ["---", `date: ${toIsoWithOffset(date)}`];
	if (tags.length > 0) {
		lines.push("tags:");
		for (const tag of tags) lines.push(`  - ${tag}`);
	}
	if (imagePath) lines.push(`image: ${imagePath}`);
	lines.push("---", "", text, "");
	return lines.join("\n");
}

/** 从消息中选出尺寸最大的照片 */
export function pickPhoto(message) {
	if (!message.photo?.length) return null;
	return message.photo.reduce((a, b) =>
		(a.file_size ?? 0) >= (b.file_size ?? 0) ? a : b,
	);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

function telegramApi(token, method, params = {}) {
	return fetch(`https://api.telegram.org/bot${token}/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(params),
	}).then(async (res) => {
		const data = await res.json();
		if (!data.ok) {
			throw new Error(`Telegram ${method} failed: ${data.description}`);
		}
		return data.result;
	});
}

function downloadPhoto(token, fileId, destPath) {
	return fetch(`https://api.telegram.org/file/bot${token}/${fileId}`).then(
		async (res) => {
			if (!res.ok) throw new Error(`Download photo failed: ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			mkdirSync(destPath, { recursive: true });
			return buf;
		},
	);
}

function git(args) {
	const identity = [
		"-c",
		"user.name=github-actions[bot]",
		"-c",
		"user.email=41898282+github-actions[bot]@users.noreply.github.com",
	];
	return execFileSync("git", [...identity, ...args], { stdio: "inherit" });
}

async function main() {
	const token = process.env.TELEGRAM_BOT_TOKEN;
	const chatId = process.env.TELEGRAM_CHAT_ID || "";

	if (!token) {
		throw new Error("TELEGRAM_BOT_TOKEN is not set");
	}

	// 读取上次处理进度
	let offset = 0;
	if (existsSync(OFFSET_FILE)) {
		offset = Number.parseInt(readFileSync(OFFSET_FILE, "utf8").trim(), 10) || 0;
	}

	const updates = await telegramApi(token, "getUpdates", {
		offset,
		timeout: 0,
		allowed_updates: ["message"],
	});

	// 引导模式：未配置 chat id 时，打印发现的聊天 ID，不处理消息
	if (!chatId) {
		const chats = new Map();
		for (const u of updates) {
			const chat = u.message?.chat;
			if (chat) {
				chats.set(String(chat.id), chat.first_name || chat.title || "");
			}
		}
		console.log(
			"TELEGRAM_CHAT_ID 未配置。请先给你的 Bot 发送一条消息，然后把下面的 chat id 添加为 GitHub Actions Secret：",
		);
		if (chats.size === 0) {
			console.log("  （暂未发现消息，请先在 Telegram 上给你的 Bot 发送任意消息后重试）");
		}
		for (const [id, name] of chats) {
			console.log(`  chat_id: ${id} (${name})`);
		}
		return;
	}

	let maxUpdateId = offset > 0 ? offset - 1 : 0;
	const posts = [];

	mkdirSync(CONTENT_DIR, { recursive: true });

	for (const u of updates) {
		const message = u.message;
		if (!message) continue;
		maxUpdateId = Math.max(maxUpdateId, u.update_id);

		// 仅处理授权聊天
		if (String(message.chat.id) !== chatId) continue;

		const photo = pickPhoto(message);
		const rawText = (message.text || message.caption || "").trim();
		if (!photo && !rawText) continue;

		const date = new Date(message.date * 1000);
		const stamp = stampForFile(date);
		const tags = extractTags(rawText);
		const text = stripTags(rawText) || "📷";

		let imagePath = "";
		if (photo) {
			const file = await telegramApi(token, "getFile", { file_id: photo.file_id });
			const ext = file.file_path.split(".").pop() || "jpg";
			const fileName = `${stamp}-${message.message_id}.${ext}`;
			const buf = await downloadPhoto(token, file.file_path, IMAGE_DIR);
			writeFileSync(`${IMAGE_DIR}/${fileName}`, buf);
			imagePath = `/shuoshuo/images/${fileName}`;
		}

		const mdName = `${stamp}-${message.message_id}.md`;
		writeFileSync(`${CONTENT_DIR}/${mdName}`, buildPost({ date, text, tags, imagePath }));
		posts.push(mdName);
		console.log(`Created: ${CONTENT_DIR}/${mdName}`);
	}

	// 有新说说时提交并推送，触发部署
	if (posts.length > 0) {
		git(["add", "-A", CONTENT_DIR, IMAGE_DIR]);
		git(["commit", "-m", `shuoshuo: publish ${posts.length} post(s) via Telegram`]);
		git(["pull", "--rebase", "origin", BRANCH]);
		git(["push", "origin", `HEAD:${BRANCH}`]);
		console.log(`Pushed ${posts.length} shuoshuo post(s).`);
	} else {
		console.log("No new messages.");
	}

	// 记录处理进度（通过 actions/cache 在运行间传递）
	if (maxUpdateId > 0) {
		writeFileSync(OFFSET_FILE, String(maxUpdateId + 1));
	}
}

// 仅在直接执行时运行主流程（导出的纯函数可被测试脚本导入）
if (
	process.argv[1] &&
	import.meta.url === pathToFileURL(process.argv[1]).href
) {
	await main();
}
