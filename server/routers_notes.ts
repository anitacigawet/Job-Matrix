import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { getApplicationNotes, addApplicationNote, deleteApplicationNote, getApplicationNotesCount } from "./db";

export const notesRouter = router({
  // Get notes for a specific job
  getJobNotes: protectedProcedure
    .input(z.object({ jobId: z.number() }))
    .query(async ({ ctx, input }) => {
      const notes = await getApplicationNotes(ctx.user.id, input.jobId);
      return notes;
    }),

  // Add a note to a job
  addNote: protectedProcedure
    .input(z.object({
      jobId: z.number(),
      noteType: z.enum(["note", "status_change", "interview", "follow_up", "offer", "rejection"]),
      content: z.string().min(1).max(5000),
      oldStatus: z.string().optional(),
      newStatus: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await addApplicationNote({
        userId: ctx.user.id,
        jobId: input.jobId,
        noteType: input.noteType,
        content: input.content,
        oldStatus: input.oldStatus,
        newStatus: input.newStatus,
      });
      return { success: true };
    }),

  // Delete a note
  deleteNote: protectedProcedure
    .input(z.object({ noteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteApplicationNote(ctx.user.id, input.noteId);
      return { success: true };
    }),

  // Get note counts for all applied jobs (for badge display)
  getNoteCounts: protectedProcedure
    .query(async ({ ctx }) => {
      const counts = await getApplicationNotesCount(ctx.user.id);
      const map: Record<number, number> = {};
      for (const row of counts) {
        map[row.jobId] = Number(row.count);
      }
      return map;
    }),
});
