#!/bin/bash
# Fetch new Telegram messages and handle the offset to avoid duplicate reads.

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN environment variable is not set."
    exit 1
fi

if [ -z "$AUTHORIZED_CHAT_ID" ]; then
    echo "Error: AUTHORIZED_CHAT_ID environment variable is not set."
    exit 1
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OFFSET_FILE="$DIR/.telegram_offset"
OFFSET=0

if [ -f "$OFFSET_FILE" ]; then
    OFFSET=$(cat "$OFFSET_FILE")
fi

# Fetch updates from Telegram using curl and parse with python
RESPONSE=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${OFFSET}&timeout=1")

# Parse JSON safely with python
python3 -c "
import sys, json, os
try:
    if not sys.argv[1]:
        sys.exit(0)
    data = json.loads(sys.argv[1])
    if not data.get('ok') or not data.get('result'):
        sys.exit(0)
    
    max_update_id = 0
    updates = data.get('result', [])
    for u in updates:
        max_update_id = max(max_update_id, u['update_id'])
        msg = u.get('message')
        if msg and 'text' in msg:
            chat_id = msg['chat']['id']
            # SECURITY: ONLY PROCESS MESSAGES FROM AUTHORIZED CHAT ID
            if str(chat_id) != os.environ.get("AUTHORIZED_CHAT_ID"):
                continue
                
            username = msg['from'].get('username', msg['from'].get('first_name', 'Unknown'))
            text = msg['text']
            print(f\"New Message from {username} (Chat ID: {chat_id}):\")
            print(text)
            print(\"\")
            
    if max_update_id > 0:
        with open(sys.argv[2], 'w') as f:
            f.write(str(max_update_id + 1))
except Exception as e:
    print(f'Error parsing updates: {e}', file=sys.stderr)
" "$RESPONSE" "$OFFSET_FILE"
