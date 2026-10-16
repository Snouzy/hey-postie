#!/bin/zsh
# Screenshots of the interface on fakes (app/preview.tsx), light and dark, through headless Chrome.
# Usage: preview-shots.sh <port> <dir>, with the dev server running on <port> (see technical-guide.md).
port=$1; out=$2; mkdir -p $out
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
scenes=(
  "welcome|signin=1"
  "signin|signin=1&click=Sign in"
  "create|signin=1&click=Create an account"
  "main|click="
  "chat-bob|click=Perfect. Talk soon."
  "hall|click=can you check this"
  "contacts|click=Address book"
  "add-menu|click=Add"
  "new-chat|click=Add|New chat"
  "join-hall|click=Add|Join a hall"
  "account-menu|click=me"
  "settings|click=me|Settings…"
  "details|click=Perfect. Talk soon.|Details"
  "members|click=can you check this|Members"
  "hall-bubbles|layout=bubbles&click=can you check this"
  "hall-compact|density=compact&click=can you check this"
  "chat-bob-lines|layout=lines&density=spacious&click=Perfect. Talk soon."
  "appearance|click=me|Settings…|Appearance"
)
for scene in $scenes; do
  name=${scene%%|*}; query=${scene#*|}
  for theme in light dark; do
    "$chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1100,720 \
      --virtual-time-budget=5000 --screenshot="$out/$name-$theme.png" \
      "http://localhost:$port/preview.html?theme=$theme&$query" >/dev/null 2>&1
  done
done
ls $out | wc -l
