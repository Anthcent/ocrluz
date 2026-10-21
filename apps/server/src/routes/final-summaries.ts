import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import type { AppContext } from '../context.js';
import { HttpError, notFound } from '../lib/http-error.js';
import { currentUser } from '../middleware/auth.js';
import { COURSE_YEARS, emptySummary, finalSummarySchema, summaryTitle, type FinalSummary } from '../services/final-summary/model.js';
import { parseFinalSummaryPage } from '../services/final-summary/parse.js';
import { buildFinalSummaryXlsx, finalSummaryFileName } from '../services/final-summary/xlsx.js';
import { languageCodes } from '../services/languages.js';
import { ocrSpaceWithLayout } from '../services/ocr/ocrspace.js';
import { getApiKey, loadSettingsRow } from '../services/settings.js';
import { upload } from './ocr.js';

const idParam = z.coerce.number().int().positive();
const COLUMNS = `id, title, data, created_at AS "createdAt", updated_at AS "updatedAt"`;
type Row = { id: number; title: string; data: string; createdAt: string; updatedAt: string };
const parseRow = (row: Row) => ({ ...row, summary: JSON.parse(row.data) as FinalSummary, data: undefined });

export function finalSummariesRouter(ctx: AppContext) {
  const router = Router();

  const find = async (userId: number, id: number) => {
    const row = await ctx.db.one<Row>(`SELECT ${COLUMNS} FROM final_summaries WHERE id = ? AND user_id = ?`, [id, userId]);
    if (!row) throw notFound('Resumen final');
    return parseRow(row);
  };

  /** Institution, director and plan rarely change: new summaries start from the latest one. */
  const withDefaults = async (userId: number, summary: FinalSummary) => {
    const last = await ctx.db.one<{ data: string }>('SELECT data FROM final_summaries WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1', [userId]);
    if (!last) return summary;
    const previous = JSON.parse(last.data) as FinalSummary;
    const fill = <T extends Record<string, string>>(current: T, fallback: T) =>
      Object.fromEntries(Object.entries(current).map(([k, v]) => [k, v || fallback[k] || ''])) as T;
    summary.institution = fill(summary.institution, previous.institution);
    summary.course = { ...summary.course, plan: summary.course.plan || previous.course.plan, planCode: summary.course.planCode || previous.course.planCode };
    summary.schoolYear ||= previous.schoolYear;
    summary.monthYear ||= previous.monthYear;
    summary.remissionDate ||= previous.remissionDate;
    return summary;
  };

  router.get('/', async (req, res) => {
    const rows = await ctx.db.query<Row>(`SELECT ${COLUMNS} FROM final_summaries WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 300`, [
      currentUser(req).id,
    ]);
    res.json({
      summaries: rows.map((row) => {
        const s = JSON.parse(row.data) as FinalSummary;
        return {
          id: row.id,
          title: row.title,
          evaluationType: s.evaluationType,
          schoolYear: s.schoolYear,
          course: s.course,
          students: s.students.length,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      }),
    });
  });

  router.get('/new', async (req, res) => {
    const year = z.enum(COURSE_YEARS).catch('PRIMERO').parse(req.query.year);
    res.json({ summary: await withDefaults(currentUser(req).id, emptySummary(year)) });
  });

  router.post(
    '/scan',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 20,
      keyGenerator: (req) => String(currentUser(req).id),
      message: { error: 'Estás escaneando muy rápido, espera un momento', code: 'rate_limited' },
    }),
    upload.single('image'),
    async (req, res) => {
      const userId = currentUser(req).id;
      if (!req.file) throw new HttpError(400, 'Falta la imagen', 'upload');
      const settings = await loadSettingsRow(ctx, userId);
      const language = z.enum(languageCodes).catch(settings.ocr_language as (typeof languageCodes)[number]).parse(req.body?.language);
      const started = Date.now();
      const { text, words } = await ocrSpaceWithLayout(req.file.buffer, req.file.mimetype, await getApiKey(ctx, userId, 'ocrspace'), language);
      const { summary, warnings } = parseFinalSummaryPage(text, words);
      res.json({ summary: await withDefaults(userId, summary), warnings, words: words.length, ms: Date.now() - started });
    },
  );

  /** Same parser for pages read on the device (Tesseract) when OCR.space is not available. */
  router.post('/parse', async (req, res) => {
    const userId = currentUser(req).id;
    const word = z.object({ text: z.string().max(100), left: z.number().finite(), top: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() });
    const { text, words } = z.object({ text: z.string().max(50_000).default(''), words: z.array(word).max(8000) }).parse(req.body);
    const { summary, warnings } = parseFinalSummaryPage(text, words);
    res.json({ summary: await withDefaults(userId, summary), warnings, words: words.length });
  });

  router.post('/', async (req, res) => {
    const userId = currentUser(req).id;
    const summary = finalSummarySchema.parse(req.body?.summary);
    const row = await ctx.db.one<Row>(`INSERT INTO final_summaries (user_id, title, data) VALUES (?, ?, ?) RETURNING ${COLUMNS}`, [
      userId,
      summaryTitle(summary),
      JSON.stringify(summary),
    ]);
    res.status(201).json(parseRow(row!));
  });

  router.get('/:id', async (req, res) => {
    res.json(await find(currentUser(req).id, idParam.parse(req.params.id)));
  });

  router.put('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await find(userId, id);
    const summary = finalSummarySchema.parse(req.body?.summary);
    await ctx.db.run('UPDATE final_summaries SET title = ?, data = ?, updated_at = now() WHERE id = ? AND user_id = ?', [
      summaryTitle(summary),
      JSON.stringify(summary),
      id,
      userId,
    ]);
    res.json(await find(userId, id));
  });

  router.delete('/:id', async (req, res) => {
    const userId = currentUser(req).id;
    const id = idParam.parse(req.params.id);
    await find(userId, id);
    await ctx.db.run('DELETE FROM final_summaries WHERE id = ? AND user_id = ?', [id, userId]);
    res.status(204).end();
  });

  router.get('/:id/xlsx', async (req, res) => {
    const { summary } = await find(currentUser(req).id, idParam.parse(req.params.id));
    const file = buildFinalSummaryXlsx(summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${finalSummaryFileName(summary)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.end(Buffer.from(file));
  });

  return router;
}
