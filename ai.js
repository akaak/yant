import Anthropic from '@anthropic-ai/sdk';

let client = null;

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable not set');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export async function summarizeMeetingNotes(notesContent) {
  const anthropic = getClient();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `You are a helpful assistant that summarizes meeting notes.

Below are raw meeting notes. Please provide a concise summary that includes:
- **Key Decisions** (if any)
- **Action Items** (if any, with owner if mentioned)
- **Main Discussion Points** (2-4 bullet points)

Keep the summary tight and useful. Do not pad it. If there are no decisions or action items, omit those sections.

---
${notesContent}
---

Provide only the summary, no preamble.`
      }
    ]
  });

  return response.content[0].text;
}
