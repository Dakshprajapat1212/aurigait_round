const fs = require('fs');
const readline = require('readline');
const path = require('path');

const transcriptPath = '/Users/daksh/.gemini/antigravity/brain/58a38beb-2be9-467f-92d8-a248fd4b7cae/.system_generated/logs/transcript_full.jsonl';
const outputPath = path.resolve(__dirname, '../AI_LOGS.md');

async function exportLogs() {
  if (!fs.existsSync(transcriptPath)) {
    console.error(`Transcript file not found at: ${transcriptPath}`);
    process.exit(1);
  }

  const fileStream = fs.createReadStream(transcriptPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const turns = [];
  let currentTurn = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);

      if (entry.source === 'USER_EXPLICIT' && entry.type === 'USER_INPUT') {
        currentTurn++;
        // Extract raw user content
        let rawContent = entry.content || '';
        // Extract actual user prompt between <USER_REQUEST> tags if present
        const match = rawContent.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        const promptText = match ? match[1].trim() : rawContent.trim();

        turns.push({
          turn: currentTurn,
          role: 'USER',
          timestamp: entry.created_at,
          content: promptText,
        });
      } else if (entry.source === 'MODEL' && entry.type === 'PLANNER_RESPONSE' && entry.content) {
        turns.push({
          turn: currentTurn,
          role: 'ASSISTANT',
          timestamp: entry.created_at,
          content: entry.content.trim(),
        });
      }
    } catch (err) {
      console.error('Error parsing line:', err);
    }
  }

  let markdown = `# AI Pair Programming Logs\n\n`;
  markdown += `*This document is an authentic, unmodified log of the complete interaction between the candidate and the AI assistant during the Auriga IT Round 2 - Builder assessment.*\n\n`;
  markdown += `---\n\n`;

  for (const item of turns) {
    markdown += `### ${item.role} (Turn ${item.turn}) [${item.timestamp}]\n\n`;
    markdown += `${item.content}\n\n`;
    markdown += `---\n\n`;
  }

  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`Successfully exported ${turns.length} messages to ${outputPath}`);
}

exportLogs().catch((err) => {
  console.error('Failed to export AI logs:', err);
  process.exit(1);
});
