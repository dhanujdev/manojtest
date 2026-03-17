#!/bin/bash
# Send a message back to a Telegram chat ID

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Error: TELEGRAM_BOT_TOKEN environment variable is not set."
    exit 1
fi

if [ -z "$AUTHORIZED_CHAT_ID" ]; then
    echo "Error: AUTHORIZED_CHAT_ID environment variable is not set."
    exit 1
fi

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <chat_id> <message>"
    exit 1
fi

CHAT_ID="$1"

# SECURITY: ONLY SEND MESSAGES TO THE AUTHORIZED CHAT ID
if [ "$CHAT_ID" != "$AUTHORIZED_CHAT_ID" ]; then
    echo "Error: Attempted to send a message to unauthorized chat ID: $CHAT_ID"
    exit 1
fi

# Capture all remaining arguments as the message text
shift
TEXT="$*"

RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
     -H "Content-Type: application/json" \
     -d "{\"chat_id\": \"${CHAT_ID}\", \"text\": \"${TEXT}\"}")

python3 -c "
import sys, json
try:
    if not sys.argv[1]:
        sys.exit(0)
    data = json.loads(sys.argv[1])
    if not data.get('ok'):
        print(f\"Error sending message: {data}\")
    else:
        print(\"Message sent successfully.\")
except Exception as e:
    print(f\"Error parsing response: {e}\")
" "$RESPONSE"
echo ""
