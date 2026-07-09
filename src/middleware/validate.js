const { ValidationError } = require('../utils/errors');

/**
 * Generic Zod validation middleware factory.
 * Validates req.body, req.params, or req.query against a Zod schema.
 *
 * @param {import('zod').ZodSchema} schema - Zod schema to validate against
 * @param {'body' | 'params' | 'query'} source - Request property to validate
 */
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(new ValidationError('Validation failed', details));
    }

    // Replace with parsed (and potentially transformed) data
    req[source] = result.data;
    next();
  };
}

module.exports = { validate };
