#!/bin/bash

# Configuration
API_URL="http://localhost:3000"
API_KEY="your_secret_key" # Replace with your actual key from .env
SESSION_ID="test_session"
GROUP_ID="123456789@g.us" # Replace with a group ID where you are admin

echo "--- 1. Testing Session Status ---"
curl -s -X GET "$API_URL/session/$SESSION_ID" -H "X-API-KEY: $API_KEY" | jq .

echo -e "\n--- 2. Testing Group Invite Code ---"
curl -s -X GET "$API_URL/groups/invite-code/$SESSION_ID/$GROUP_ID" -H "X-API-KEY: $API_KEY" | jq .

echo -e "\n--- 3. Testing Group Name Change ---"
curl -s -X POST "$API_URL/groups/identity"   -H "X-API-KEY: $API_KEY"   -H "Content-Type: application/json"   -d '{
    "sessionId": "'$SESSION_ID'",
    "groupId": "'$GROUP_ID'",
    "type": "subject",
    "value": "Test Automate (OK)"
  }' | jq .

echo -e "\n--- 4. Testing Text Status ---"
curl -s -X POST "$API_URL/status/send"   -H "X-API-KEY: $API_KEY"   -H "Content-Type: application/json"   -d '{
    "sessionId": "'$SESSION_ID'",
    "mediaType": "text",
    "message": "Ceci est un test de story texte via API 🚀"
  }' | jq .

echo -e "\n--- 5. Testing Image Status ---"
curl -s -X POST "$API_URL/status/send"   -H "X-API-KEY: $API_KEY"   -H "Content-Type: application/json"   -d '{
    "sessionId": "'$SESSION_ID'",
    "mediaUrl": "https://raw.githubusercontent.com/whiskeysockets/baileys/master/img/baileys.png",
    "mediaType": "image",
    "caption": "Test Image Status"
  }' | jq .

echo -e "\nVerification Complete!"
