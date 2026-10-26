import multer from 'multer';
import { AppError } from './errorHandler.js';

// Hard ceiling for what is buffered at all; the configurable limit (max_upload_mb, FR-034) is
// checked afterwards in DocumentService.validateFile().
const HARD_LIMIT_BYTES = 20 * 1024 * 1024;

const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: HARD_LIMIT_BYTES, files: 1, fields: 10 },
}).single('file');

/** Parses a single "file" field; turns multer errors into readable messages (NFR-009). */
export function singleFileUpload(req, res, next) {
  parser(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? `The file is too large. The maximum size is ${HARD_LIMIT_BYTES / (1024 * 1024)} MB.`
          : 'Upload exactly one file in the "file" field.';
      return next(new AppError(err.code === 'LIMIT_FILE_SIZE' ? 422 : 400, 'INVALID_UPLOAD', message, { file: message }));
    }
    next(err);
  });
}
