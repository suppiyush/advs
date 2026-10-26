/** Parses req[source] with a zod schema and replaces it with the parsed value. */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.parse(req[source] ?? {});
    if (source === 'query') {
      // req.query is a read-only getter in Express 5
      req.validatedQuery = parsed;
    } else {
      req[source] = parsed;
    }
    next();
  };
}
