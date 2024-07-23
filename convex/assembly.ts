import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  ActionCtx,
} from "./_generated/server";

const ASSEMBLY_API_KEY = process.env.ASSEMBLY_API_KEY!;

interface TranscriptionResponse {
  id: string;
  status: string;
  text?: string;
}

async function makeRequest(
  ctx: ActionCtx,
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`);
  }

  return response.json();
}

export const doTranscribe = internalAction({
  args: {
    fileUrl: v.string(),
    noteId: v.id("notes"),
  },
  handler: async (ctx, args) => {
    const { fileUrl, noteId } = args;

    const data = (await makeRequest(
      ctx,
      "https://api.assemblyai.com/v2/transcript",
      "POST",
      {
        Authorization: ASSEMBLY_API_KEY,
        "Content-Type": "application/json",
      },
      JSON.stringify({ audio_url: fileUrl })
    )) as TranscriptionResponse;

    const transcriptId = data.id;

    // Poll for the transcript to be ready
    let transcript = "";
    while (true) {
      const pollData = (await makeRequest(
        ctx,
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        "GET",
        { Authorization: ASSEMBLY_API_KEY }
      )) as TranscriptionResponse;

      if (pollData.status === "completed" && pollData.text) {
        transcript = pollData.text;
        break;
      } else if (pollData.status === "error") {
        throw new Error("Transcription failed");
      } else if (
        pollData.status !== "queued" &&
        pollData.status !== "processing"
      ) {
        throw new Error(`Unexpected transcription status: ${pollData.status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds before polling again
    }

    await ctx.runMutation(internal.assembly.saveTranscript, {
      noteId,
      transcript,
    });
  },
});

export const saveTranscript = internalMutation({
  args: {
    noteId: v.id("notes"),
    transcript: v.string(),
  },
  handler: async (ctx, args) => {
    const { noteId, transcript } = args;

    await ctx.db.patch(noteId, {
      transcription: transcript,
    });
    await ctx.scheduler.runAfter(0, internal.gemini.chat, {
      noteId,
      transcript,
    });
  },
});
