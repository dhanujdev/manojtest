#!/usr/bin/env python3
"""Telegram bot powered by Claude Code via the Agent SDK."""

import os
import sys
import time
import json
import asyncio
import ssl
import urllib.request
from pathlib import Path

import certifi
from dotenv import load_dotenv
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

load_dotenv()

TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
if not TELEGRAM_BOT_TOKEN:
    print("Error: TELEGRAM_BOT_TOKEN not set in .env")
    sys.exit(1)

OFFSET_FILE = Path(__file__).parent / "telegram_skill" / ".telegram_offset"
TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}"

MODEL_MAP = {
    "opus": "opus",
    "sonnet": "sonnet",
    "haiku": "haiku",
}

chat_models: dict[int, str] = {}

def telegram_request(method: str, payload: dict) -> dict:
    url = f"{TELEGRAM_API}/{method}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}
    )
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    with urllib.request.urlopen(req, timeout=10, context=ssl_context) as resp:
        return json.loads(resp.read())


def get_updates(offset: int) -> list[dict]:
    try:
        data = telegram_request("getUpdates", {"offset": offset, "timeout": 10})
        return data.get("result", []) if data.get("ok") else []
    except Exception as e:
        print(f"Error fetching updates: {e}")
        return []


def send_message(chat_id: int, text: str) -> None:
    try:
        telegram_request("sendMessage", {"chat_id": chat_id, "text": text})
    except Exception as e:
        print(f"Error sending message: {e}")


def ensure_polling_mode() -> None:
    try:
        telegram_request("deleteWebhook", {"drop_pending_updates": False})
    except Exception as e:
        print(f"Error disabling webhook: {e}")


async def ask_claude(chat_id: int, user_text: str) -> str:
    """Send user message to Claude Code and return the response."""
    model = chat_models.get(chat_id, MODEL_MAP["sonnet"])
    options = ClaudeAgentOptions(
        model=model,
        system_prompt=(
            "You are a helpful assistant replying via Telegram. "
            "Keep responses concise and friendly."
        ),
        max_turns=5,
    )

    try:
        reply = ""
        async for message in query(prompt=user_text, options=options):
            if isinstance(message, ResultMessage):
                reply = message.result
        return reply or "Sorry, I couldn't process that."
    except Exception as e:
        print(f"Error querying Claude: {e}")
        return "Sorry — I hit an error talking to Claude. Please try again."


def load_offset() -> int:
    if OFFSET_FILE.exists():
        try:
            return int(OFFSET_FILE.read_text().strip())
        except ValueError:
            pass
    return 0


def save_offset(offset: int) -> None:
    OFFSET_FILE.parent.mkdir(parents=True, exist_ok=True)
    OFFSET_FILE.write_text(str(offset))


async def process_update(update: dict) -> None:
    msg = update.get("message")
    if not msg or "text" not in msg:
        return

    chat_id: int = msg["chat"]["id"]
    authorized_id = os.environ.get("AUTHORIZED_CHAT_ID")
    if authorized_id and str(chat_id) != authorized_id:
        print(f"Unauthorized chat attempt from ID: {chat_id}")
        return

    username: str = msg["from"].get("username") or msg["from"].get("first_name", "User")
    text: str = msg["text"].strip()

    if text.lower().startswith("/model"):
        parts = text.split(maxsplit=1)
        if len(parts) == 1:
            current = chat_models.get(chat_id, MODEL_MAP["sonnet"])
            send_message(chat_id, f"Current model: {current}. Use /model opus|sonnet|haiku")
            return

        requested = parts[1].strip().lower()
        if requested in MODEL_MAP:
            chat_models[chat_id] = MODEL_MAP[requested]
            send_message(chat_id, f"Model set to {MODEL_MAP[requested]}")
        else:
            send_message(chat_id, "Unknown model. Use /model opus|sonnet|haiku")
        return

    print(f"[{username}] {text}")
    reply = await ask_claude(chat_id, text)
    print(f"[Claude] {reply[:100]}")
    send_message(chat_id, reply)


async def main() -> None:
    ensure_polling_mode()
    print("Bot started. Polling for messages...")
    offset = load_offset()

    while True:
        updates = get_updates(offset)
        processed_any = False
        for update in updates:
            offset = max(offset, update["update_id"] + 1)
            await process_update(update)
            processed_any = True

        if processed_any:
            save_offset(offset)

        await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
