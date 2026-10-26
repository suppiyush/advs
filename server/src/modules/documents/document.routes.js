import { once } from 'node:events';
import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { AppError } from '../../middleware/errorHandler.js';
import { validate } from '../../middleware/validate.js';
import { documentIdSchema, fileQuerySchema } from './document.schemas.js';
import { getDocument, getDocumentFile } from './document.service.js';

const router = Router();

// Who may see a document is decided per document in DocumentService (owner, category verifier, admin).
router.use(requireAuth);

router.get('/:id', validate(documentIdSchema, 'params'), async (req, res) => {
  res.json({ document: await getDocument(req.user, Number(req.params.id)) });
});

router.get('/:id/file', validate(documentIdSchema, 'params'), validate(fileQuerySchema, 'query'), async (req, res) => {
  const file = await getDocumentFile(req.user, Number(req.params.id), req.validatedQuery.version);
  try {
    await once(file.stream, 'open');
  } catch {
    throw new AppError(404, 'FILE_MISSING', 'The stored file could not be found. Please contact the admission office.');
  }
  res.set({
    'Content-Type': file.mimeType,
    'Content-Length': String(file.sizeBytes),
    // inline: PDFs and images open in the browser / the verifier's preview
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, no-store',
  });
  file.stream.on('error', (err) => res.destroy(err));
  file.stream.pipe(res);
});

export default router;
