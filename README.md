# ChatGPT Terminal Agent

Turn the ChatGPT web UI into a coding agent. ChatGPT outputs commands in a
`<TERMINAL>...</TERMINAL>` block; a Chrome extension detects them, a local
Node.js server runs them in PowerShell, and the result is injected back into
ChatGPT so it can decide the next step — repeating until the task is done.

## Components

- `server/` — local Express server that executes PowerShell commands.
- `extension/` — Chrome MV3 extension with a ChatGPT bridge and Side Panel terminal UI.
- `shared/protocol.js` — protocol definition (single source of truth).
- `SYSTEM_PROMPT.md` — system prompt to give to ChatGPT.
- `server/data/` — persisted sessions and file-change backups.

## Setup

### 1) Start the local server

```powershell
cd server
npm install
npm start
```

Server listens on `http://localhost:5747`. The working directory it runs in
is the directory the agent's commands will execute in by default.

### 2) Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` folder
4. Click the extension icon to open the Agent Side Panel.
5. Set the working directory in the panel and click **설정 저장**.

The extension has no required icon files, so it can be loaded immediately.

### 3) Configure ChatGPT

Either:
- Paste the contents of `SYSTEM_PROMPT.md` into ChatGPT's
  **Customize ChatGPT → Custom instructions**, or
- Send it as your first message in the conversation.

### 4) Use it

Ask ChatGPT to do a coding task on your machine. It will output commands
wrapped in `<TERMINAL>...</TERMINAL>`. The extension will:
1. Detect the commands,
2. Send them to the local server,
3. Send the result back to ChatGPT as a `<TERMINAL_RESULT>` block,
4. ChatGPT continues automatically.

Toggle **Auto-run** in the Agent Side Panel to enable/disable auto execution.

## Agent runtime

The local server exposes structured tools at `/tools` and stores sessions in
`server/data/sessions.json`. File writes and PowerShell commands can require
approval, and file changes create backups available through `/changes`.
The AI connection intentionally remains the ChatGPT web bridge.

## Security

⚠️ This executes arbitrary PowerShell on your machine. Only use it with
ChatGPT conversations you control, and keep `autoEnabled` off when you
don't want commands to run automatically. The server only runs locally
and only accepts requests from your browser.
